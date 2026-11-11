import { getServiceClient } from "@/lib/db/server";
import { ORDER_FILES_BUCKET, toObjectKey } from "./paths";

/** O7 (open, default): files are kept 7 days after the order ends. Pending uploads: 24 hours. */
export const FILE_RETENTION_DAYS = 7;
export const PENDING_MAX_AGE_HOURS = 24;

const TERMINAL = ["completed", "rejected", "cancelled", "expired"];
const BATCH = 100;
const FILE_PAGE = 500;
const MAX_PAGES = 100; // a safety stop, not an expected limit

export type CleanupResult = { orderFilesDeleted: number; pendingDeleted: number };

/**
 * Deletes our stored copies (not copies a shop already downloaded):
 * 1. files of orders that ended more than 7 days ago, then marks the rows `deleted_at`;
 * 2. `pending/` uploads older than 24 hours that never became part of an order.
 * Safe to run again at any time: it only looks at finished orders and old pending files, removing
 * a file that is already gone is not an error, and a row is marked only after Storage removed it.
 * Orders that are not finished are never touched, and a pending path that an order row still
 * points at is never deleted.
 */
export async function cleanupFiles(now: Date): Promise<CleanupResult> {
  return {
    orderFilesDeleted: await cleanupOrderFiles(now),
    pendingDeleted: await cleanupPending(now),
  };
}

async function remove(keys: string[]): Promise<void> {
  const { error } = await getServiceClient().storage.from(ORDER_FILES_BUCKET).remove(keys);
  if (error) throw new Error("Storage could not remove files");
}

async function cleanupOrderFiles(now: Date): Promise<number> {
  const db = getServiceClient();
  const cutoff = new Date(now.getTime() - FILE_RETENTION_DAYS * 24 * 3600_000).toISOString();

  // Walk the files that still exist, page by page (by id), and ask which of their orders ended
  // long enough ago. Paging this way means no query ever has to return every old order at once.
  let deleted = 0;
  let lastId = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const files = await db
      .from("order_files")
      .select("id, order_id, storage_path")
      .is("deleted_at", null)
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(FILE_PAGE);
    if (files.error) throw files.error;
    const rows = files.data ?? [];
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id as string;

    const orderIds = [...new Set(rows.map((f) => f.order_id as string))];
    const ended = await db
      .from("orders")
      .select("id")
      .in("id", orderIds)
      .in("status", TERMINAL)
      .lt("updated_at", cutoff);
    if (ended.error) throw ended.error;
    const eligible = new Set((ended.data ?? []).map((o) => o.id as string));

    const due = rows
      .filter((f) => eligible.has(f.order_id as string))
      .map((f) => ({ id: f.id as string, key: toObjectKey(f.storage_path as string) }));
    const keys = due.flatMap((r) => (r.key === null ? [] : [r.key]));
    if (keys.length > 0) await remove(keys);
    if (due.length > 0) {
      const marked = await db
        .from("order_files")
        .update({ deleted_at: now.toISOString() })
        .in(
          "id",
          due.map((r) => r.id),
        );
      if (marked.error) throw marked.error;
      deleted += due.length;
    }
    if (rows.length < FILE_PAGE) break;
  }
  return deleted;
}

async function listAll(prefix: string) {
  const bucket = getServiceClient().storage.from(ORDER_FILES_BUCKET);
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await bucket.list(prefix, { limit: BATCH, offset: page * BATCH });
    if (error) throw new Error("Storage could not list files");
    all.push(...(data ?? []));
    if ((data ?? []).length < BATCH) break;
  }
  return all;
}

const fullPath = (key: string) => `${ORDER_FILES_BUCKET}/${key}`;

async function cleanupPending(now: Date): Promise<number> {
  const cutoff = now.getTime() - PENDING_MAX_AGE_HOURS * 3600_000;
  const stale: string[] = [];

  // pending/{customerId}/{file}: the customer folders show up as entries without an id.
  for (const folder of await listAll("pending")) {
    if (folder.id !== null) continue;
    for (const file of await listAll(`pending/${folder.name}`)) {
      if (file.id === null || file.created_at === null) continue;
      if (new Date(file.created_at).getTime() < cutoff)
        stale.push(`pending/${folder.name}/${file.name}`);
    }
  }

  // Never delete a pending path that an order still points at (e.g. a move that failed halfway).
  const db = getServiceClient();
  const inUse = new Set<string>();
  for (let i = 0; i < stale.length; i += BATCH) {
    const paths = stale.slice(i, i + BATCH).map(fullPath);
    const refs = await db.from("order_files").select("storage_path").in("storage_path", paths);
    if (refs.error) throw refs.error;
    for (const r of refs.data ?? []) inUse.add(r.storage_path as string);
  }
  const toDelete = stale.filter((key) => !inUse.has(fullPath(key)));
  for (let i = 0; i < toDelete.length; i += BATCH) await remove(toDelete.slice(i, i + BATCH));
  return toDelete.length;
}

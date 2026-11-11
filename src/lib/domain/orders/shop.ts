import type { SupabaseClient } from "@supabase/supabase-js";
import { toDb } from "@/lib/db/case";
import { getServiceClient } from "@/lib/db/server";
import {
  ConfirmOrderBody,
  EtaBody,
  OrderRow,
  OrderStatus,
  parseRow,
  type OrderStatus as OrderStatusType,
} from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import { notify } from "@/lib/line/notify";
import { unreadCount, unreadCounts } from "@/lib/domain/chat/unread";
import { loadDetailParts } from "./detail";
import { expireIfDue } from "./expire";
import { checkPickupCode, normalizePickupCode } from "./pickupAttempts";
import { transition } from "./transition";
import {
  presentOrder,
  presentShopOrderDetail,
  type OrderView,
  type ShopOrderDetailView,
} from "./view";
import { z } from "zod";

/** Highest price a shop may set for one order: 100,000 baht (the default of task P6). */
export const MAX_SHOP_PRICE_SATANG = 10_000_000;

export const RejectBody = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "เหตุผลต้องยาวอย่างน้อย 3 ตัวอักษร")
    .max(300, "เหตุผลยาวเกิน 300 ตัวอักษร"),
});
export const CompleteBody = z.object({ pickupCode: z.string().min(1).max(20) });

const invalid = (message: string, details: Record<string, unknown> = {}) =>
  new ApiError("VALIDATION_ERROR", 422, message, details);

/** The shop's own order, or 404: another shop's order looks exactly like a missing one. */
async function readShopOrder(
  db: SupabaseClient,
  shopId: string,
  orderId: string,
): Promise<OrderRow> {
  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError("NOT_FOUND", 404);
  return parseRow(OrderRow, data);
}

/** Reads the order, applies lazy expiry, so an overdue order is never acted on as if it were open. */
async function loadForAction(db: SupabaseClient, shopId: string, orderId: string) {
  return expireIfDue(await readShopOrder(db, shopId, orderId));
}

async function shopName(db: SupabaseClient, shopId: string): Promise<string> {
  const { data, error } = await db.from("shops").select("name").eq("id", shopId).maybeSingle();
  if (error || !data) throw error ?? new ApiError("INTERNAL", 500);
  return data.name as string;
}

async function present(db: SupabaseClient, row: OrderRow): Promise<OrderView> {
  return presentOrder(row, {
    shopName: await shopName(db, row.shopId),
    viewer: "shop",
    unreadMessageCount: await unreadCount(db, row.id, "shop"),
  });
}

/** GET /api/shop/orders?status=a,b: my orders, jobs waiting for an answer first, then newest first. */
export async function listShopOrders(
  shopId: string,
  statusParam: string | null,
): Promise<OrderView[]> {
  const db = getServiceClient();

  let statuses: OrderStatusType[] | null = null;
  if (statusParam !== null && statusParam.trim() !== "") {
    const parsed = z.array(OrderStatus).safeParse(statusParam.split(",").map((s) => s.trim()));
    if (!parsed.success) throw invalid("สถานะที่ระบุไม่ถูกต้อง", { field: "status" });
    statuses = parsed.data;
  }

  let query = db.from("orders").select("*").eq("shop_id", shopId);
  if (statuses) query = query.in("status", statuses);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;

  // Lazy expiry may change a status, so filter again afterwards.
  const rows: OrderRow[] = [];
  for (const raw of data ?? []) {
    const row = await expireIfDue(parseRow(OrderRow, raw));
    if (!statuses || statuses.includes(row.status)) rows.push(row);
  }
  const waiting = rows.filter((r) => r.status === "submitted");
  const others = rows.filter((r) => r.status !== "submitted");

  const name = await shopName(db, shopId);
  const ordered = [...waiting, ...others];
  const unread = await unreadCounts(
    db,
    ordered.map((r) => r.id),
    "shop",
  );
  return ordered.map((r) =>
    presentOrder(r, { shopName: name, viewer: "shop", unreadMessageCount: unread.get(r.id) ?? 0 }),
  );
}

/** GET /api/shop/orders/:id: OrderDetail without the pickup code and the recipient's name/phone. */
export async function getShopOrderDetail(
  shopId: string,
  orderId: string,
): Promise<ShopOrderDetailView> {
  const db = getServiceClient();
  const row = await loadForAction(db, shopId, orderId);
  return presentShopOrderDetail(row, await loadDetailParts(db, row), {
    unreadMessageCount: await unreadCount(db, row.id, "shop"),
  });
}

/**
 * POST .../confirm. The status change, the fee, the total and the payment deadline are all done by
 * `transition()`; this only checks who may call it and that the price is sensible.
 */
export async function confirmOrder(
  shopId: string,
  orderId: string,
  rawBody: unknown,
): Promise<OrderView> {
  const body = ConfirmOrderBody.parse(rawBody);
  if (body.printSubtotalSatang !== undefined && body.printSubtotalSatang > MAX_SHOP_PRICE_SATANG) {
    throw invalid("ราคาสูงสุด 100,000 บาท", { field: "printSubtotalSatang" });
  }
  const db = getServiceClient();
  await loadForAction(db, shopId, orderId);
  const updated = await transition({
    orderId,
    from: "submitted",
    to: "awaiting_payment",
    actor: "shop",
    patch: {
      printSubtotalSatang: body.printSubtotalSatang,
      readyInMinutes: body.readyInMinutes,
      estimatedReadyAt: body.estimatedReadyAt,
      readyNote: body.readyNote,
    },
  });
  return present(db, updated);
}

/** Short Thai text for the system chat message, in Thai time (no year, to avoid the Buddhist year). */
function thaiTime(iso: string): string {
  return `${new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })} น.`;
}

/**
 * POST .../eta (D19): change the ready time of a paid or printing order. This is not a status
 * change, so it does not go through `transition()`, but the update only applies while the order is
 * still `paid` or `printing`. `ready_in_minutes` is left as it was; a note that is not sent is kept.
 */
export async function changeEta(
  shopId: string,
  orderId: string,
  rawBody: unknown,
): Promise<OrderView> {
  const body = EtaBody.parse(rawBody);
  const at = new Date(body.estimatedReadyAt);
  if (at.getTime() <= Date.now()) {
    throw invalid("เวลาเสร็จต้องอยู่ในอนาคต", { field: "estimatedReadyAt" });
  }
  const db = getServiceClient();
  const current = await loadForAction(db, shopId, orderId);
  if (current.status !== "paid" && current.status !== "printing") {
    throw new ApiError("ORDER_INVALID_TRANSITION", 409, undefined, {
      currentStatus: current.status,
    });
  }

  const values = toDb({
    estimatedReadyAt: at.toISOString(),
    ...(body.readyNote !== undefined ? { readyNote: body.readyNote } : {}),
    updatedAt: new Date().toISOString(),
  });
  // `values` holds only estimatedReadyAt, readyNote and updatedAt: never the status.
  const { data, error } = await db
    .from("orders")
    .update(values)
    .eq("id", orderId)
    .eq("shop_id", shopId)
    .in("status", ["paid", "printing"])
    .select()
    .maybeSingle();
  if (error) {
    console.error(`[eta] update failed for order ${orderId} (db code ${error.code})`);
    throw new ApiError("INTERNAL", 500);
  }
  if (!data) {
    const fresh = await readShopOrder(db, shopId, orderId);
    throw new ApiError("ORDER_INVALID_TRANSITION", 409, undefined, { currentStatus: fresh.status });
  }
  const updated = parseRow(OrderRow, data);

  // Tell the customer; neither step may undo the change if it fails.
  try {
    const chat = await db.from("messages").insert({
      order_id: orderId,
      sender: "system",
      body: `ร้านปรับเวลาเสร็จเป็น ${thaiTime(body.estimatedReadyAt)}${body.readyNote ? ` (${body.readyNote})` : ""}`,
    });
    if (chat.error) throw new Error("could not write the chat message");
  } catch (err) {
    console.error(
      `[eta] chat message failed for order ${orderId}: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
  try {
    await notify(orderId, "eta_changed");
  } catch (err) {
    console.error(
      `[eta] notify failed for order ${orderId}: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
  return present(db, updated);
}

/** POST .../reject: before payment from `submitted`; after payment from `paid`/`printing` (refund by P2). */
export async function rejectOrder(
  shopId: string,
  orderId: string,
  rawBody: unknown,
): Promise<OrderView> {
  const { reason } = RejectBody.parse(rawBody);
  const db = getServiceClient();
  const row = await loadForAction(db, shopId, orderId);
  const from: OrderStatusType[] = row.status === "submitted" ? ["submitted"] : ["paid", "printing"];
  const updated = await transition({
    orderId,
    from,
    to: "rejected",
    actor: "shop",
    patch: { rejectReason: reason },
  });
  return present(db, updated);
}

/** POST .../start-printing: paid -> printing. */
export async function startPrinting(shopId: string, orderId: string): Promise<OrderView> {
  const db = getServiceClient();
  await loadForAction(db, shopId, orderId);
  return present(db, await transition({ orderId, from: "paid", to: "printing", actor: "shop" }));
}

/**
 * POST .../mark-ready: printing -> ready. A delivery order is then handed on at once
 * (ready -> courier_requested, by the system) so the admin sees the job. If that second step fails
 * the shop's own work is done: the order stays `ready` and the admin can request the courier.
 */
export async function markReady(shopId: string, orderId: string): Promise<OrderView> {
  const db = getServiceClient();
  await loadForAction(db, shopId, orderId);
  let row = await transition({ orderId, from: "printing", to: "ready", actor: "shop" });

  if (row.fulfillment === "delivery") {
    try {
      row = await transition({ orderId, from: "ready", to: "courier_requested", actor: "system" });
    } catch (err) {
      // The courier step may have changed the status before it failed: report what is stored.
      console.error(
        `[mark-ready] courier step failed for order ${orderId}: ${err instanceof Error ? err.message : "unknown"}`,
      );
      row = await readShopOrder(db, shopId, orderId);
    }
  }
  return present(db, row);
}

/**
 * POST .../complete {pickupCode}: the customer says the code at the counter and the shop types it.
 * Only for a pickup order that is `ready`. Wrong code -> 422; more than 5 tries in 10 minutes ->
 * RATE_LIMITED. The code is never returned or logged.
 */
export async function completePickup(
  shopId: string,
  orderId: string,
  rawBody: unknown,
): Promise<OrderView> {
  const { pickupCode } = CompleteBody.parse(rawBody);
  const db = getServiceClient();
  const row = await loadForAction(db, shopId, orderId);

  // Wrong state or a delivery order: a plain 409, and no try is counted.
  if (row.status !== "ready" || row.fulfillment !== "pickup" || row.pickupCode === null) {
    throw new ApiError("ORDER_INVALID_TRANSITION", 409, undefined, { currentStatus: row.status });
  }
  if (!(await checkPickupCode(db, orderId, normalizePickupCode(pickupCode), row.pickupCode))) {
    throw invalid("รหัสรับงานไม่ถูกต้อง", { field: "pickupCode" });
  }
  return present(db, await transition({ orderId, from: "ready", to: "completed", actor: "shop" }));
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { FakeSupabase } from "@/lib/domain/testing/fakeSupabase";
import { POST as cleanupRoute } from "@/app/api/cron/cleanup-files/route";
import { POST as signRoute } from "@/app/api/liff/uploads/sign/route";
import { GET as urlRoute } from "@/app/api/shop/orders/[id]/files/[fileId]/url/route";
import { cleanupFiles } from "./cleanup";

const h = vi.hoisted(() => ({
  db: null as unknown,
  requireCustomer: vi.fn(),
  requireShop: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({ getServiceClient: () => h.db }));
vi.mock("@/lib/auth", () => ({
  requireCustomer: h.requireCustomer,
  requireShop: h.requireShop,
}));

const NOW = new Date("2026-11-12T03:00:00.000Z");
const CUSTOMER = "22222222-2222-4222-8222-222222222222";
const SHOP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHOP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORDER = "33333333-3333-4333-8333-333333333333";
const OTHER_ORDER = "44444444-4444-4444-8444-444444444444";
const FILE = "55555555-5555-4555-8555-555555555555";

let db: FakeSupabase;
beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  db = new FakeSupabase();
  h.db = db;
  h.requireCustomer.mockReset().mockResolvedValue({ customerId: CUSTOMER, lineUserId: "u" });
  h.requireShop.mockReset().mockResolvedValue({ authUserId: "a", shopId: SHOP_A });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const post = (body: unknown, raw = false) =>
  new Request("http://localhost/api/liff/uploads/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
const pdf = (name = "a.pdf", sizeBytes = 1000) => ({ name, mime: "application/pdf", sizeBytes });

describe("POST /api/liff/uploads/sign", () => {
  it("signs one URL per file under the customer's pending folder", async () => {
    const res = await signRoute(
      post({ files: [pdf("a.pdf"), { name: "b.png", mime: "image/png", sizeBytes: 5 }] }),
      undefined as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    for (const item of body) {
      expect(Object.keys(item).sort()).toEqual(["path", "token", "uploadUrl"]);
      expect(item.path).toMatch(new RegExp(`^order-files/pending/${CUSTOMER}/[0-9a-f-]{36}-`));
      expect(item.uploadUrl).toContain("/upload/sign/order-files/");
    }
    expect(body[0].path.endsWith(".pdf")).toBe(true);
    expect(body[1].path.endsWith(".png")).toBe(true);
    expect(body[0].path).not.toBe(body[1].path);
  });

  it("uses the logged-in customer, not an id from the body", async () => {
    const res = await signRoute(post({ customerId: "evil", files: [pdf()] }), undefined as never);
    const [item] = await res.json();
    expect(item.path).toContain(`/pending/${CUSTOMER}/`);
    expect(item.path).not.toContain("evil");
  });

  it("makes a safe path from a hostile or Thai name", async () => {
    const res = await signRoute(
      post({ files: [pdf("../../etc/passwd"), pdf("รายงาน.pdf")] }),
      undefined as never,
    );
    const [a, b] = await res.json();
    expect(a.path).toMatch(/\/[0-9a-f-]{36}-passwd\.pdf$/);
    expect(b.path).toMatch(/\/[0-9a-f-]{36}-file\.pdf$/);
    expect(a.path).not.toContain("..");
  });

  it("accepts 10 files of exactly 20 MB and rejects 11 files", async () => {
    const edge = pdf("a.pdf", 20 * 1024 * 1024);
    expect(
      (await signRoute(post({ files: Array(10).fill(edge) }), undefined as never)).status,
    ).toBe(200);
    const res = await signRoute(post({ files: Array(11).fill(pdf()) }), undefined as never);
    expect(res.status).toBe(422);
  });

  it("rejects a file over 20 MB, an empty file, a wrong type and an empty list", async () => {
    const bad = [
      { files: [pdf("a.pdf", 20 * 1024 * 1024 + 1)] },
      { files: [pdf("a.pdf", 0)] },
      { files: [pdf("a.pdf", 1.5)] },
      {
        files: [
          {
            name: "a.docx",
            mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: 10,
          },
        ],
      },
      { files: [{ name: "a.html", mime: "text/html", sizeBytes: 10 }] },
      { files: [] },
      { files: [pdf("")] },
      {},
    ];
    for (const body of bad) {
      const res = await signRoute(post(body), undefined as never);
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect((await signRoute(post("not json", true), undefined as never)).status).toBe(422);
  });

  it("needs a customer login and signs nothing without one", async () => {
    h.requireCustomer.mockRejectedValue(new ApiError("UNAUTHENTICATED", 401));
    const res = await signRoute(post({ files: [pdf()] }), undefined as never);
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it("a Storage failure is a plain 500 without details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.storageFailures.add("createSignedUploadUrl");
    const res = await signRoute(post({ files: [pdf()] }), undefined as never);
    expect(res.status).toBe(500);
    expect((await res.json()).error.details).toEqual({});
  });
});

// ---------------------------------------------------------------------------------------------
const key = (orderId: string) => `${orderId}/${FILE}-a.pdf`;
function seedFile(over: { shop?: string; deletedAt?: string | null; orderId?: string } = {}) {
  const orderId = over.orderId ?? ORDER;
  db.rows("orders").push({ id: orderId, shop_id: over.shop ?? SHOP_A, status: "submitted" });
  db.rows("order_files").push({
    id: FILE,
    order_id: orderId,
    storage_path: `order-files/${key(orderId)}`,
    original_name: "รายงาน เดือน.pdf",
    deleted_at: over.deletedAt ?? null,
  });
  db.put("order-files", key(orderId));
}
const getUrl = (query = "", orderId = ORDER, fileId = FILE) =>
  urlRoute(new Request(`http://localhost/x${query}`), {
    params: Promise.resolve({ id: orderId, fileId }),
  });

describe("GET /api/shop/orders/:id/files/:fileId/url", () => {
  it("gives the owner shop a 5 minute signed URL to view the file", async () => {
    seedFile();
    const res = await getUrl();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expiresInSeconds).toBe(300);
    expect(body.url).toContain("/object/sign/order-files/");
    expect(body.url).not.toContain("download=");
    expect(db.log.find((l) => l.op === "createSignedUrl")?.args).toEqual({
      expiresIn: 300,
      options: undefined,
    });
  });

  it("?mode=download asks Storage for an attachment named after the original file", async () => {
    seedFile();
    const body = await (await getUrl("?mode=download")).json();
    expect(body.url).toContain(`download=${encodeURIComponent("รายงาน เดือน.pdf")}`);
  });

  it("another shop gets 404, same as a missing order", async () => {
    seedFile({ shop: SHOP_B });
    const other = await getUrl();
    const missing = await getUrl("", "66666666-6666-4666-8666-666666666666");
    expect(other.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await other.json()).toEqual(await missing.json());
    expect(db.log.some((l) => l.op === "createSignedUrl")).toBe(false);
  });

  it("a file whose path points into another order's folder is 404 (second line of defence)", async () => {
    seedFile();
    db.rows("order_files")[0].storage_path = `order-files/${OTHER_ORDER}/x.pdf`;
    db.put("order-files", `${OTHER_ORDER}/x.pdf`);
    expect((await getUrl()).status).toBe(404);
    expect(db.log.some((l) => l.op === "createSignedUrl")).toBe(false);
  });

  it("a deleted file is 404", async () => {
    seedFile({ deletedAt: NOW.toISOString() });
    expect((await getUrl()).status).toBe(404);
  });

  it("a file id that belongs to a different order is 404", async () => {
    seedFile();
    db.rows("orders").push({ id: OTHER_ORDER, shop_id: SHOP_A, status: "submitted" });
    expect((await getUrl("", OTHER_ORDER)).status).toBe(404);
  });

  it("bad ids are 404 and a bad mode is 422", async () => {
    seedFile();
    expect((await getUrl("", "nope")).status).toBe(404);
    expect((await getUrl("", ORDER, "nope")).status).toBe(404);
    expect((await getUrl("?mode=edit")).status).toBe(422);
  });

  it("needs a shop login", async () => {
    seedFile();
    h.requireShop.mockRejectedValue(new ApiError("FORBIDDEN", 403));
    expect((await getUrl()).status).toBe(403);
    expect(db.log).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3600_000).toISOString();
function seedOrderWithFile(id: string, status: string, updatedAt: string, fileKey: string) {
  db.rows("orders").push({ id, shop_id: SHOP_A, status, updated_at: updatedAt });
  db.rows("order_files").push({
    id: `file-of-${id}`,
    order_id: id,
    storage_path: `order-files/${fileKey}`,
    original_name: "a.pdf",
    deleted_at: null,
  });
  db.put("order-files", fileKey);
}
const deletedAt = (orderId: string) =>
  db.rows("order_files").find((f) => f.order_id === orderId)?.deleted_at;

describe("cleanupFiles", () => {
  it("deletes files of orders finished more than 7 days ago and marks the rows", async () => {
    for (const status of ["completed", "rejected", "cancelled", "expired"]) {
      seedOrderWithFile(`old-${status}`, status, daysAgo(8), `old-${status}/f.pdf`);
    }
    const result = await cleanupFiles(NOW);
    expect(result).toEqual({ orderFilesDeleted: 4, pendingDeleted: 0 });
    expect(db.objects("order-files").size).toBe(0);
    for (const status of ["completed", "rejected", "cancelled", "expired"]) {
      expect(deletedAt(`old-${status}`)).toBe(NOW.toISOString());
    }
  });

  it("does not touch recent finished orders or orders that are not finished", async () => {
    seedOrderWithFile("recent", "completed", daysAgo(6), "recent/f.pdf");
    for (const status of [
      "submitted",
      "awaiting_payment",
      "paid",
      "printing",
      "ready",
      "courier_requested",
      "in_transit",
    ]) {
      seedOrderWithFile(`open-${status}`, status, daysAgo(60), `open-${status}/f.pdf`);
    }
    const result = await cleanupFiles(NOW);
    expect(result.orderFilesDeleted).toBe(0);
    expect(db.objects("order-files").size).toBe(8);
    expect(db.rows("order_files").every((f) => f.deleted_at === null)).toBe(true);
  });

  it("deletes pending uploads older than 24 hours and keeps newer ones", async () => {
    const old = new Date(NOW.getTime() - 25 * 3600_000).toISOString();
    const fresh = new Date(NOW.getTime() - 23 * 3600_000).toISOString();
    db.put("order-files", `pending/${CUSTOMER}/old.pdf`, { createdAt: old });
    db.put("order-files", `pending/${CUSTOMER}/fresh.pdf`, { createdAt: fresh });
    db.put("order-files", `pending/other-customer/old2.pdf`, { createdAt: old });
    db.put("order-files", `${ORDER}/attached.pdf`, { createdAt: old }); // belongs to an order folder
    const result = await cleanupFiles(NOW);
    expect(result.pendingDeleted).toBe(2);
    expect([...db.objects("order-files").keys()].sort()).toEqual(
      [`pending/${CUSTOMER}/fresh.pdf`, `${ORDER}/attached.pdf`].sort(),
    );
  });

  it("never deletes a pending file that an order row still points at", async () => {
    const old = daysAgo(3);
    db.put("order-files", `pending/${CUSTOMER}/kept.pdf`, { createdAt: old });
    db.put("order-files", `pending/${CUSTOMER}/gone.pdf`, { createdAt: old });
    db.rows("orders").push({ id: ORDER, shop_id: SHOP_A, status: "submitted", updated_at: old });
    db.rows("order_files").push({
      id: FILE,
      order_id: ORDER,
      storage_path: `order-files/pending/${CUSTOMER}/kept.pdf`,
      original_name: "a.pdf",
      deleted_at: null,
    });
    const result = await cleanupFiles(NOW);
    expect(result.pendingDeleted).toBe(1);
    expect([...db.objects("order-files").keys()]).toEqual([`pending/${CUSTOMER}/kept.pdf`]);
  });

  it("handles more files than one page (paging), without touching unfinished orders", async () => {
    db.rows("orders").push({
      id: "old",
      shop_id: SHOP_A,
      status: "completed",
      updated_at: daysAgo(9),
    });
    db.rows("orders").push({
      id: "live",
      shop_id: SHOP_A,
      status: "printing",
      updated_at: daysAgo(9),
    });
    for (let i = 0; i < 1100; i++) {
      const orderId = i % 2 === 0 ? "old" : "live";
      db.rows("order_files").push({
        id: `f-${String(i).padStart(5, "0")}`,
        order_id: orderId,
        storage_path: `order-files/${orderId}/f${i}.pdf`,
        original_name: "a.pdf",
        deleted_at: null,
      });
      db.put("order-files", `${orderId}/f${i}.pdf`);
    }
    const result = await cleanupFiles(NOW);
    expect(result.orderFilesDeleted).toBe(550);
    expect(db.rows("order_files").filter((f) => f.deleted_at === null)).toHaveLength(550);
    expect(
      db
        .rows("order_files")
        .filter((f) => f.deleted_at === null)
        .every((f) => f.order_id === "live"),
    ).toBe(true);
    expect(db.objects("order-files").size).toBe(550);
  });

  it("can run again: nothing more to delete, no error", async () => {
    seedOrderWithFile("old", "completed", daysAgo(8), "old/f.pdf");
    db.put("order-files", `pending/${CUSTOMER}/old.pdf`, { createdAt: daysAgo(3) });
    expect(await cleanupFiles(NOW)).toEqual({ orderFilesDeleted: 1, pendingDeleted: 1 });
    expect(await cleanupFiles(NOW)).toEqual({ orderFilesDeleted: 0, pendingDeleted: 0 });
  });

  it("copes with a file that is already gone from Storage", async () => {
    seedOrderWithFile("old", "completed", daysAgo(8), "old/f.pdf");
    db.objects("order-files").clear();
    expect((await cleanupFiles(NOW)).orderFilesDeleted).toBe(1);
    expect(deletedAt("old")).toBe(NOW.toISOString());
  });

  it("does not mark a row as deleted when Storage failed to remove the file", async () => {
    seedOrderWithFile("old", "completed", daysAgo(8), "old/f.pdf");
    db.storageFailures.add("remove");
    await expect(cleanupFiles(NOW)).rejects.toThrow();
    expect(deletedAt("old")).toBeNull();
    expect(db.objects("order-files").size).toBe(1);
  });
});

describe("POST /api/cron/cleanup-files", () => {
  const call = (header?: string) =>
    cleanupRoute(
      new Request("http://localhost/api/cron/cleanup-files", {
        method: "POST",
        headers: header ? { authorization: header } : {},
      }),
      undefined as never,
    );

  it("runs with the right secret and reports counts", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    seedOrderWithFile("old", "completed", daysAgo(8), "old/f.pdf");
    const res = await call("Bearer s3cret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderFilesDeleted: 1, pendingDeleted: 0 });
  });

  it("is closed without the header, with a wrong secret, or when CRON_SECRET is unset", async () => {
    seedOrderWithFile("old", "completed", daysAgo(8), "old/f.pdf");
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call("s3cret-value")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect((await call("Bearer anything")).status).toBe(401);
    expect(db.objects("order-files").size).toBe(1); // nothing was deleted
  });
});

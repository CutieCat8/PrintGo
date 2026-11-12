import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cleanupGet } from "@/app/api/cron/cleanup-files/route";
import { GET as expireGet, POST as expirePost } from "@/app/api/cron/expire-orders/route";
import { FakeSupabase, type Row } from "@/lib/domain/testing/fakeSupabase";
import { transition } from "./transition";
import { SWEEP_MAX_PER_RUN, sweepExpiredOrders } from "./expire";

// FakeSupabase is in memory (not Postgres). notify is a mock, so "the customer got a LINE
// message" is NOT tested here, only that notify is called once per expired order.
const h = vi.hoisted(() => ({ db: null as unknown, notify: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ getServiceClient: () => h.db }));
vi.mock("@/lib/line/notify", () => ({ notify: h.notify }));
vi.mock("@/lib/delivery", () => ({ createDeliveryForOrder: vi.fn() }));

const NOW = new Date("2026-11-12T05:00:00.000Z");
const T = NOW.toISOString();
const before = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const after = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
let db: FakeSupabase;
let n = 0;

function seed(over: Row = {}): Row {
  const row: Row = {
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    created_at: T,
    order_no: `PG-${n}`,
    customer_id: "00000000-0000-4000-8000-0000000000c1",
    shop_id: "00000000-0000-4000-8000-0000000000a1",
    status: "submitted",
    fulfillment: "pickup",
    requires_manual_price: false,
    estimated_print_satang: 12000,
    estimated_services_satang: 0,
    print_subtotal_satang: null,
    platform_fee_satang: null,
    total_satang: null,
    delivery_fee_satang: 0,
    response_deadline: before(1000),
    updated_at: T,
    ...over,
  };
  for (const col of [
    "delivery_address",
    "delivery_lat",
    "delivery_lng",
    "delivery_recipient_name",
    "delivery_recipient_phone",
    "customer_note",
    "reject_reason",
    "payment_deadline",
    "ready_in_minutes",
    "estimated_ready_at",
    "ready_note",
    "pickup_code",
    "paid_at",
    "completed_at",
    "print_subtotal_satang",
    "platform_fee_satang",
    "total_satang",
  ]) {
    row[col] ??= null;
  }
  db.rows("orders").push(row);
  return row;
}
const stored = (o: Row) => db.rows("orders").find((r) => r.id === o.id) as Row;
const awaiting = (over: Row = {}) =>
  seed({
    status: "awaiting_payment",
    print_subtotal_satang: 12000,
    platform_fee_satang: 600,
    total_satang: 12600,
    ready_in_minutes: 30,
    payment_deadline: before(1000),
    ...over,
  });

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  db = new FakeSupabase();
  h.db = db;
  h.notify.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sweepExpiredOrders", () => {
  it("expires an order the shop did not answer and one the customer did not pay, and tells both customers", async () => {
    const waiting = seed({ response_deadline: before(60_000) });
    const unpaid = awaiting({ payment_deadline: before(60_000) });
    const result = await sweepExpiredOrders(NOW);
    expect(result).toEqual({ expired: 2, alreadyChanged: 0, failed: 0 });
    expect(stored(waiting).status).toBe("expired");
    expect(stored(unpaid).status).toBe("expired");
    expect(h.notify).toHaveBeenCalledTimes(2);
    expect(h.notify).toHaveBeenCalledWith(waiting.id, "order_expired");
    expect(h.notify).toHaveBeenCalledWith(unpaid.id, "order_expired");
  });

  it("the boundary: exactly at the deadline it is still open, one millisecond later it is not", async () => {
    const exact = seed({ response_deadline: T });
    const late = seed({ response_deadline: before(1) });
    const exactPay = awaiting({ payment_deadline: T });
    const latePay = awaiting({ payment_deadline: before(1) });
    expect(await sweepExpiredOrders(NOW)).toEqual({ expired: 2, alreadyChanged: 0, failed: 0 });
    expect(stored(exact).status).toBe("submitted");
    expect(stored(exactPay).status).toBe("awaiting_payment");
    expect(stored(late).status).toBe("expired");
    expect(stored(latePay).status).toBe("expired");
  });

  it("leaves open orders alone: before the deadline, no payment deadline, and every other status", async () => {
    const early = seed({ response_deadline: after(60_000) });
    const noDeadline = awaiting({ payment_deadline: null });
    const others = [
      "paid",
      "printing",
      "ready",
      "courier_requested",
      "in_transit",
      "completed",
      "rejected",
      "cancelled",
      "expired",
    ].map((status) =>
      seed({ status, response_deadline: before(9_999_999), payment_deadline: before(9_999_999) }),
    );
    expect(await sweepExpiredOrders(NOW)).toEqual({ expired: 0, alreadyChanged: 0, failed: 0 });
    expect(stored(early).status).toBe("submitted");
    expect(stored(noDeadline).status).toBe("awaiting_payment");
    for (const o of others) expect(stored(o).status).toBe(o.status);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("does not use the answer deadline for an order that already waits for payment", async () => {
    const o = awaiting({ response_deadline: before(9_999_999), payment_deadline: after(60_000) });
    expect((await sweepExpiredOrders(NOW)).expired).toBe(0);
    expect(stored(o).status).toBe("awaiting_payment");
  });

  it("can be run again: the second run finds nothing and tells nobody twice", async () => {
    seed();
    awaiting();
    expect((await sweepExpiredOrders(NOW)).expired).toBe(2);
    expect(await sweepExpiredOrders(NOW)).toEqual({ expired: 0, alreadyChanged: 0, failed: 0 });
    expect(h.notify).toHaveBeenCalledTimes(2);
  });

  it("an empty database is fine", async () => {
    expect(await sweepExpiredOrders(NOW)).toEqual({ expired: 0, alreadyChanged: 0, failed: 0 });
  });

  it("two sweeps at the same moment expire each order once", async () => {
    for (let i = 0; i < 5; i++) seed();
    const [a, b] = await Promise.all([sweepExpiredOrders(NOW), sweepExpiredOrders(NOW)]);
    expect(h.notify).toHaveBeenCalledTimes(5);
    expect(db.rows("orders").every((o) => o.status === "expired")).toBe(true);
    expect(a.failed + b.failed).toBe(0);
  });

  it("a shop confirming at the same moment: exactly one of the two wins, never both", async () => {
    const o = seed({ response_deadline: before(1000) });
    const [, confirm] = await Promise.allSettled([
      sweepExpiredOrders(NOW),
      transition({
        orderId: o.id as string,
        from: "submitted",
        to: "awaiting_payment",
        actor: "shop",
        patch: { readyInMinutes: 30 },
      }),
    ]);
    const status = stored(o).status;
    expect(["expired", "awaiting_payment"]).toContain(status);
    const events = h.notify.mock.calls.map((c) => c[1]);
    if (status === "expired") {
      expect(confirm.status).toBe("rejected"); // the shop was told it is too late
      expect(events).toEqual(["order_expired"]);
    } else {
      expect(confirm.status).toBe("fulfilled");
      expect(events).toEqual(["quote_ready"]); // the confirmation was not overwritten
      expect(stored(o).payment_deadline).not.toBeNull();
    }
  });

  it("a payment arriving at the same moment: the order is paid or expired, never both", async () => {
    const o = awaiting({ payment_deadline: before(1000) });
    const [, pay] = await Promise.allSettled([
      sweepExpiredOrders(NOW),
      transition({
        orderId: o.id as string,
        from: "awaiting_payment",
        to: "paid",
        actor: "system",
      }),
    ]);
    const row = stored(o);
    if (row.status === "expired") {
      expect(pay.status).toBe("rejected");
      expect(row.paid_at).toBeNull();
      expect(row.pickup_code).toBeNull();
      expect(db.rows("settlements")).toHaveLength(0);
    } else {
      expect(row.status).toBe("paid");
      expect(pay.status).toBe("fulfilled");
      expect(db.rows("settlements")).toHaveLength(1);
      expect(h.notify.mock.calls.map((c) => c[1])).toEqual(["payment_verified"]);
    }
  });

  it("an order that changed between the lookup and the update is counted as already changed", async () => {
    const o = seed();
    // Make the lookup see the old row, then change the order before the sweep acts on it.
    const realFrom = db.from.bind(db);
    let changed = false;
    db.from = (table: string) => {
      const query = realFrom(table);
      if (table === "orders" && !changed) {
        const realThen = query.then.bind(query);
        query.then = ((ok: never, bad: never) => {
          changed = true;
          return realThen(ok, bad).then((value: unknown) => {
            stored(o).status = "awaiting_payment"; // the shop confirmed right after we looked
            return value;
          });
        }) as typeof query.then;
      }
      return query;
    };
    const result = await sweepExpiredOrders(NOW);
    expect(result).toEqual({ expired: 0, alreadyChanged: 1, failed: 0 });
    expect(stored(o).status).toBe("awaiting_payment");
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("one failing order does not stop the others, and is counted and tried again next time", async () => {
    const orders = [seed(), seed(), seed()];
    db.failures.set("orders.update", "database trouble");
    expect(await sweepExpiredOrders(NOW)).toEqual({ expired: 0, alreadyChanged: 0, failed: 3 });
    expect(orders.every((o) => stored(o).status === "submitted")).toBe(true);
    db.failures.clear();
    expect(await sweepExpiredOrders(NOW)).toEqual({ expired: 3, alreadyChanged: 0, failed: 0 });
  });

  it("a failing notify does not stop the sweep or undo the expiry", async () => {
    h.notify.mockRejectedValue(new Error("LINE down"));
    const o = seed();
    expect(await sweepExpiredOrders(NOW)).toEqual({ expired: 1, alreadyChanged: 0, failed: 0 });
    expect(stored(o).status).toBe("expired");
  });

  it("does at most 500 per run, over several pages, and the rest in the next run", async () => {
    for (let i = 0; i < 650; i++) seed();
    const first = await sweepExpiredOrders(NOW);
    expect(first.expired).toBe(SWEEP_MAX_PER_RUN);
    expect(db.rows("orders").filter((o) => o.status === "expired")).toHaveLength(500);
    const second = await sweepExpiredOrders(NOW);
    expect(second.expired).toBe(150);
    expect(db.rows("orders").every((o) => o.status === "expired")).toBe(true);
  });

  it("a database error while looking up is reported (not swallowed)", async () => {
    db.failures.set("orders.select", "boom");
    await expect(sweepExpiredOrders(NOW)).rejects.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
describe("/api/cron/expire-orders", () => {
  const request = (method: string, header?: string) =>
    new Request("http://localhost/api/cron/expire-orders", {
      method,
      headers: header ? { authorization: header } : {},
    });
  const call = (handler: typeof expirePost, method: string, header?: string) =>
    handler(request(method, header), undefined as never);

  it("runs the sweep for POST and for GET (Vercel Cron) with the right secret and reports counts", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    seed();
    awaiting();
    const post = await call(expirePost, "POST", "Bearer s3cret-value");
    expect(post.status).toBe(200);
    expect(await post.json()).toEqual({
      expired: 2,
      alreadyChanged: 0,
      failed: 0,
      pickupAttemptsDeleted: 0,
    });
    seed();
    const get = await call(expireGet, "GET", "Bearer s3cret-value");
    expect(get.status).toBe(200);
    expect((await get.json()).expired).toBe(1);
  });

  it("is closed without the header, with a wrong secret, or when CRON_SECRET is not set", async () => {
    const o = seed();
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    for (const [handler, method] of [
      [expirePost, "POST"],
      [expireGet, "GET"],
    ] as const) {
      expect((await call(handler, method)).status).toBe(401);
      expect((await call(handler, method, "Bearer wrong")).status).toBe(401);
      expect((await call(handler, method, "s3cret-value")).status).toBe(401);
    }
    vi.stubEnv("CRON_SECRET", "");
    expect((await call(expirePost, "POST", "Bearer ")).status).toBe(401);
    expect((await call(expireGet, "GET", "Bearer anything")).status).toBe(401);
    expect(stored(o).status).toBe("submitted"); // nothing was touched
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("also removes pickup tries older than a day, and only those", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    const row = (id: string, source: string, createdAt: string) =>
      db.rows("webhook_events").push({ id, source, created_at: createdAt });
    row("pickup:old:1", "pickup_attempt", before(25 * 3600_000));
    row("pickup:old:2", "pickup_attempt", before(48 * 3600_000));
    row("pickup:new:1", "pickup_attempt", before(23 * 3600_000));
    row("line-event-old", "line", before(48 * 3600_000)); // a real webhook record stays
    const res = await call(expirePost, "POST", "Bearer s3cret-value");
    expect((await res.json()).pickupAttemptsDeleted).toBe(2);
    expect(
      db
        .rows("webhook_events")
        .map((r) => r.id)
        .sort(),
    ).toEqual(["line-event-old", "pickup:new:1"]);
  });

  it("a failure of the tidy-up does not fail the sweep", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    db.failures.set("webhook_events.delete", "boom");
    const o = seed();
    const res = await call(expirePost, "POST", "Bearer s3cret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ expired: 1, pickupAttemptsDeleted: 0 });
    expect(stored(o).status).toBe("expired");
  });

  it("cleanup-files answers GET too, with the same secret check", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    const ok = await cleanupGet(request("GET", "Bearer s3cret-value"), undefined as never);
    expect(ok.status).toBe(200);
    expect(Object.keys(await ok.json()).sort()).toEqual(["orderFilesDeleted", "pendingDeleted"]);
    expect((await cleanupGet(request("GET"), undefined as never)).status).toBe(401);
  });
});

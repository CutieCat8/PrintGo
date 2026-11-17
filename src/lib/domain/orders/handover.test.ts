import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderRow, parseRow } from "@/lib/db/types";
import { FakeSupabase, type Row } from "@/lib/domain/testing/fakeSupabase";
import { bangkokDayStart, getShopEarnings } from "@/lib/domain/shops/earnings";
import { receiveCustomerOrder } from "./customer";
import { autoReceiveDue, expireIfDue, sweepExpiredOrders } from "./expire";
import { HANDOVER_CONFIRM_MINUTES } from "./handover";

const h = vi.hoisted(() => ({ db: null as unknown, notify: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ getServiceClient: () => h.db }));
vi.mock("@/lib/line/notify", () => ({ notify: h.notify }));
vi.mock("@/lib/delivery", () => ({ createDeliveryForOrder: vi.fn() }));

const NOW = new Date("2026-11-16T05:00:00.000Z"); // 12:00 in Bangkok
const T = NOW.toISOString();
const MIN = 60_000;
const before = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const SHOP = "00000000-0000-4000-8000-0000000000a1";
const OTHER_SHOP = "00000000-0000-4000-8000-0000000000a2";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CUSTOMER = "00000000-0000-4000-8000-0000000000c2";
let db: FakeSupabase;
let n = 0;

const NULL_COLUMNS = [
  "delivery_address",
  "delivery_lat",
  "delivery_lng",
  "delivery_recipient_name",
  "delivery_recipient_phone",
  "customer_note",
  "print_subtotal_satang",
  "platform_fee_satang",
  "total_satang",
  "reject_reason",
  "payment_deadline",
  "ready_in_minutes",
  "estimated_ready_at",
  "ready_note",
  "pickup_code",
  "paid_at",
  "completed_at",
  "handed_over_at",
];

function seed(over: Row = {}): OrderRow {
  const row: Row = {
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    created_at: T,
    order_no: `PG-${String(n).padStart(4, "0")}`,
    customer_id: CUSTOMER,
    shop_id: SHOP,
    status: "ready",
    fulfillment: "pickup",
    requires_manual_price: false,
    estimated_print_satang: 1000,
    estimated_services_satang: 0,
    delivery_fee_satang: 0,
    response_deadline: T,
    updated_at: T,
    ...Object.fromEntries(NULL_COLUMNS.map((k) => [k, null])),
    ...over,
  };
  db.rows("orders").push(row);
  return parseRow(OrderRow, row);
}
const stored = (o: OrderRow) => db.rows("orders").find((r) => r.id === o.id)!;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  db = new FakeSupabase();
  h.db = db;
  h.notify.mockReset().mockResolvedValue(undefined);
  db.rows("shops").push({
    id: SHOP,
    created_at: T,
    name: "ร้านตัวอย่าง",
    phone: "0800000000",
    address: "ที่อยู่สมมติ",
    lat: 18.79,
    lng: 98.95,
    status: "active",
    is_paused: false,
    accepts_delivery: true,
    cutoff_minutes: 30,
  });
});
afterEach(() => vi.useRealTimers());

describe("pickup auto-receive (10 minutes after the hand-over)", () => {
  it("is due only after HANDOVER_CONFIRM_MINUTES, only when handed over, only pickup + ready", () => {
    const wait = HANDOVER_CONFIRM_MINUTES * MIN;
    expect(autoReceiveDue(seed({ handed_over_at: before(wait - MIN) }), NOW)).toBe(false);
    expect(autoReceiveDue(seed({ handed_over_at: before(wait) }), NOW)).toBe(true);
    expect(autoReceiveDue(seed({ handed_over_at: null }), NOW)).toBe(false);
    expect(
      autoReceiveDue(seed({ handed_over_at: before(60 * MIN), fulfillment: "delivery" }), NOW),
    ).toBe(false);
    expect(
      autoReceiveDue(seed({ handed_over_at: before(60 * MIN), status: "printing" }), NOW),
    ).toBe(false);
  });

  it("expireIfDue completes the order, sets completed_at and tells the customer", async () => {
    const o = seed({ handed_over_at: before(11 * MIN) });
    const result = await expireIfDue(o);
    expect(result.status).toBe("completed");
    expect(stored(o)).toMatchObject({ status: "completed", completed_at: T });
    expect(h.notify).toHaveBeenCalledWith(o.id, "completed");
  });

  it("does nothing before 10 minutes, or when the shop has not handed over", async () => {
    const early = seed({ handed_over_at: before(5 * MIN) });
    const never = seed({ handed_over_at: null });
    expect((await expireIfDue(early)).status).toBe("ready");
    expect((await expireIfDue(never)).status).toBe("ready");
    expect(h.notify).not.toHaveBeenCalled();
  });
});

describe("the cron sweep", () => {
  it("completes handed-over pickup orders nobody confirmed, even if no one opens the page", async () => {
    const late = seed({ handed_over_at: before(15 * MIN) });
    const early = seed({ handed_over_at: before(3 * MIN) });
    const notHanded = seed({ handed_over_at: null });
    const result = await sweepExpiredOrders(NOW);
    expect(result).toMatchObject({ received: 1, failed: 0 });
    expect(stored(late).status).toBe("completed");
    expect(stored(early).status).toBe("ready");
    expect(stored(notHanded).status).toBe("ready");
    expect(h.notify).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/liff/orders/:id/receive", () => {
  it("the customer confirms after the hand-over: completed, notified once", async () => {
    const o = seed({ handed_over_at: before(2 * MIN) });
    const view = await receiveCustomerOrder(CUSTOMER, o.id);
    expect(view.status).toBe("completed");
    expect(stored(o)).toMatchObject({ status: "completed", completed_at: T });
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it("cannot close the order from home before the shop handed it over", async () => {
    const o = seed({ handed_over_at: null });
    await expect(receiveCustomerOrder(CUSTOMER, o.id)).rejects.toMatchObject({ status: 409 });
    expect(stored(o).status).toBe("ready");
  });

  it("a delivery order cannot be received this way", async () => {
    const o = seed({ fulfillment: "delivery", handed_over_at: before(MIN) });
    await expect(receiveCustomerOrder(CUSTOMER, o.id)).rejects.toMatchObject({ status: 409 });
  });

  it("a delivery order out for delivery is closed by the customer, also from courier_requested", async () => {
    for (const status of ["courier_requested", "in_transit"] as const) {
      const o = seed({ fulfillment: "delivery", status });
      const view = await receiveCustomerOrder(CUSTOMER, o.id);
      expect(view.status).toBe("completed");
      expect(stored(o)).toMatchObject({ status: "completed", completed_at: T });
    }
  });

  it("someone else's delivery order is a 404 and stays untouched", async () => {
    const o = seed({ fulfillment: "delivery", status: "courier_requested" });
    await expect(receiveCustomerOrder(OTHER_CUSTOMER, o.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(stored(o).status).toBe("courier_requested");
  });

  it("a pickup order is never closed through the delivery path", async () => {
    const o = seed({ fulfillment: "pickup", status: "in_transit", handed_over_at: null });
    await expect(receiveCustomerOrder(CUSTOMER, o.id)).rejects.toMatchObject({ status: 409 });
  });

  it("someone else's order is a 404", async () => {
    const o = seed({ handed_over_at: before(MIN) });
    await expect(receiveCustomerOrder(OTHER_CUSTOMER, o.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(stored(o).status).toBe("ready");
  });

  it("an order that is not ready yet is 409; an already completed one is answered again", async () => {
    const printing = seed({ status: "printing" });
    await expect(receiveCustomerOrder(CUSTOMER, printing.id)).rejects.toMatchObject({
      status: 409,
    });
    const done = seed({ status: "completed", completed_at: T, handed_over_at: before(MIN) });
    expect((await receiveCustomerOrder(CUSTOMER, done.id)).status).toBe("completed");
  });

  it("after the 10 minutes the system already completed it and the answer is still 200", async () => {
    const o = seed({ handed_over_at: before(20 * MIN) });
    expect((await receiveCustomerOrder(CUSTOMER, o.id)).status).toBe("completed");
  });
});

describe("GET /api/shop/earnings", () => {
  const settle = (o: OrderRow, amount: number, status = "pending", shop = SHOP) =>
    db.rows("settlements").push({ shop_id: shop, order_id: o.id, amount_satang: amount, status });

  it("the Bangkok day starts at 17:00 UTC of the day before", () => {
    expect(bangkokDayStart(NOW).toISOString()).toBe("2026-11-15T17:00:00.000Z");
  });

  it("sums today's completed orders and what is still pending", async () => {
    const a = seed({ status: "completed", completed_at: before(MIN) });
    const b = seed({ status: "completed", completed_at: before(2 * MIN) });
    const oldPending = seed({ status: "completed", completed_at: before(30 * 60 * MIN) });
    const oldPaid = seed({ status: "completed", completed_at: before(30 * 60 * MIN) });
    settle(a, 10_000);
    settle(b, 5_000);
    settle(oldPending, 7_000);
    settle(oldPaid, 9_000, "paid");
    const e = await getShopEarnings(SHOP, NOW);
    expect(e.todayTotalSatang).toBe(15_000);
    expect(e.todayCount).toBe(2);
    expect(e.pendingSatang).toBe(22_000);
    expect(e.paidSatang).toBe(9_000);
    // today's orders plus everything pending, newest first; an old paid order is not listed
    expect(e.items.map((i) => i.orderId)).toEqual([a.id, b.id, oldPending.id]);
  });

  it("money only counts after the order is completed", async () => {
    const waiting = seed({ status: "ready", handed_over_at: before(MIN) });
    const printing = seed({ status: "printing" });
    settle(waiting, 10_000);
    settle(printing, 10_000);
    const e = await getShopEarnings(SHOP, NOW);
    expect(e).toMatchObject({ todayTotalSatang: 0, pendingSatang: 0, items: [] });
  });

  it("an unconfirmed hand-over older than 10 minutes is completed first and then counts", async () => {
    const o = seed({ status: "ready", handed_over_at: before(11 * MIN) });
    settle(o, 12_000);
    const e = await getShopEarnings(SHOP, NOW);
    expect(stored(o).status).toBe("completed");
    expect(e.todayTotalSatang).toBe(12_000);
  });

  it("never includes another shop's money", async () => {
    const mine = seed({ status: "completed", completed_at: before(MIN) });
    const theirs = seed({ status: "completed", completed_at: before(MIN), shop_id: OTHER_SHOP });
    settle(mine, 3_000);
    settle(theirs, 99_000, "pending", OTHER_SHOP);
    const e = await getShopEarnings(SHOP, NOW);
    expect(e.todayTotalSatang).toBe(3_000);
    expect(JSON.stringify(e)).not.toContain(theirs.id);
  });

  it("a shop with no settlements gets zeros", async () => {
    expect(await getShopEarnings(SHOP, NOW)).toEqual({
      todayTotalSatang: 0,
      todayCount: 0,
      pendingSatang: 0,
      paidSatang: 0,
      items: [],
    });
  });
});

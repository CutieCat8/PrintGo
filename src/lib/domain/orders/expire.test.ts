import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderRow, parseRow } from "@/lib/db/types";
import { FakeSupabase, type Row } from "@/lib/domain/testing/fakeSupabase";
import { expireIfDue } from "./expire";

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

function seed(over: Row = {}): OrderRow {
  const row: Row = {
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    created_at: T,
    order_no: "PG-0001",
    customer_id: "00000000-0000-4000-8000-0000000000c1",
    shop_id: "00000000-0000-4000-8000-0000000000a1",
    status: "submitted",
    fulfillment: "pickup",
    requires_manual_price: false,
    estimated_print_satang: 1000,
    estimated_services_satang: 0,
    delivery_fee_satang: 0,
    response_deadline: after(60_000),
    updated_at: T,
    ...Object.fromEntries(
      [
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
      ].map((k) => [k, null]),
    ),
    ...over,
  };
  db.rows("orders").push(row);
  return parseRow(OrderRow, row);
}
const status = (o: OrderRow) => db.rows("orders").find((r) => r.id === o.id)?.status;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  db = new FakeSupabase();
  h.db = db;
  h.notify.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("expireIfDue", () => {
  it("expires a submitted order after the shop's deadline and tells the customer", async () => {
    const o = seed({ response_deadline: before(1000) });
    const result = await expireIfDue(o);
    expect(result.status).toBe("expired");
    expect(status(o)).toBe("expired");
    expect(h.notify).toHaveBeenCalledWith(o.id, "order_expired");
  });

  it("expires an awaiting_payment order after the payment deadline", async () => {
    const o = seed({ status: "awaiting_payment", payment_deadline: before(1000) });
    expect((await expireIfDue(o)).status).toBe("expired");
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it("leaves an order alone before its deadline, and exactly at it", async () => {
    const early = seed({ response_deadline: after(1000) });
    const exact = seed({ response_deadline: T });
    expect((await expireIfDue(early)).status).toBe("submitted");
    expect((await expireIfDue(exact)).status).toBe("submitted");
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("never expires an order that is paid or further along, whatever its deadlines say", async () => {
    for (const s of [
      "paid",
      "printing",
      "ready",
      "courier_requested",
      "in_transit",
      "completed",
      "cancelled",
    ]) {
      const o = seed({
        status: s,
        response_deadline: before(9_999_999),
        payment_deadline: before(9_999_999),
      });
      expect((await expireIfDue(o)).status).toBe(s);
      expect(status(o)).toBe(s);
    }
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("an awaiting_payment order without a deadline is not expired", async () => {
    const o = seed({ status: "awaiting_payment", payment_deadline: null });
    expect((await expireIfDue(o)).status).toBe("awaiting_payment");
  });

  it("does not use the response deadline for an awaiting_payment order", async () => {
    const o = seed({
      status: "awaiting_payment",
      response_deadline: before(1000),
      payment_deadline: after(60_000),
    });
    expect((await expireIfDue(o)).status).toBe("awaiting_payment");
  });

  it("when someone else moved the order first, returns the fresh row instead of failing", async () => {
    const o = seed({ response_deadline: before(1000) });
    db.rows("orders")[0].status = "awaiting_payment"; // the shop confirmed a moment ago
    const result = await expireIfDue(o); // we still hold the old `submitted` copy
    expect(result.status).toBe("awaiting_payment");
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("two checks at the same moment expire it once and notify once", async () => {
    const o = seed({ response_deadline: before(1000) });
    const [a, b] = await Promise.all([expireIfDue(o), expireIfDue(o)]);
    expect(a.status).toBe("expired");
    expect(b.status).toBe("expired");
    expect(h.notify).toHaveBeenCalledTimes(1);
  });
});

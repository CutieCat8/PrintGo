import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as completeRoute } from "@/app/api/shop/orders/[id]/complete/route";
import { POST as confirmRoute } from "@/app/api/shop/orders/[id]/confirm/route";
import { POST as etaRoute } from "@/app/api/shop/orders/[id]/eta/route";
import { POST as markReadyRoute } from "@/app/api/shop/orders/[id]/mark-ready/route";
import { POST as rejectRoute } from "@/app/api/shop/orders/[id]/reject/route";
import { GET as detailRoute } from "@/app/api/shop/orders/[id]/route";
import { POST as startRoute } from "@/app/api/shop/orders/[id]/start-printing/route";
import { GET as listRoute } from "@/app/api/shop/orders/route";
import { Order, OrderDetail } from "@/lib/db/types";
import { FakeSupabase, type Row } from "@/lib/domain/testing/fakeSupabase";
import { ApiError } from "@/lib/errors";

// FakeSupabase is in memory (not Postgres); auth, notify and the delivery step are mocked.
// `transition()`, lazy expiry and the pricing code are the real ones.
const h = vi.hoisted(() => ({
  db: null as unknown,
  requireShop: vi.fn(),
  notify: vi.fn(),
  createDeliveryForOrder: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({ getServiceClient: () => h.db }));
vi.mock("@/lib/auth", () => ({ requireShop: h.requireShop }));
vi.mock("@/lib/line/notify", () => ({ notify: h.notify }));
vi.mock("@/lib/delivery", () => ({ createDeliveryForOrder: h.createDeliveryForOrder }));

const NOW = new Date("2026-11-12T05:00:00.000Z"); // Thursday 12:00 in Bangkok
const T = NOW.toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SHOP_A = id(101);
const SHOP_B = id(102);
const CUSTOMER = id(201);
const CODE = "4821";
const future = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const past = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

let db: FakeSupabase;
let seq = 5000;

function seedOrder(over: Row = {}): Row {
  const order: Row = {
    id: id(seq++),
    created_at: T,
    order_no: `PG-${seq}`,
    customer_id: CUSTOMER,
    shop_id: SHOP_A,
    status: "submitted",
    fulfillment: "pickup",
    delivery_address: null,
    delivery_lat: null,
    delivery_lng: null,
    delivery_recipient_name: null,
    delivery_recipient_phone: null,
    customer_note: null,
    requires_manual_price: false,
    estimated_print_satang: 12000,
    estimated_services_satang: 0,
    print_subtotal_satang: null,
    platform_fee_satang: null,
    delivery_fee_satang: 0,
    total_satang: null,
    reject_reason: null,
    response_deadline: future(600_000),
    payment_deadline: null,
    ready_in_minutes: null,
    estimated_ready_at: null,
    ready_note: null,
    pickup_code: null,
    paid_at: null,
    completed_at: null,
    updated_at: T,
    ...over,
  };
  db.rows("orders").push(order);
  return order;
}
const PAID = {
  print_subtotal_satang: 12000,
  platform_fee_satang: 600,
  total_satang: 12600,
  ready_in_minutes: 30,
  paid_at: T,
  pickup_code: CODE,
};
const delivery = {
  fulfillment: "delivery",
  delivery_address: "123 ถนนสมมติ",
  delivery_lat: 18.8,
  delivery_lng: 98.9,
  delivery_recipient_name: "สมชาย ใจดี",
  delivery_recipient_phone: "0812345678",
  delivery_fee_satang: 4000,
};
const stored = (o: Row) => db.rows("orders").find((r) => r.id === o.id) as Row;

const withId = (orderId: string) => ({ params: Promise.resolve({ id: orderId }) });
type Handler = (req: Request, ctx: never) => Promise<Response>;
const act = (route: Handler, orderId: string, body?: unknown) =>
  route(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    withId(orderId) as never,
  );
const rawAct = (route: Handler, orderId: string, raw: string) =>
  route(new Request("http://localhost/x", { method: "POST", body: raw }), withId(orderId) as never);
const getDetail = (orderId: string) =>
  detailRoute(new Request("http://localhost/x"), withId(orderId) as never);
const list = (query = "") =>
  listRoute(new Request(`http://localhost/api/shop/orders${query}`), undefined as never);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  db = new FakeSupabase();
  h.db = db;
  for (const [sid, name] of [
    [SHOP_A, "ร้านตัวอย่าง A"],
    [SHOP_B, "ร้านตัวอย่าง B"],
  ]) {
    db.rows("shops").push({
      id: sid,
      created_at: T,
      name,
      phone: "0800000000",
      address: "ที่อยู่สมมติ",
      lat: 18.79,
      lng: 98.95,
      status: "active",
      is_paused: false,
      accepts_delivery: true,
      cutoff_minutes: 30,
    });
  }
  h.requireShop.mockReset().mockResolvedValue({ authUserId: "u", shopId: SHOP_A });
  h.notify.mockReset().mockResolvedValue(undefined);
  h.createDeliveryForOrder.mockReset().mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
describe("every shop route", () => {
  it("needs a logged-in active shop and does nothing without one", async () => {
    const o = seedOrder();
    h.requireShop.mockRejectedValue(new ApiError("FORBIDDEN", 403));
    const calls = [
      list(),
      getDetail(o.id as string),
      act(confirmRoute, o.id as string, { readyInMinutes: 15 }),
      act(etaRoute, o.id as string, { estimatedReadyAt: future(3600_000) }),
      act(rejectRoute, o.id as string, { reason: "ปิดร้าน" }),
      act(startRoute, o.id as string),
      act(markReadyRoute, o.id as string),
      act(completeRoute, o.id as string, { pickupCode: CODE }),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
    expect(stored(o).status).toBe("submitted");
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("asks for an active shop (never allowPending)", async () => {
    const o = seedOrder();
    await Promise.all([list(), getDetail(o.id as string), act(startRoute, o.id as string)]);
    expect(h.requireShop).toHaveBeenCalled();
    for (const call of h.requireShop.mock.calls) {
      expect(call).toHaveLength(1);
      expect(call[0]).toBeInstanceOf(Request);
    }
  });

  it("another shop's order is a 404 for every action, and nothing changes", async () => {
    const theirs = seedOrder({ shop_id: SHOP_B, status: "paid", ...PAID });
    const missing = id(4242);
    const attempts: [string, () => Promise<Response>][] = [
      ["detail", () => getDetail(theirs.id as string)],
      ["confirm", () => act(confirmRoute, theirs.id as string, { readyInMinutes: 15 })],
      ["eta", () => act(etaRoute, theirs.id as string, { estimatedReadyAt: future(3600_000) })],
      ["reject", () => act(rejectRoute, theirs.id as string, { reason: "ปิดร้าน" })],
      ["start", () => act(startRoute, theirs.id as string)],
      ["ready", () => act(markReadyRoute, theirs.id as string)],
      ["complete", () => act(completeRoute, theirs.id as string, { pickupCode: CODE })],
    ];
    for (const [, run] of attempts) {
      const res = await run();
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("NOT_FOUND");
    }
    // Same answer as for an order that does not exist.
    const a = await (await getDetail(theirs.id as string)).json();
    const b = await (await getDetail(missing)).json();
    expect(a).toEqual(b);
    expect(stored(theirs)).toMatchObject({ status: "paid", ...PAID });
    expect(db.rows("refunds")).toHaveLength(0);
    expect(db.rows("messages")).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
    expect(db.rows("webhook_events")).toHaveLength(0); // no pickup try was counted
  });

  it("a bad order id is 404", async () => {
    expect((await getDetail("nope")).status).toBe(404);
    expect((await act(confirmRoute, "nope", { readyInMinutes: 15 })).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------------------------
describe("GET /api/shop/orders", () => {
  it("lists only my orders: waiting jobs first, then newest first, in the Order shape", async () => {
    const oldWaiting = seedOrder({ created_at: "2026-11-10T00:00:00.000Z" });
    const paidNew = seedOrder({ status: "paid", ...PAID, created_at: "2026-11-12T03:00:00.000Z" });
    const paidOld = seedOrder({ status: "paid", ...PAID, created_at: "2026-11-11T03:00:00.000Z" });
    const newWaiting = seedOrder({ created_at: "2026-11-12T01:00:00.000Z" });
    seedOrder({ shop_id: SHOP_B });
    const body = await (await list()).json();
    expect(body.map((o: Row) => o.id)).toEqual([
      newWaiting.id,
      oldWaiting.id,
      paidNew.id,
      paidOld.id,
    ]);
    expect(Object.keys(body[0]).sort()).toEqual(Object.keys(Order.shape).sort());
    expect(body[0].shopName).toBe("ร้านตัวอย่าง A");
  });

  it("filters by status (comma separated) and rejects an unknown status", async () => {
    seedOrder();
    const paid = seedOrder({ status: "paid", ...PAID });
    const ready = seedOrder({ status: "ready", ...PAID });
    seedOrder({ status: "completed", ...PAID });
    const body = await (await list("?status=paid,ready")).json();
    expect(body.map((o: Row) => o.id).sort()).toEqual([paid.id, ready.id].sort());
    expect((await list("?status=nonsense")).status).toBe(422);
    expect((await list("?status=paid,nonsense")).status).toBe(422);
    expect((await (await list("?status=")).json()).length).toBe(4);
  });

  it("never carries a pickup code, even for a paid pickup order", async () => {
    seedOrder({ status: "ready", ...PAID });
    const text = JSON.stringify(await (await list()).json());
    expect(text).not.toContain(CODE);
    expect((await (await list()).json())[0].pickupCode).toBeNull();
  });

  it("expires overdue orders first and drops them from a filter that no longer matches", async () => {
    const late = seedOrder({ response_deadline: past(1000) });
    const body = await (await list("?status=submitted")).json();
    expect(body).toEqual([]);
    expect(stored(late).status).toBe("expired");
    expect(h.notify).toHaveBeenCalledWith(late.id, "order_expired");
    const all = await (await list()).json();
    expect(all[0].status).toBe("expired");
  });

  it("an empty list for a shop with no orders", async () => {
    expect(await (await list()).json()).toEqual([]);
  });
});

describe("GET /api/shop/orders/:id", () => {
  function seedFull(over: Row = {}) {
    const order = seedOrder({ status: "paid", ...PAID, ...delivery, ...over });
    db.rows("order_files").push({
      id: id(8001),
      created_at: T,
      order_id: order.id,
      storage_path: `order-files/${order.id}/a.pdf`,
      original_name: "รายงาน.pdf",
      mime: "application/pdf",
      size_bytes: 5000,
      page_count: 10,
      color: "bw",
      paper: "A4",
      sides: "single",
      copies: 2,
      deleted_at: null,
    });
    db.rows("order_services").push({
      id: id(8002),
      created_at: T,
      order_id: order.id,
      shop_service_id: null,
      name: "เข้าเล่ม",
      unit: "per_set",
      unit_price_satang: 3500,
      order_file_id: id(8001),
      quantity: 2,
    });
    db.rows("payments").push({
      id: id(8003),
      created_at: T,
      order_id: order.id,
      amount_satang: 12600,
      status: "verified",
      slip_path: "payment-slips/secret.png",
      slip_ref: "REF-SECRET",
      verified_by: "admin",
      verified_at: T,
      reject_reason: null,
    });
    return order;
  }

  it("returns the OrderDetail with files and services, but no recipient and no pickup code", async () => {
    const order = seedFull();
    const res = await getDetail(order.id as string);
    expect(res.status).toBe(200);
    const json = await res.json();
    const expected = Object.keys(OrderDetail.shape).filter(
      (k) => k !== "deliveryRecipientName" && k !== "deliveryRecipientPhone",
    );
    expect(Object.keys(json).sort()).toEqual(expected.sort());
    expect(json.files).toHaveLength(1);
    expect(json.services[0]).toMatchObject({
      name: "เข้าเล่ม",
      unitPriceSatang: 3500,
      lineTotalSatang: 7000,
    });
    expect(json.payment).toMatchObject({ status: "verified" });
    expect(json.deliveryAddress).toBe("123 ถนนสมมติ");
    expect(json.pickupCode).toBeNull();
    const text = JSON.stringify(json);
    for (const secret of [
      CODE,
      "สมชาย",
      "0812345678",
      "slip",
      "REF-SECRET",
      "payment-slips",
      "storagePath",
      "order-files/",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("shows the shop our real estimate on a manual-price order", async () => {
    const order = seedFull({
      status: "submitted",
      requires_manual_price: true,
      ...{
        print_subtotal_satang: null,
        platform_fee_satang: null,
        total_satang: null,
        pickup_code: null,
      },
    });
    const json = await (await getDetail(order.id as string)).json();
    expect(json.estimatedPrintSatang).toBe(12000);
  });

  it("expires an overdue order before showing it", async () => {
    const order = seedFull({
      status: "submitted",
      response_deadline: past(1000),
      pickup_code: null,
    });
    expect((await (await getDetail(order.id as string)).json()).status).toBe("expired");
  });
});

// ---------------------------------------------------------------------------------------------
describe("POST confirm", () => {
  it("quotes: fee 5%, total, payment deadline, ready time; tells the customer", async () => {
    const o = seedOrder();
    const res = await act(confirmRoute, o.id as string, {
      readyInMinutes: 30,
      readyNote: "รับได้หลังบ่ายสอง",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      status: "awaiting_payment",
      printSubtotalSatang: 12000,
      platformFeeSatang: 600,
      totalSatang: 12600,
      readyInMinutes: 30,
      readyNote: "รับได้หลังบ่ายสอง",
      pickupCode: null,
    });
    expect(json.paymentDeadline).toBe(future(30 * 60_000));
    expect(h.notify).toHaveBeenCalledWith(o.id, "quote_ready");
  });

  it("a delivery order keeps the delivery fee the customer saw", async () => {
    const o = seedOrder({ ...delivery });
    const json = await (await act(confirmRoute, o.id as string, { readyInMinutes: 30 })).json();
    expect(json.deliveryFeeSatang).toBe(4000);
    expect(json.totalSatang).toBe(12000 + 600 + 4000);
  });

  it("the shop may change the price of a normal order; the fee follows", async () => {
    const o = seedOrder();
    const json = await (
      await act(confirmRoute, o.id as string, { readyInMinutes: 15, printSubtotalSatang: 20000 })
    ).json();
    expect(json).toMatchObject({
      printSubtotalSatang: 20000,
      platformFeeSatang: 1000,
      totalSatang: 21000,
    });
  });

  it("a manual-price order needs the shop's price (MANUAL_PRICE_REQUIRED) and takes one", async () => {
    const o = seedOrder({ requires_manual_price: true });
    const res = await act(confirmRoute, o.id as string, { readyInMinutes: 15 });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("MANUAL_PRICE_REQUIRED");
    expect(stored(o).status).toBe("submitted");
    expect(h.notify).not.toHaveBeenCalled();
    const ok = await act(confirmRoute, o.id as string, {
      readyInMinutes: 15,
      printSubtotalSatang: 50000,
    });
    expect((await ok.json()).platformFeeSatang).toBe(2500);
  });

  it("the price must be a whole number of satang, above 0 and at most 100,000 baht", async () => {
    const o = seedOrder();
    for (const price of [0, -1, 1.5, 10_000_001]) {
      expect(
        (
          await act(confirmRoute, o.id as string, {
            readyInMinutes: 15,
            printSubtotalSatang: price,
          })
        ).status,
      ).toBe(422);
    }
    expect(stored(o).status).toBe("submitted");
    expect(
      (
        await act(confirmRoute, o.id as string, {
          readyInMinutes: 15,
          printSubtotalSatang: 10_000_000,
        })
      ).status,
    ).toBe(200);
  });

  it("needs exactly one ready-time choice, in range, in the future, with a note up to 200 characters", async () => {
    const o = seedOrder();
    const at = future(3600_000);
    const bad: Row[] = [
      {},
      { readyInMinutes: 15, estimatedReadyAt: at },
      { readyInMinutes: 4 },
      { readyInMinutes: 2881 },
      { readyInMinutes: 15.5 },
      { estimatedReadyAt: past(1000) },
      { estimatedReadyAt: "tomorrow" },
      { readyInMinutes: 15, readyNote: "ก".repeat(201) },
    ];
    for (const body of bad) {
      const res = await act(confirmRoute, o.id as string, body);
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect(stored(o).status).toBe("submitted");
    const ok = await act(confirmRoute, o.id as string, { estimatedReadyAt: at });
    expect((await ok.json()).estimatedReadyAt).toBe(at);
  });

  it("says in Thai when the ready time is missing", async () => {
    const o = seedOrder();
    const body = await (await act(confirmRoute, o.id as string, {})).json();
    expect(JSON.stringify(body)).toContain("ต้องระบุเวลาเสร็จอย่างใดอย่างหนึ่ง");
  });

  it("a second confirm is 409 and changes nothing more", async () => {
    const o = seedOrder();
    expect((await act(confirmRoute, o.id as string, { readyInMinutes: 15 })).status).toBe(200);
    const before = { ...stored(o) };
    const again = await act(confirmRoute, o.id as string, {
      readyInMinutes: 60,
      printSubtotalSatang: 99999,
    });
    expect(again.status).toBe(409);
    expect(stored(o)).toEqual(before);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it("two confirms at the same moment: one wins", async () => {
    const o = seedOrder();
    const results = await Promise.all([
      act(confirmRoute, o.id as string, { readyInMinutes: 15 }),
      act(confirmRoute, o.id as string, { readyInMinutes: 30 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it("an order whose answer time has run out is expired, so confirming it is 409", async () => {
    const o = seedOrder({ response_deadline: past(1000) });
    expect((await act(confirmRoute, o.id as string, { readyInMinutes: 15 })).status).toBe(409);
    expect(stored(o).status).toBe("expired");
  });

  it("an order that is already paid cannot be confirmed again", async () => {
    const o = seedOrder({ status: "paid", ...PAID });
    expect((await act(confirmRoute, o.id as string, { readyInMinutes: 15 })).status).toBe(409);
    expect(stored(o)).toMatchObject({ status: "paid", ...PAID });
  });

  it("rejects a body that is not JSON", async () => {
    const o = seedOrder();
    expect((await rawAct(confirmRoute, o.id as string, "{oops")).status).toBe(422);
  });
});

// ---------------------------------------------------------------------------------------------
describe("POST eta (D19)", () => {
  const eta = (o: Row, body: unknown) => act(etaRoute, o.id as string, body);
  const later = () => future(2 * 3600_000);

  it("changes the ready time of a paid order, keeps ready_in_minutes, tells the customer", async () => {
    const o = seedOrder({ status: "paid", ...PAID, estimated_ready_at: future(30 * 60_000) });
    const res = await eta(o, { estimatedReadyAt: later(), readyNote: "เครื่องเสีย ขอเลื่อน" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      status: "paid",
      estimatedReadyAt: later(),
      readyNote: "เครื่องเสีย ขอเลื่อน",
      readyInMinutes: 30,
    });
    expect(stored(o).ready_in_minutes).toBe(30);
    expect(h.notify).toHaveBeenCalledWith(o.id, "eta_changed");
    expect(db.rows("messages")).toHaveLength(1);
    expect(db.rows("messages")[0]).toMatchObject({ order_id: o.id, sender: "system" });
    expect(db.rows("messages")[0].body).toContain("ร้านปรับเวลาเสร็จ");
    expect(db.rows("messages")[0].body).toContain("เครื่องเสีย ขอเลื่อน");
  });

  it("works while printing, and keeps the old note when none is sent", async () => {
    const o = seedOrder({ status: "printing", ...PAID, ready_note: "บันทึกเดิม" });
    const json = await (await eta(o, { estimatedReadyAt: later() })).json();
    expect(json.readyNote).toBe("บันทึกเดิม");
    expect(json.status).toBe("printing");
  });

  it("needs a time in the future (422), a valid time, and a note up to 200 characters", async () => {
    const o = seedOrder({ status: "paid", ...PAID, estimated_ready_at: future(1000) });
    for (const body of [
      {},
      { estimatedReadyAt: past(1000) },
      { estimatedReadyAt: T },
      { estimatedReadyAt: "soon" },
      { estimatedReadyAt: later(), readyNote: "ก".repeat(201) },
    ]) {
      expect((await eta(o, body)).status).toBe(422);
    }
    expect(stored(o).estimated_ready_at).toBe(future(1000));
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("cannot be used in any other state (409) and changes nothing", async () => {
    for (const status of [
      "submitted",
      "awaiting_payment",
      "ready",
      "courier_requested",
      "in_transit",
      "completed",
      "rejected",
      "cancelled",
      "expired",
    ]) {
      const o = seedOrder({ status, ...PAID, estimated_ready_at: future(1000) });
      const res = await eta(o, { estimatedReadyAt: later() });
      expect(res.status).toBe(409);
      expect(stored(o).estimated_ready_at).toBe(future(1000));
    }
    expect(db.rows("messages")).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("a failing chat message or notify does not undo the change", async () => {
    db.failures.set("messages.insert", "chat down");
    h.notify.mockRejectedValue(new Error("LINE down"));
    const o = seedOrder({ status: "paid", ...PAID });
    const res = await eta(o, { estimatedReadyAt: later() });
    expect(res.status).toBe(200);
    expect(stored(o).estimated_ready_at).toBe(later());
  });

  it("does not give the customer a way to cancel (it never touches the status)", async () => {
    const o = seedOrder({ status: "paid", ...PAID });
    await eta(o, { estimatedReadyAt: later() });
    expect(stored(o).status).toBe("paid");
    expect(db.rows("refunds")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe("POST reject", () => {
  const reject = (o: Row, body: unknown) => act(rejectRoute, o.id as string, body);

  it("rejects a waiting order with a reason, no refund, and tells the customer", async () => {
    const o = seedOrder();
    const res = await reject(o, { reason: "  ปิดร้านวันนี้  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "rejected", rejectReason: "ปิดร้านวันนี้" });
    expect(db.rows("refunds")).toHaveLength(0);
    expect(h.notify).toHaveBeenCalledWith(o.id, "order_rejected");
  });

  it("after payment (paid or printing) it also refunds the full total", async () => {
    for (const status of ["paid", "printing"]) {
      const o = seedOrder({ status, ...PAID });
      expect((await reject(o, { reason: "เปิดไฟล์ไม่ได้" })).status).toBe(200);
      expect(stored(o).status).toBe("rejected");
    }
    expect(db.rows("refunds")).toHaveLength(2);
    expect(
      db.rows("refunds").every((r) => r.amount_satang === 12600 && r.status === "pending"),
    ).toBe(true);
  });

  it("needs a reason of 3 to 300 characters", async () => {
    const o = seedOrder();
    for (const body of [
      {},
      { reason: "" },
      { reason: "  " },
      { reason: "ab" },
      { reason: "ก".repeat(301) },
      { reason: 5 },
    ]) {
      expect((await reject(o, body)).status).toBe(422);
    }
    expect(stored(o).status).toBe("submitted");
    expect((await reject(o, { reason: "abc" })).status).toBe(200);
  });

  it("is not possible from ready or later, or twice (409)", async () => {
    for (const status of [
      "awaiting_payment",
      "ready",
      "courier_requested",
      "in_transit",
      "completed",
      "rejected",
      "cancelled",
      "expired",
    ]) {
      const o = seedOrder({ status, ...PAID });
      expect((await reject(o, { reason: "เหตุผลทดสอบ" })).status).toBe(409);
      expect(stored(o).status).toBe(status);
    }
    expect(db.rows("refunds")).toHaveLength(0);
    const o = seedOrder();
    expect((await reject(o, { reason: "เหตุผลทดสอบ" })).status).toBe(200);
    expect((await reject(o, { reason: "เหตุผลทดสอบ" })).status).toBe(409);
  });

  it("two rejections at the same moment make one refund", async () => {
    const o = seedOrder({ status: "paid", ...PAID });
    const results = await Promise.all([
      reject(o, { reason: "เหตุผลทดสอบ" }),
      reject(o, { reason: "เหตุผลทดสอบ" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(db.rows("refunds")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe("POST start-printing and mark-ready", () => {
  it("paid -> printing -> ready for a pickup order", async () => {
    const o = seedOrder({ status: "paid", ...PAID });
    expect((await (await act(startRoute, o.id as string)).json()).status).toBe("printing");
    expect(h.notify).toHaveBeenCalledWith(o.id, "printing");
    const ready = await (await act(markReadyRoute, o.id as string)).json();
    expect(ready.status).toBe("ready");
    expect(ready.pickupCode).toBeNull(); // the shop never gets the code back
    expect(JSON.stringify(ready)).not.toContain(CODE);
    expect(h.notify).toHaveBeenCalledWith(o.id, "ready");
    expect(h.createDeliveryForOrder).not.toHaveBeenCalled();
  });

  it("a delivery order goes straight on to courier_requested", async () => {
    const o = seedOrder({ status: "printing", ...PAID, ...delivery });
    const json = await (await act(markReadyRoute, o.id as string)).json();
    expect(json.status).toBe("courier_requested");
    expect(stored(o).status).toBe("courier_requested");
    expect(h.createDeliveryForOrder).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledWith(o.id, "ready");
    expect(h.notify).toHaveBeenCalledWith(o.id, "courier_requested");
  });

  it("if the courier step fails the answer shows the real stored status", async () => {
    h.createDeliveryForOrder.mockRejectedValue(new Error("delivery down"));
    const o = seedOrder({ status: "printing", ...PAID, ...delivery });
    const res = await act(markReadyRoute, o.id as string);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe(stored(o).status);
    expect(["ready", "courier_requested"]).toContain(stored(o).status);
  });

  it("states must follow the order (409): no printing from submitted, no ready from paid", async () => {
    for (const status of [
      "submitted",
      "awaiting_payment",
      "printing",
      "ready",
      "completed",
      "cancelled",
    ]) {
      const o = seedOrder({ status, ...PAID });
      expect((await act(startRoute, o.id as string)).status).toBe(409);
      expect(stored(o).status).toBe(status);
    }
    for (const status of ["submitted", "awaiting_payment", "paid", "ready", "completed"]) {
      const o = seedOrder({ status, ...PAID });
      expect((await act(markReadyRoute, o.id as string)).status).toBe(409);
      expect(stored(o).status).toBe(status);
    }
  });

  it("pressing start-printing twice: the second is 409", async () => {
    const o = seedOrder({ status: "paid", ...PAID });
    expect((await act(startRoute, o.id as string)).status).toBe(200);
    expect((await act(startRoute, o.id as string)).status).toBe(409);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe("POST complete (pickup code)", () => {
  const complete = (o: Row, code: unknown) =>
    act(completeRoute, o.id as string, { pickupCode: code });
  const ready = (over: Row = {}) => seedOrder({ status: "ready", ...PAID, ...over });

  it("the right code completes a pickup order, sets completed_at, tells the customer", async () => {
    const o = ready();
    const res = await complete(o, CODE);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ status: "completed", pickupCode: null });
    expect(JSON.stringify(json)).not.toContain(CODE);
    expect(stored(o)).toMatchObject({ status: "completed", completed_at: T });
    expect(h.notify).toHaveBeenCalledWith(o.id, "completed");
  });

  it("ignores spaces in the code", async () => {
    for (const typed of [" 4821 ", "48 21", "4 8 2 1", "\t4821\n"]) {
      const o = ready();
      expect((await complete(o, typed)).status).toBe(200);
    }
  });

  it("a wrong code is 422, the order stays ready, and the answer does not show the real code", async () => {
    const o = ready();
    const res = await complete(o, "0000");
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).not.toContain(CODE);
    expect(stored(o).status).toBe("ready");
    expect(h.notify).not.toHaveBeenCalled();
    // Each of these is also a wrong code (422); an order of its own keeps the tries apart.
    for (const bad of ["abcd", "482", "48210", "٤٨٢١", "4821x"]) {
      const fresh = ready();
      expect((await complete(fresh, bad)).status).toBe(422);
      expect(stored(fresh).status).toBe("ready");
    }
    expect(stored(o).status).toBe("ready");
  });

  it("after 5 tries within 10 minutes it is RATE_LIMITED, even for the right code", async () => {
    const o = ready();
    for (let i = 0; i < 5; i++) expect((await complete(o, "0000")).status).toBe(422);
    const blocked = await complete(o, CODE);
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe("RATE_LIMITED");
    expect(stored(o).status).toBe("ready");
  });

  it("the limit is per order and the window is 10 minutes", async () => {
    const o = ready();
    const other = ready();
    for (let i = 0; i < 5; i++) await complete(o, "0000");
    expect((await complete(o, CODE)).status).toBe(429);
    expect((await complete(other, CODE)).status).toBe(200); // another order is not affected

    vi.setSystemTime(new Date(NOW.getTime() + 11 * 60_000));
    expect((await complete(o, CODE)).status).toBe(200);
  });

  it("pressing the button again while locked does not extend the lock", async () => {
    const o = ready();
    for (let i = 0; i < 5; i++) await complete(o, "0000");
    vi.setSystemTime(new Date(NOW.getTime() + 9 * 60_000));
    for (let i = 0; i < 3; i++) expect((await complete(o, CODE)).status).toBe(429);
    vi.setSystemTime(new Date(NOW.getTime() + 11 * 60_000)); // the 5 real tries are now older than 10 minutes
    expect((await complete(o, CODE)).status).toBe(200);
  });

  it("four wrong tries and then the right one still works", async () => {
    const o = ready();
    for (let i = 0; i < 4; i++) await complete(o, "0000");
    expect((await complete(o, CODE)).status).toBe(200);
  });

  it("a burst of parallel guesses is counted together", async () => {
    const o = ready();
    const guesses = await Promise.all(
      Array.from({ length: 12 }, (_, i) => complete(o, String(1000 + i))),
    );
    expect(guesses.filter((r) => r.status === 422).length).toBeLessThanOrEqual(5);
    expect(guesses.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(7);
  });

  it("only a pickup order that is ready: a delivery order or another state is 409 and no try is counted", async () => {
    const d = ready({ ...delivery });
    expect((await complete(d, CODE)).status).toBe(409);
    for (const status of [
      "paid",
      "printing",
      "courier_requested",
      "in_transit",
      "completed",
      "cancelled",
    ]) {
      const o = seedOrder({ status, ...PAID });
      expect((await complete(o, CODE)).status).toBe(409);
      expect(stored(o).status).toBe(status);
    }
    expect(db.rows("webhook_events")).toHaveLength(0);
  });

  it("the code never appears in a log", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];
    const o = ready();
    await complete(o, "0000");
    await complete(o, CODE);
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(CODE);
      expect(JSON.stringify(spy.mock.calls)).not.toContain("0000");
    }
    expect(JSON.stringify(db.rows("webhook_events"))).not.toContain(CODE);
  });

  it("needs a pickupCode in the body", async () => {
    const o = ready();
    for (const body of [
      {},
      { pickupCode: "" },
      { pickupCode: 4821 },
      { pickupCode: "1".repeat(21) },
    ]) {
      expect((await act(completeRoute, o.id as string, body)).status).toBe(422);
    }
    expect(stored(o).status).toBe("ready");
  });

  it("two shops' copies of the same code do not mix: only the owner shop can complete", async () => {
    const theirs = seedOrder({ shop_id: SHOP_B, status: "ready", ...PAID });
    expect((await complete(theirs, CODE)).status).toBe(404);
    expect(stored(theirs).status).toBe("ready");
  });
});

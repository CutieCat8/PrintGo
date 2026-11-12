import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as cancelRoute } from "@/app/api/liff/orders/[id]/cancel/route";
import { GET as detailRoute } from "@/app/api/liff/orders/[id]/route";
import { GET as listRoute, POST as createRoute } from "@/app/api/liff/orders/route";
import { POST as estimateRoute } from "@/app/api/liff/estimate/route";
import { Order, OrderDetail } from "@/lib/db/types";
import { FakeSupabase, type Row } from "@/lib/domain/testing/fakeSupabase";
import { ApiError } from "@/lib/errors";

// Everything runs against FakeSupabase (in memory, not Postgres / real Storage) and mocked
// auth, delivery quote and notifications. `transition()` and the pricing code are the real ones.
const h = vi.hoisted(() => ({
  db: null as unknown,
  requireCustomer: vi.fn(),
  quoteDelivery: vi.fn(),
  createDeliveryForOrder: vi.fn(),
  notifyShop: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({ getServiceClient: () => h.db }));
vi.mock("@/lib/auth", () => ({ requireCustomer: h.requireCustomer }));
vi.mock("@/lib/delivery", () => ({
  quoteDelivery: h.quoteDelivery,
  createDeliveryForOrder: h.createDeliveryForOrder,
}));
vi.mock("@/lib/push/notifyShop", () => ({ notifyShop: h.notifyShop }));
vi.mock("@/lib/line/notify", () => ({ notify: h.notify }));

const NOW = new Date("2026-11-12T05:00:00.000Z"); // Thursday 12:00 in Bangkok
const T = NOW.toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SHOP_A = id(101);
const SHOP_B = id(102);
const SHOP_PENDING = id(103);
const C1 = id(201);
const C2 = id(202);
const SVC_BIND = id(301); // per_set 35.00
const SVC_COVER = id(302); // per_order 20.00
const SVC_NEG = id(303); // per_set, price by agreement
const SVC_OFF = id(304); // inactive
const SVC_OTHER = id(305); // belongs to shop B

let db: FakeSupabase;

function seedShops() {
  const shop = (sid: string, name: string, over: Row = {}): Row => ({
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
    ...over,
  });
  db.rows("shops").push(
    shop(SHOP_A, "ร้านตัวอย่าง A"),
    shop(SHOP_B, "ร้านตัวอย่าง B"),
    shop(SHOP_PENDING, "ร้านรออนุมัติ", { status: "pending" }),
  );
  let n = 1000;
  for (const sid of [SHOP_A, SHOP_B, SHOP_PENDING]) {
    for (let d = 0; d < 7; d++) {
      db.rows("shop_hours").push({
        id: id(n++),
        created_at: T,
        shop_id: sid,
        weekday: d,
        open_time: "00:00:00",
        close_time: "24:00:00",
        is_closed: false,
      });
    }
    // Sample prices only: bw A4 1.00 / 0.80 double-sided, colour A4 5.00 per page.
    for (const [color, sides, price] of [
      ["bw", "single", 100],
      ["bw", "double", 80],
      ["color", "single", 500],
    ] as const) {
      db.rows("shop_pricing_rules").push({
        id: id(n++),
        created_at: T,
        shop_id: sid,
        color,
        paper: "A4",
        sides,
        price_per_page_satang: price,
      });
    }
  }
  db.rows("shop_discount_tiers").push({
    id: id(n++),
    created_at: T,
    shop_id: SHOP_A,
    min_pages: 100,
    note: null,
  });
  const service = (
    sid: string,
    shopId: string,
    name: string,
    price: number | null,
    unit: string,
    active = true,
  ) =>
    db.rows("shop_services").push({
      id: sid,
      created_at: T,
      shop_id: shopId,
      name,
      price_satang: price,
      unit,
      is_active: active,
      sort_order: 0,
    });
  service(SVC_BIND, SHOP_A, "เข้าเล่ม", 3500, "per_set");
  service(SVC_COVER, SHOP_A, "ปกใส", 2000, "per_order");
  service(SVC_NEG, SHOP_A, "เคลือบ (ตามตกลง)", null, "per_set");
  service(SVC_OFF, SHOP_A, "ปิดใช้งาน", 100, "per_set", false);
  service(SVC_OTHER, SHOP_B, "ของร้านอื่น", 100, "per_set");
}

const pendingPath = (n: number, customer = C1) => `order-files/pending/${customer}/f${n}.pdf`;
const putUpload = (n: number, customer = C1, over: Parameters<FakeSupabase["put"]>[2] = {}) =>
  db.put("order-files", `pending/${customer}/f${n}.pdf`, {
    size: 5000,
    contentType: "application/pdf",
    ...over,
  });

const fileBody = (n = 1, over: Row = {}) => ({
  path: pendingPath(n),
  originalName: "รายงาน.pdf",
  mime: "application/pdf",
  sizeBytes: 5000,
  pageCount: 10,
  color: "bw",
  paper: "A4",
  sides: "single",
  copies: 1,
  ...over,
});
const orderBody = (over: Row = {}) => ({
  shopId: SHOP_A,
  fulfillment: "pickup",
  files: [fileBody(1)],
  ...over,
});
const deliveryBody = (over: Row = {}) =>
  orderBody({
    fulfillment: "delivery",
    deliveryAddress: "123 ถนนสมมติ",
    deliveryLat: 18.8,
    deliveryLng: 98.96,
    deliveryRecipientName: "สมชาย ใจดี",
    deliveryRecipientPhone: "081-234-5678",
    ...over,
  });

const post = (route: (r: Request, c: never) => Promise<Response>, body: unknown, raw = false) =>
  route(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
    undefined as never,
  );
const create = (body: unknown) => post(createRoute, body);
const estimate = (body: unknown) => post(estimateRoute, body);
const withId = (orderId: string) => ({ params: Promise.resolve({ id: orderId }) });
const getDetail = (orderId: string) =>
  detailRoute(new Request("http://localhost/x"), withId(orderId));
const cancel = (orderId: string) =>
  cancelRoute(new Request("http://localhost/x", { method: "POST" }), withId(orderId));
const list = () => listRoute(new Request("http://localhost/x"), undefined as never);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  db = new FakeSupabase();
  h.db = db;
  seedShops();
  putUpload(1);
  putUpload(2);
  h.requireCustomer.mockReset().mockResolvedValue({ customerId: C1, lineUserId: "u1" });
  h.quoteDelivery.mockReset().mockResolvedValue({ feeSatang: 4000, estimated: true });
  h.createDeliveryForOrder.mockReset().mockResolvedValue({});
  h.notifyShop.mockReset().mockResolvedValue(undefined);
  h.notify.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
describe("POST /api/liff/estimate", () => {
  const body = (over: Row = {}) => ({
    shopId: SHOP_A,
    fulfillment: "pickup",
    files: [{ pageCount: 10, color: "bw", paper: "A4", sides: "single", copies: 1 }],
    ...over,
  });

  it("prices from the shop's list: 10 pages x 1.00 = 10.00, fee 3.00 (minimum), total 13.00", async () => {
    const res = await estimate(body());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      requiresManualPrice: false,
      estimatedPrintSatang: 1000,
      servicesSatang: 0,
      serviceLines: [],
      platformFeeSatang: 300,
      deliveryFeeSatang: 0,
      totalSatang: 1300,
    });
  });

  it("includes services: 2 sets x 35.00 binding -> fee 5%", async () => {
    const res = await estimate(
      body({
        files: [{ pageCount: 10, color: "bw", paper: "A4", sides: "single", copies: 2 }],
        services: [{ serviceId: SVC_BIND }, { serviceId: SVC_COVER }],
      }),
    );
    const json = await res.json();
    expect(json.estimatedPrintSatang).toBe(2000);
    expect(json.servicesSatang).toBe(7000 + 2000);
    expect(json.platformFeeSatang).toBe(550); // 5% of 11000
    expect(json.totalSatang).toBe(11550);
    expect(json.serviceLines).toEqual([
      {
        serviceId: SVC_BIND,
        name: "เข้าเล่ม",
        unit: "per_set",
        unitPriceSatang: 3500,
        quantity: 2,
        lineTotalSatang: 7000,
      },
      {
        serviceId: SVC_COVER,
        name: "ปกใส",
        unit: "per_order",
        unitPriceSatang: 2000,
        quantity: 1,
        lineTotalSatang: 2000,
      },
    ]);
  });

  it("a volume discount makes it manual: every price that depends on the shop is null", async () => {
    const res = await estimate(
      body({ files: [{ pageCount: 100, color: "bw", paper: "A4", sides: "single", copies: 1 }] }),
    );
    expect(await res.json()).toEqual({
      requiresManualPrice: true,
      estimatedPrintSatang: null,
      servicesSatang: null,
      serviceLines: [],
      platformFeeSatang: null,
      deliveryFeeSatang: 0,
      totalSatang: null,
    });
  });

  it("a service priced by agreement makes it manual and hides the other service prices too", async () => {
    const json = await (
      await estimate(body({ services: [{ serviceId: SVC_NEG }, { serviceId: SVC_BIND }] }))
    ).json();
    expect(json.requiresManualPrice).toBe(true);
    expect(json.servicesSatang).toBeNull();
    expect(json.totalSatang).toBeNull();
    expect(
      json.serviceLines.every((l: Row) => l.unitPriceSatang === null && l.lineTotalSatang === null),
    ).toBe(true);
  });

  it("delivery: needs coordinates, adds the quoted fee, and needs a shop that delivers", async () => {
    expect((await estimate(body({ fulfillment: "delivery" }))).status).toBe(422);
    const ok = await (
      await estimate(body({ fulfillment: "delivery", deliveryLat: 18.8, deliveryLng: 98.9 }))
    ).json();
    expect(ok.deliveryFeeSatang).toBe(4000);
    expect(ok.totalSatang).toBe(1000 + 300 + 4000);
    expect(h.quoteDelivery).toHaveBeenCalledWith(SHOP_A, { lat: 18.8, lng: 98.9 });

    db.rows("shops")[0].accepts_delivery = false;
    expect(
      (await estimate(body({ fulfillment: "delivery", deliveryLat: 18.8, deliveryLng: 98.9 })))
        .status,
    ).toBe(422);
  });

  it("pickup never asks for a delivery quote", async () => {
    await estimate(body({ deliveryLat: 18.8, deliveryLng: 98.9 }));
    expect(h.quoteDelivery).not.toHaveBeenCalled();
  });

  it("rejects another shop's service, an inactive one and an unknown one with 422", async () => {
    for (const serviceId of [SVC_OTHER, SVC_OFF, id(999)]) {
      const res = await estimate(body({ services: [{ serviceId }] }));
      expect(res.status).toBe(422);
    }
  });

  it("a combination the shop does not offer is 422; an unknown or pending shop is 404", async () => {
    const res = await estimate(
      body({ files: [{ pageCount: 5, color: "color", paper: "A3", sides: "single", copies: 1 }] }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toBe("ร้านนี้ไม่รับงานชุดค่านี้");
    expect((await estimate(body({ shopId: id(998) }))).status).toBe(404);
    expect((await estimate(body({ shopId: SHOP_PENDING }))).status).toBe(404);
  });

  it("ignores prices sent by the client", async () => {
    const json = await (
      await estimate(
        body({
          totalSatang: 1,
          estimatedPrintSatang: 1,
          platformFeeSatang: 0,
          pricePerPageSatang: 1,
          services: [{ serviceId: SVC_BIND, priceSatang: 1, name: "ฟรี" }],
        }),
      )
    ).json();
    expect(json.estimatedPrintSatang).toBe(1000);
    expect(json.serviceLines[0]).toMatchObject({ name: "เข้าเล่ม", unitPriceSatang: 3500 });
  });

  it("validates the body (422) and needs a login (401)", async () => {
    for (const bad of [
      body({ files: [] }),
      body({ files: [{ pageCount: 0, color: "bw", paper: "A4", sides: "single", copies: 1 }] }),
      body({ files: [{ pageCount: 1, color: "bw", paper: "A4", sides: "single", copies: 100 }] }),
      body({ shopId: "nope" }),
      body({ fulfillment: "teleport" }),
    ]) {
      expect((await estimate(bad)).status).toBe(422);
    }
    expect((await post(estimateRoute, "{", true)).status).toBe(422);
    h.requireCustomer.mockRejectedValue(new ApiError("UNAUTHENTICATED", 401));
    expect((await estimate(body())).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------------
describe("POST /api/liff/orders: success", () => {
  it("creates a submitted order and returns the contract Order", async () => {
    const res = await create(orderBody({ customerNote: "  ขอเย็บมุม  " }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual(Object.keys(Order.shape).sort());
    expect(json).toMatchObject({
      status: "submitted",
      fulfillment: "pickup",
      shopId: SHOP_A,
      shopName: "ร้านตัวอย่าง A",
      customerNote: "ขอเย็บมุม",
      requiresManualPrice: false,
      estimatedPrintSatang: 1000,
      estimatedServicesSatang: 0,
      printSubtotalSatang: null,
      platformFeeSatang: null,
      totalSatang: null,
      deliveryFeeSatang: 0,
      pickupCode: null,
      unreadMessageCount: 0,
    });
    expect(json.orderNo).toMatch(/^PG-\d{4}$/);
    expect(json.responseDeadline).toBe(new Date(NOW.getTime() + 15 * 60_000).toISOString());
  });

  it("stores the order, its file (final path, display name) and moves the file into the order folder", async () => {
    const json = await (await create(orderBody())).json();
    const [row] = db.rows("orders");
    expect(row).toMatchObject({
      id: json.id,
      customer_id: C1,
      status: "submitted",
      shop_id: SHOP_A,
    });
    const [file] = db.rows("order_files");
    expect(file).toMatchObject({
      order_id: json.id,
      original_name: "รายงาน.pdf",
      mime: "application/pdf",
      size_bytes: 5000,
      page_count: 10,
      copies: 1,
    });
    expect(file.storage_path).toBe(`order-files/${json.id}/f1.pdf`);
    const keys = [...db.objects("order-files").keys()];
    expect(keys).toContain(`${json.id}/f1.pdf`);
    expect(keys).not.toContain(`pending/${C1}/f1.pdf`);
  });

  it("tells the shop (notifyShop) with the order id and number", async () => {
    const json = await (await create(orderBody())).json();
    expect(h.notifyShop).toHaveBeenCalledWith(SHOP_A, "order_new", {
      orderId: json.id,
      orderNo: json.orderNo,
    });
  });

  it("a failing notifyShop does not fail the order", async () => {
    h.notifyShop.mockRejectedValue(new Error("push down"));
    expect((await create(orderBody())).status).toBe(200);
    expect(db.rows("orders")).toHaveLength(1);
  });

  it("uses SHOP_RESPONSE_MINUTES for the shop's answer deadline", async () => {
    vi.stubEnv("SHOP_RESPONSE_MINUTES", "5");
    const json = await (await create(orderBody())).json();
    expect(json.responseDeadline).toBe(new Date(NOW.getTime() + 5 * 60_000).toISOString());
  });

  it("an image is one page (D11): any other page count is refused", async () => {
    putUpload(3, C1, { contentType: "image/png" });
    const png = (pageCount: number) => ({
      ...fileBody(3, { mime: "image/png", pageCount }),
      path: pendingPath(3).replace(".pdf", ".pdf"),
    });
    expect((await create(orderBody({ files: [png(10)] }))).status).toBe(422);
    expect(db.rows("orders")).toHaveLength(0);
    expect((await create(orderBody({ files: [png(1)] }))).status).toBe(200);
  });

  it("an absurdly large order is 422, not a database error", async () => {
    const huge = Array.from({ length: 10 }, (_, i) => ({
      pageCount: 10000,
      color: "color",
      paper: "A4",
      sides: "single",
      copies: 99,
      i,
    }));
    const res = await estimate({
      shopId: SHOP_A,
      fulfillment: "pickup",
      files: huge.map(({ i, ...f }) => (void i, f)),
    });
    expect(res.status).toBe(422);
  });

  it("two files with different settings are priced separately", async () => {
    const json = await (
      await create(
        orderBody({
          files: [fileBody(1), fileBody(2, { color: "color", pageCount: 3, copies: 2 })],
        }),
      )
    ).json();
    expect(json.estimatedPrintSatang).toBe(1000 + 3 * 2 * 500);
    expect(db.rows("order_files")).toHaveLength(2);
  });

  it("a volume discount makes it manual, the customer sees no price, the database keeps our estimate", async () => {
    const json = await (
      await create(orderBody({ files: [fileBody(1, { pageCount: 100 })] }))
    ).json();
    expect(json.requiresManualPrice).toBe(true);
    expect(json.estimatedPrintSatang).toBeNull();
    expect(json.estimatedServicesSatang).toBeNull();
    expect(db.rows("orders")[0]).toMatchObject({
      requires_manual_price: true,
      estimated_print_satang: 10000,
    });
  });
});

describe("POST /api/liff/orders: never trusts the client", () => {
  it("ignores customer id, status, prices and totals sent in the body", async () => {
    const json = await (
      await create({
        ...orderBody(),
        customerId: C2,
        status: "paid",
        totalSatang: 1,
        estimatedPrintSatang: 1,
        printSubtotalSatang: 1,
        platformFeeSatang: 0,
        deliveryFeeSatang: 0,
        pickupCode: "1234",
        requiresManualPrice: true,
      })
    ).json();
    expect(json.status).toBe("submitted");
    expect(db.rows("orders")[0]).toMatchObject({
      customer_id: C1,
      status: "submitted",
      estimated_print_satang: 1000,
      requires_manual_price: false,
      print_subtotal_satang: null,
      total_satang: null,
      pickup_code: null,
    });
  });

  it("reads size and type from Storage, not from the request", async () => {
    putUpload(1, C1, { size: 7777, contentType: "application/pdf" });
    await create(orderBody({ files: [fileBody(1, { sizeBytes: 10, mime: "image/png" })] }));
    expect(db.rows("order_files")[0]).toMatchObject({ size_bytes: 7777, mime: "application/pdf" });
  });

  it("rejects a stored file that is not an allowed type or is too large", async () => {
    putUpload(1, C1, { contentType: "text/html" });
    expect((await create(orderBody())).status).toBe(422);
    putUpload(1, C1, { size: 21 * 1024 * 1024 });
    expect((await create(orderBody())).status).toBe(422);
    expect(db.rows("orders")).toHaveLength(0);
  });
});

describe("POST /api/liff/orders: the shop", () => {
  it("closed -> 409 SHOP_CLOSED; paused -> 409 SHOP_PAUSED; nothing is created or moved", async () => {
    // 23:45 Bangkok is inside the 30 minute cutoff before the 24:00 closing time.
    vi.setSystemTime(new Date("2026-11-12T16:45:00Z"));
    let res = await create(orderBody());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("SHOP_CLOSED");

    vi.setSystemTime(NOW);
    db.rows("shops")[0].is_paused = true;
    res = await create(orderBody());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("SHOP_PAUSED");

    expect(db.rows("orders")).toHaveLength(0);
    expect(db.objects("order-files").has(`pending/${C1}/f1.pdf`)).toBe(true);
    expect(h.notifyShop).not.toHaveBeenCalled();
  });

  it("an unknown or not-active shop is 404", async () => {
    expect((await create(orderBody({ shopId: id(998) }))).status).toBe(404);
    expect((await create(orderBody({ shopId: SHOP_PENDING }))).status).toBe(404);
  });

  it("a shop with no hours for today is closed", async () => {
    db.tables.shop_hours = db
      .rows("shop_hours")
      .filter((r) => !(r.shop_id === SHOP_A && r.weekday === 4));
    const res = await create(orderBody());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("SHOP_CLOSED");
  });
});

describe("POST /api/liff/orders: delivery", () => {
  it("stores the destination and recipient, adds the quoted delivery fee, normalises the phone", async () => {
    const json = await (await create(deliveryBody())).json();
    expect(json.fulfillment).toBe("delivery");
    expect(json.deliveryFeeSatang).toBe(4000);
    expect(db.rows("orders")[0]).toMatchObject({
      delivery_address: "123 ถนนสมมติ",
      delivery_lat: 18.8,
      delivery_lng: 98.96,
      delivery_recipient_name: "สมชาย ใจดี",
      delivery_recipient_phone: "0812345678",
      delivery_fee_satang: 4000,
    });
    expect(JSON.stringify(json)).not.toContain("สมชาย");
  });

  it("needs address, coordinates, recipient name and a Thai phone number", async () => {
    for (const missing of [
      "deliveryAddress",
      "deliveryLat",
      "deliveryRecipientName",
      "deliveryRecipientPhone",
    ]) {
      const body = deliveryBody() as Row;
      delete body[missing];
      expect((await create(body)).status).toBe(422);
    }
    for (const phone of ["12345", "abcdefghij", "0212", "+1 555 123 4567"]) {
      expect((await create(deliveryBody({ deliveryRecipientPhone: phone }))).status).toBe(422);
    }
    expect(db.rows("orders")).toHaveLength(0);
  });

  it("accepts +66 and 02 numbers", async () => {
    expect((await create(deliveryBody({ deliveryRecipientPhone: "+66 81 234 5678" }))).status).toBe(
      200,
    );
    expect(db.rows("orders")[0].delivery_recipient_phone).toBe("0812345678");
    putUpload(2);
    expect(
      (await create(deliveryBody({ files: [fileBody(2)], deliveryRecipientPhone: "02-123-4567" })))
        .status,
    ).toBe(200);
  });

  it("a shop that does not deliver rejects it", async () => {
    db.rows("shops")[0].accepts_delivery = false;
    expect((await create(deliveryBody())).status).toBe(422);
  });

  it("a pickup order does not store stray delivery details", async () => {
    await create(
      orderBody({
        deliveryAddress: "x",
        deliveryLat: 1,
        deliveryLng: 1,
        deliveryRecipientName: "x",
      }),
    );
    expect(db.rows("orders")[0]).toMatchObject({
      delivery_address: null,
      delivery_lat: null,
      delivery_recipient_name: null,
      delivery_fee_satang: 0,
    });
    expect(h.quoteDelivery).not.toHaveBeenCalled();
  });
});

describe("POST /api/liff/orders: files", () => {
  const rejected = async (files: unknown[]) => {
    const res = await create(orderBody({ files }));
    expect(res.status).toBe(422);
    expect(db.rows("orders")).toHaveLength(0);
    expect(db.rows("order_files")).toHaveLength(0);
    return res;
  };

  it("another customer's upload is refused, and so is a path that escapes", async () => {
    putUpload(5, C2);
    await rejected([fileBody(5, { path: pendingPath(5, C2) })]);
    await rejected([fileBody(1, { path: `order-files/pending/${C1}/../${C2}/f5.pdf` })]);
    await rejected([fileBody(1, { path: `order-files/${id(777)}/f1.pdf` })]); // not a pending path
    await rejected([fileBody(1, { path: `payment-slips/pending/${C1}/f1.pdf` })]);
    expect(db.objects("order-files").has(`pending/${C2}/f5.pdf`)).toBe(true);
  });

  it("a file that was never uploaded is refused", async () => {
    await rejected([fileBody(9)]);
  });

  it("the same file twice in one order is refused", async () => {
    await rejected([fileBody(1), fileBody(1)]);
  });

  it("more than 10 files is refused", async () => {
    await rejected(Array.from({ length: 11 }, (_, i) => fileBody(i + 1)));
  });

  it("sending the same request twice makes one order (the files are gone the second time)", async () => {
    expect((await create(orderBody())).status).toBe(200);
    expect((await create(orderBody())).status).toBe(422);
    expect(db.rows("orders")).toHaveLength(1);
    expect(h.notifyShop).toHaveBeenCalledTimes(1);
  });

  it("two requests at the same moment make one order", async () => {
    const results = await Promise.all([create(orderBody()), create(orderBody())]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 422]); // the loser is told the file was used
    expect(db.rows("orders")).toHaveLength(1);
    expect(db.rows("order_files")).toHaveLength(1);
  });
});

describe("POST /api/liff/orders: extra services (D22)", () => {
  it("snapshots name, price, unit and quantity; per_set is one row per file, per_order one row", async () => {
    const json = await (
      await create(
        orderBody({
          files: [fileBody(1, { copies: 2 }), fileBody(2, { copies: 3 })],
          services: [{ serviceId: SVC_BIND, fileIndexes: [1] }, { serviceId: SVC_COVER }],
        }),
      )
    ).json();
    const files = db.rows("order_files");
    const rows = db.rows("order_services");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      order_id: json.id,
      shop_service_id: SVC_BIND,
      name: "เข้าเล่ม",
      unit: "per_set",
      unit_price_satang: 3500,
      quantity: 3,
      order_file_id: files[1].id,
    });
    expect(rows[1]).toMatchObject({
      unit: "per_order",
      unit_price_satang: 2000,
      quantity: 1,
      order_file_id: null,
    });
    expect(json.estimatedServicesSatang).toBe(3500 * 3 + 2000);
  });

  it("a price sent by the client has no effect; a later price change by the shop does not touch the old order", async () => {
    const json = await (
      await create(orderBody({ services: [{ serviceId: SVC_BIND, priceSatang: 1, name: "ฟรี" }] }))
    ).json();
    expect(db.rows("order_services")[0]).toMatchObject({
      name: "เข้าเล่ม",
      unit_price_satang: 3500,
    });

    const service = db.rows("shop_services").find((s) => s.id === SVC_BIND) as Row;
    service.price_satang = 9900;
    service.name = "เข้าเล่มแพงขึ้น";
    expect(db.rows("order_services")[0]).toMatchObject({
      name: "เข้าเล่ม",
      unit_price_satang: 3500,
    });

    const detail = await (await getDetail(json.id)).json();
    expect(detail.services[0]).toMatchObject({ name: "เข้าเล่ม", unitPriceSatang: 3500 });
  });

  it("a service priced by agreement makes the order manual", async () => {
    const json = await (await create(orderBody({ services: [{ serviceId: SVC_NEG }] }))).json();
    expect(json.requiresManualPrice).toBe(true);
    expect(db.rows("order_services")[0]).toMatchObject({ unit_price_satang: null });
    expect(db.rows("orders")[0]).toMatchObject({
      requires_manual_price: true,
      estimated_services_satang: 0,
    });
  });

  it("another shop's service, an inactive one or an unknown one is 422 and nothing is created", async () => {
    for (const serviceId of [SVC_OTHER, SVC_OFF, id(999)]) {
      expect((await create(orderBody({ services: [{ serviceId }] }))).status).toBe(422);
    }
    expect(db.rows("orders")).toHaveLength(0);
    expect(db.objects("order-files").has(`pending/${C1}/f1.pdf`)).toBe(true);
  });
});

describe("POST /api/liff/orders: a failure leaves no half order", () => {
  const nothingLeft = (movedBack = true) => {
    expect(db.rows("orders")).toHaveLength(0);
    expect(db.rows("order_files")).toHaveLength(0);
    expect(db.rows("order_services")).toHaveLength(0);
    if (movedBack) {
      expect(db.objects("order-files").has(`pending/${C1}/f1.pdf`)).toBe(true);
      expect(db.objects("order-files").has(`pending/${C1}/f2.pdf`)).toBe(true);
    }
    expect(h.notifyShop).not.toHaveBeenCalled();
  };
  const twoFiles = () =>
    orderBody({ files: [fileBody(1), fileBody(2)], services: [{ serviceId: SVC_BIND }] });

  it("the order row cannot be saved", async () => {
    db.failures.set("orders.insert", "boom");
    expect((await create(twoFiles())).status).toBe(500);
    nothingLeft();
  });

  it("the file rows cannot be saved: the order row is removed again", async () => {
    db.failures.set("order_files.insert", "boom");
    expect((await create(twoFiles())).status).toBe(500);
    nothingLeft();
  });

  it("the service rows cannot be saved: order and file rows are removed again", async () => {
    db.failures.set("order_services.insert", "boom");
    expect((await create(twoFiles())).status).toBe(500);
    nothingLeft();
  });

  it("moving the second file fails: the first goes back and the rows are removed", async () => {
    db.failMoveOnCall = 2;
    expect((await create(twoFiles())).status).toBe(500);
    nothingLeft();
  });

  it("if a file cannot be moved back it is removed from the order folder and the problem is logged", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    db.failMoveCalls = new Set([2, 3]); // the second move, then the move back of the first
    expect((await create(twoFiles())).status).toBe(500);
    expect(db.rows("orders")).toHaveLength(0);
    expect(db.rows("order_files")).toHaveLength(0);
    expect([...db.objects("order-files").keys()].filter((k) => !k.startsWith("pending/"))).toEqual(
      [],
    );
    expect(err.mock.calls.flat().join(" ")).toContain("needs manual cleanup");
  });

  it("the 500 does not reveal the cause", async () => {
    db.failures.set("order_files.insert", "secret detail");
    const body = await (await create(orderBody())).json();
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});

describe("POST /api/liff/orders: input", () => {
  it("rejects bad bodies and needs a login", async () => {
    for (const bad of [
      orderBody({ files: [] }),
      orderBody({ shopId: "nope" }),
      orderBody({ customerNote: "ก".repeat(501) }),
      orderBody({ files: [fileBody(1, { mime: "text/html" })] }),
      orderBody({ files: [fileBody(1, { copies: 0 })] }),
      orderBody({ files: [fileBody(1, { pageCount: 0 })] }),
      {},
    ]) {
      expect((await create(bad)).status).toBe(422);
    }
    expect((await post(createRoute, "not json", true)).status).toBe(422);
    h.requireCustomer.mockRejectedValue(new ApiError("UNAUTHENTICATED", 401));
    expect((await create(orderBody())).status).toBe(401);
    expect(db.rows("orders")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
let seq = 5000;
function seedOrder(over: Row = {}): Row {
  const order: Row = {
    id: id(seq++),
    created_at: T,
    order_no: `PG-${seq}`,
    customer_id: C1,
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
    estimated_print_satang: 1000,
    estimated_services_satang: 0,
    print_subtotal_satang: null,
    platform_fee_satang: null,
    delivery_fee_satang: 0,
    total_satang: null,
    reject_reason: null,
    response_deadline: new Date(NOW.getTime() + 600_000).toISOString(),
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
const paidFields = {
  print_subtotal_satang: 1000,
  platform_fee_satang: 300,
  total_satang: 1300,
  pickup_code: "4821",
};

describe("GET /api/liff/orders", () => {
  it("lists only my orders, newest first", async () => {
    const older = seedOrder({ created_at: "2026-11-11T00:00:00.000Z" });
    const newer = seedOrder({ created_at: "2026-11-12T00:00:00.000Z" });
    seedOrder({ customer_id: C2 });
    const body = await (await list()).json();
    expect(body.map((o: Row) => o.id)).toEqual([newer.id, older.id]);
    expect(body[0].shopName).toBe("ร้านตัวอย่าง A");
    expect(body.every((o: Row) => o.shopId === SHOP_A)).toBe(true);
  });

  it("expires overdue orders first (lazy expiry) and tells the customer", async () => {
    const late = seedOrder({ response_deadline: new Date(NOW.getTime() - 60_000).toISOString() });
    const body = await (await list()).json();
    expect(body[0].status).toBe("expired");
    expect(db.rows("orders").find((o) => o.id === late.id)?.status).toBe("expired");
    expect(h.notify).toHaveBeenCalledWith(late.id, "order_expired");
  });

  it("returns an empty list for a customer with no orders, and needs a login", async () => {
    expect(await (await list()).json()).toEqual([]);
    h.requireCustomer.mockRejectedValue(new ApiError("UNAUTHENTICATED", 401));
    expect((await list()).status).toBe(401);
  });
});

describe("GET /api/liff/orders/:id", () => {
  function seedFull(over: Row = {}) {
    const order = seedOrder({ status: "paid", ...paidFields, ...over });
    const fileId = id(8001);
    db.rows("order_files").push({
      id: fileId,
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
      shop_service_id: SVC_BIND,
      name: "เข้าเล่ม",
      unit: "per_set",
      unit_price_satang: 3500,
      order_file_id: fileId,
      quantity: 2,
    });
    const payment = (pid: number, createdAt: string, status: string) =>
      db.rows("payments").push({
        id: id(pid),
        created_at: createdAt,
        order_id: order.id,
        amount_satang: 1300,
        status,
        slip_path: "payment-slips/secret.png",
        slip_ref: "REF-SECRET",
        verified_by: null,
        verified_at: null,
        reject_reason: null,
      });
    payment(8003, "2026-11-12T01:00:00.000Z", "rejected");
    payment(8004, "2026-11-12T02:00:00.000Z", "verified");
    return order;
  }

  it("returns the full OrderDetail of my order", async () => {
    const order = seedFull({
      fulfillment: "delivery",
      delivery_address: "123 ถนนสมมติ",
      delivery_lat: 18.8,
      delivery_lng: 98.9,
      delivery_recipient_name: "สมชาย",
      delivery_recipient_phone: "0812345678",
    });
    db.rows("deliveries").push({
      id: id(8005),
      created_at: T,
      order_id: order.id,
      provider: "manual",
      provider_ref: "internal",
      status: "pending_admin",
      fee_satang: null,
      tracking_url: null,
      note: null,
      updated_at: T,
    });
    const res = await getDetail(order.id as string);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual(Object.keys(OrderDetail.shape).sort());
    expect(json.files).toEqual([
      {
        id: id(8001),
        originalName: "รายงาน.pdf",
        mime: "application/pdf",
        sizeBytes: 5000,
        pageCount: 10,
        color: "bw",
        paper: "A4",
        sides: "single",
        copies: 2,
      },
    ]);
    expect(json.services).toEqual([
      {
        id: id(8002),
        name: "เข้าเล่ม",
        unit: "per_set",
        unitPriceSatang: 3500,
        fileId: id(8001),
        quantity: 2,
        lineTotalSatang: 7000,
      },
    ]);
    expect(json.payment).toMatchObject({ id: id(8004), status: "verified", amountSatang: 1300 }); // the latest
    expect(json.delivery).toMatchObject({ provider: "manual", status: "pending_admin" });
    expect(json.shop).toEqual({
      id: SHOP_A,
      name: "ร้านตัวอย่าง A",
      address: "ที่อยู่สมมติ",
      phone: "0800000000",
    });
    expect(json).toMatchObject({
      deliveryAddress: "123 ถนนสมมติ",
      deliveryRecipientName: "สมชาย",
      deliveryRecipientPhone: "0812345678",
    });
  });

  it("never exposes slip details or storage paths", async () => {
    const order = seedFull();
    const text = JSON.stringify(await (await getDetail(order.id as string)).json());
    for (const secret of [
      "slip",
      "REF-SECRET",
      "payment-slips",
      "storage",
      "order-files/",
      "providerRef",
      "internal",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("shows the pickup code only for a pickup order that is paid, printing or ready", async () => {
    const seen = async (over: Row) => {
      const order = seedFull(over);
      return (await (await getDetail(order.id as string)).json()).pickupCode;
    };
    expect(await seen({ status: "paid" })).toBe("4821");
    expect(await seen({ status: "printing" })).toBe("4821");
    expect(await seen({ status: "ready" })).toBe("4821");
    expect(await seen({ status: "completed" })).toBeNull();
    expect(await seen({ status: "cancelled" })).toBeNull();
    expect(
      await seen({
        status: "ready",
        fulfillment: "delivery",
        delivery_address: "x",
        delivery_lat: 1,
        delivery_lng: 1,
        delivery_recipient_name: "x",
        delivery_recipient_phone: "0812345678",
      }),
    ).toBeNull();
  });

  it("hides our estimate and service prices while the shop still has to set the price", async () => {
    const order = seedFull({
      status: "submitted",
      requires_manual_price: true,
      print_subtotal_satang: null,
      platform_fee_satang: null,
      total_satang: null,
      pickup_code: null,
    });
    const json = await (await getDetail(order.id as string)).json();
    expect(json.estimatedPrintSatang).toBeNull();
    expect(json.estimatedServicesSatang).toBeNull();
    expect(json.services[0]).toMatchObject({ unitPriceSatang: null, lineTotalSatang: null });
  });

  it("someone else's order, an unknown order and a bad id are all 404", async () => {
    const theirs = seedOrder({ customer_id: C2 });
    const mine = seedOrder();
    const a = await getDetail(theirs.id as string);
    const b = await getDetail(id(4242));
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(await a.json()).toEqual(await b.json());
    expect((await getDetail("not-a-uuid")).status).toBe(404);
    expect((await getDetail(mine.id as string)).status).toBe(200);
  });

  it("expires an overdue order before showing it", async () => {
    const o = seedOrder({
      status: "awaiting_payment",
      ...paidFields,
      pickup_code: null,
      payment_deadline: new Date(NOW.getTime() - 1000).toISOString(),
    });
    expect((await (await getDetail(o.id as string)).json()).status).toBe("expired");
  });

  it("needs a login", async () => {
    h.requireCustomer.mockRejectedValue(new ApiError("UNAUTHENTICATED", 401));
    expect((await getDetail(id(1))).status).toBe(401);
  });
});

describe("POST /api/liff/orders/:id/cancel", () => {
  it("cancels before the shop answered, and before payment", async () => {
    for (const status of ["submitted", "awaiting_payment"]) {
      const o = seedOrder({
        status,
        ...(status === "awaiting_payment" ? { ...paidFields, pickup_code: null } : {}),
      });
      const res = await cancel(o.id as string);
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("cancelled");
      expect(db.rows("orders").find((r) => r.id === o.id)?.status).toBe("cancelled");
      expect(h.notify).toHaveBeenCalledWith(o.id, "order_cancelled");
    }
    expect(db.rows("refunds")).toHaveLength(0);
  });

  it("cannot cancel after payment (D19): 409 and nothing changes", async () => {
    for (const status of [
      "paid",
      "printing",
      "ready",
      "courier_requested",
      "in_transit",
      "completed",
      "rejected",
      "cancelled",
      "expired",
    ]) {
      const o = seedOrder({ status, ...paidFields });
      const res = await cancel(o.id as string);
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("ORDER_INVALID_TRANSITION");
      expect(db.rows("orders").find((r) => r.id === o.id)?.status).toBe(status);
    }
    expect(db.rows("refunds")).toHaveLength(0);
  });

  it("someone else's order is 404 and stays as it was", async () => {
    const o = seedOrder({ customer_id: C2 });
    expect((await cancel(o.id as string)).status).toBe(404);
    expect(db.rows("orders").find((r) => r.id === o.id)?.status).toBe("submitted");
    expect((await cancel(id(4242))).status).toBe(404);
    expect((await cancel("nope")).status).toBe(404);
  });

  it("cancelling twice: the second answer is 409", async () => {
    const o = seedOrder();
    expect((await cancel(o.id as string)).status).toBe(200);
    expect((await cancel(o.id as string)).status).toBe(409);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it("an overdue order is expired first, so cancelling it is 409", async () => {
    const o = seedOrder({ response_deadline: new Date(NOW.getTime() - 1000).toISOString() });
    expect((await cancel(o.id as string)).status).toBe(409);
    expect(db.rows("orders").find((r) => r.id === o.id)?.status).toBe("expired");
  });

  it("needs a login", async () => {
    h.requireCustomer.mockRejectedValue(new ApiError("UNAUTHENTICATED", 401));
    expect((await cancel(id(1))).status).toBe(401);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as liffChats } from "@/app/api/liff/chats/route";
import { POST as liffRead } from "@/app/api/liff/orders/[id]/messages/read/route";
import { GET as liffMessages, POST as liffSend } from "@/app/api/liff/orders/[id]/messages/route";
import { GET as liffOrder } from "@/app/api/liff/orders/[id]/route";
import { GET as liffOrders } from "@/app/api/liff/orders/route";
import { GET as shopChats } from "@/app/api/shop/chats/route";
import { POST as shopRead } from "@/app/api/shop/orders/[id]/messages/read/route";
import { GET as shopMessages, POST as shopSend } from "@/app/api/shop/orders/[id]/messages/route";
import { GET as shopOrder } from "@/app/api/shop/orders/[id]/route";
import { GET as shopOrders } from "@/app/api/shop/orders/route";
import { POST as pushSubscribe } from "@/app/api/shop/push/subscribe/route";
import { POST as pushUnsubscribe } from "@/app/api/shop/push/unsubscribe/route";
import type { Access } from "@/lib/auth/access";
import { FakeSupabase, type Row } from "@/lib/domain/testing/fakeSupabase";

// FakeSupabase is in memory (not Postgres). Auth is mocked (the real assertShopAccess decides shop
// access); notify / notifyShop are mocks, so "the customer got a LINE message" is NOT tested here.
const h = vi.hoisted(() => ({
  db: null as unknown,
  customerId: "",
  customerLoggedIn: true,
  shopId: "",
  access: null as unknown,
  notify: vi.fn(),
  notifyShop: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({ getServiceClient: () => h.db }));
vi.mock("@/lib/line/notify", () => ({ notify: h.notify }));
vi.mock("@/lib/push/notifyShop", () => ({ notifyShop: h.notifyShop }));
vi.mock("@/lib/delivery", () => ({ createDeliveryForOrder: vi.fn(), quoteDelivery: vi.fn() }));
vi.mock("@/lib/auth", async () => {
  const { assertShopAccess } = await import("@/lib/auth/access");
  const { ApiError } = await import("@/lib/errors");
  return {
    requireCustomer: async () => {
      if (!h.customerLoggedIn) throw new ApiError("UNAUTHENTICATED", 401);
      return { customerId: h.customerId, lineUserId: "u" };
    },
    requireShop: async (_req: Request, opts?: { allowPending?: boolean }) => {
      const { shopId } = assertShopAccess(h.access as Access | null, opts);
      return { authUserId: "auth-user-1", shopId };
    },
  };
});

const NOW = new Date("2026-11-12T05:00:00.000Z");
const T = NOW.toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const C1 = id(201);
const C2 = id(202);
const SHOP_A = id(101);
const SHOP_B = id(102);

let db: FakeSupabase;
let seq = 5000;

function seedOrder(over: Row = {}): Row {
  const order: Row = {
    id: id(seq++),
    created_at: T,
    order_no: `PG-${seq}`,
    customer_id: C1,
    shop_id: SHOP_A,
    status: "paid",
    fulfillment: "pickup",
    requires_manual_price: false,
    estimated_print_satang: 1000,
    estimated_services_satang: 0,
    print_subtotal_satang: 1000,
    platform_fee_satang: 300,
    delivery_fee_satang: 0,
    total_satang: 1300,
    response_deadline: new Date(NOW.getTime() + 600_000).toISOString(),
    pickup_code: "4821",
    paid_at: T,
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
    "completed_at",
  ]) {
    order[col] ??= null;
  }
  db.rows("orders").push(order);
  return order;
}
const seedMessage = (orderId: unknown, sender: string, body: string, at: string, over: Row = {}) =>
  db.rows("messages").push({
    id: id(seq++),
    created_at: at,
    order_id: orderId,
    sender,
    body,
    read_at: null,
    push_sent_at: null,
    ...over,
  });

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const withId = (orderId: string) => ({ params: Promise.resolve({ id: orderId }) });
type Handler = (req: Request, ctx: never) => Promise<Response>;
const call = (
  handler: Handler,
  orderId?: string,
  init: { method?: string; body?: unknown; query?: string } = {},
) =>
  handler(
    new Request(`http://localhost/x${init.query ?? ""}`, {
      method: init.method ?? "GET",
      headers: { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    (orderId ? withId(orderId) : undefined) as never,
  );
const send = (handler: Handler, orderId: string, body: unknown) =>
  call(handler, orderId, { method: "POST", body: typeof body === "string" ? { body } : body });
const as = (who: "c1" | "c2" | "shopA" | "shopB") => {
  if (who === "c1" || who === "c2") h.customerId = who === "c1" ? C1 : C2;
  else {
    h.shopId = who === "shopA" ? SHOP_A : SHOP_B;
    h.access = { role: "shop", shopId: h.shopId, shopStatus: "active" } satisfies Access;
  }
};
const messagesOf = (orderId: unknown) => db.rows("messages").filter((m) => m.order_id === orderId);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  db = new FakeSupabase();
  h.db = db;
  h.customerLoggedIn = true;
  as("c1");
  as("shopA");
  h.notify.mockReset().mockResolvedValue(undefined);
  h.notifyShop.mockReset().mockResolvedValue(undefined);
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
      lat: 1,
      lng: 1,
      status: "active",
      is_paused: false,
      accepts_delivery: true,
      cutoff_minutes: 30,
    });
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
describe("sending and reading", () => {
  it("both sides see each other's messages, with the sender decided by who is logged in", async () => {
    const o = seedOrder();
    const a = await (await send(liffSend, o.id as string, "สวัสดีครับ")).json();
    vi.advanceTimersByTime(1000);
    as("shopA");
    const b = await (await send(shopSend, o.id as string, "สวัสดีค่ะ")).json();
    expect(a).toMatchObject({ sender: "customer", body: "สวัสดีครับ", orderId: o.id });
    expect(b).toMatchObject({ sender: "shop", body: "สวัสดีค่ะ" });
    expect(Object.keys(a).sort()).toEqual(["body", "createdAt", "id", "orderId", "sender"]);

    const shopSees = await (await call(shopMessages, o.id as string)).json();
    as("c1");
    const customerSees = await (await call(liffMessages, o.id as string)).json();
    expect(shopSees.map((m: Row) => m.body)).toEqual(["สวัสดีครับ", "สวัสดีค่ะ"]);
    expect(customerSees).toEqual(shopSees);
  });

  it("a sender sent in the body is ignored", async () => {
    const o = seedOrder();
    const m = await (
      await call(liffSend, o.id as string, {
        method: "POST",
        body: { body: "hi", sender: "shop", orderId: id(999), readAt: T },
      })
    ).json();
    expect(m.sender).toBe("customer");
    expect(m.orderId).toBe(o.id);
    expect(messagesOf(o.id)[0]).toMatchObject({ sender: "customer", read_at: null });
  });

  it("system messages are shown to both sides", async () => {
    const o = seedOrder();
    seedMessage(o.id, "system", "ร้านปรับเวลาเสร็จ", T);
    expect((await (await call(liffMessages, o.id as string)).json())[0].sender).toBe("system");
    as("shopA");
    expect((await (await call(shopMessages, o.id as string)).json())[0].sender).toBe("system");
  });

  it("messages are stored as typed: HTML and scripts stay raw text", async () => {
    const o = seedOrder();
    const html = `<script>alert("x")</script> <b>ตัวหนา</b> & "quotes"`;
    const m = await (await send(liffSend, o.id as string, html)).json();
    expect(m.body).toBe(html);
    expect(messagesOf(o.id)[0].body).toBe(html);
    expect((await (await call(liffMessages, o.id as string)).json())[0].body).toBe(html);
  });

  it("trims, keeps line breaks, drops control characters and NUL bytes", async () => {
    const o = seedOrder();
    const m = await (
      await send(liffSend, o.id as string, "  บรรทัดหนึ่ง\r\nบรรทัดสอง\u0000\u0007\tท้าย  ")
    ).json();
    expect(m.body).toBe("บรรทัดหนึ่ง\nบรรทัดสอง\tท้าย");
  });

  it("drops text direction overrides and broken emoji halves instead of failing", async () => {
    const o = seedOrder();
    const m = await (
      await send(liffSend, o.id as string, "ก\u202eข\u2066ค\ud800ง\udc00จ😀")
    ).json();
    expect(m.body).toBe("กขคงจ😀");
    expect((await send(liffSend, o.id as string, "\u202e\ud800")).status).toBe(422); // nothing left
  });

  it("allows 1000 characters (emoji count as one each) and refuses 1001 or none", async () => {
    const o = seedOrder();
    expect((await send(liffSend, o.id as string, "ก".repeat(1000))).status).toBe(200);
    vi.advanceTimersByTime(61_000);
    expect((await send(liffSend, o.id as string, "😀".repeat(1000))).status).toBe(200);
    for (const bad of ["ก".repeat(1001), "😀".repeat(1001), "", "   \n\t ", "\u0000\u0007"]) {
      const res = await send(liffSend, o.id as string, bad);
      expect(res.status).toBe(422);
      expect((await res.json()).error.message).toMatch(/[฀-๿]/);
    }
    for (const bad of [{}, { body: 5 }, { body: null }, { body: ["a"] }]) {
      expect((await send(liffSend, o.id as string, bad)).status).toBe(422);
    }
    expect((await call(liffSend, o.id as string, { method: "POST" })).status).toBe(422);
    expect(messagesOf(o.id)).toHaveLength(2);
  });
});

describe("a closed room (the order has ended)", () => {
  it.each(["completed", "rejected", "cancelled", "expired"])(
    "%s: nobody can send, everybody can still read",
    async (status) => {
      const o = seedOrder({ status });
      seedMessage(o.id, "shop", "ข้อความเก่า", ago(1000));
      expect((await send(liffSend, o.id as string, "ส่งไม่ได้")).status).toBe(409);
      const closed = await send(liffSend, o.id as string, "ส่งไม่ได้");
      expect((await closed.json()).error.code).toBe("CHAT_CLOSED");
      as("shopA");
      expect((await send(shopSend, o.id as string, "ส่งไม่ได้")).status).toBe(409);
      expect(messagesOf(o.id)).toHaveLength(1);
      expect(h.notify).not.toHaveBeenCalled();
      expect(h.notifyShop).not.toHaveBeenCalled();
      expect(await (await call(shopMessages, o.id as string)).json()).toHaveLength(1);
      as("c1");
      expect((await (await call(liffMessages, o.id as string)).json())[0].body).toBe("ข้อความเก่า");
    },
  );

  it("open states can send", async () => {
    for (const status of [
      "submitted",
      "awaiting_payment",
      "paid",
      "printing",
      "ready",
      "courier_requested",
      "in_transit",
    ]) {
      const o = seedOrder({ status });
      expect((await send(liffSend, o.id as string, "ได้")).status, status).toBe(200);
    }
  });

  it("an order whose time ran out is expired first, so its room is closed at once", async () => {
    const o = seedOrder({ status: "submitted", response_deadline: ago(1000) });
    const res = await send(liffSend, o.id as string, "ยังอยู่ไหม");
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CHAT_CLOSED");
    expect(db.rows("orders").find((r) => r.id === o.id)?.status).toBe("expired");
  });

  it("marking as read still works in a closed room", async () => {
    const o = seedOrder({ status: "completed" });
    seedMessage(o.id, "shop", "x", ago(1000));
    expect((await call(liffRead, o.id as string, { method: "POST" })).status).toBe(200);
    expect(messagesOf(o.id)[0].read_at).not.toBeNull();
  });
});

describe("only the people of the order", () => {
  it("another customer cannot read, send or mark read, and sees a plain 404", async () => {
    const o = seedOrder();
    seedMessage(o.id, "shop", "ส่วนตัว", ago(1000));
    as("c2");
    const read = await call(liffMessages, o.id as string);
    const send1 = await send(liffSend, o.id as string, "แทรก");
    const mark = await call(liffRead, o.id as string, { method: "POST" });
    const missing = await call(liffMessages, id(4242));
    expect([read.status, send1.status, mark.status]).toEqual([404, 404, 404]);
    expect(await read.json()).toEqual(await missing.json());
    expect(messagesOf(o.id)).toHaveLength(1);
    expect(messagesOf(o.id)[0].read_at).toBeNull();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("another shop cannot read, send or mark read", async () => {
    const o = seedOrder();
    seedMessage(o.id, "customer", "ส่วนตัว", ago(1000));
    as("shopB");
    expect((await call(shopMessages, o.id as string)).status).toBe(404);
    expect((await send(shopSend, o.id as string, "แทรก")).status).toBe(404);
    expect((await call(shopRead, o.id as string, { method: "POST" })).status).toBe(404);
    expect(messagesOf(o.id)).toHaveLength(1);
    expect(messagesOf(o.id)[0].read_at).toBeNull();
  });

  it("the customer routes do not work for a shop's order id of someone else and the other way round", async () => {
    const mine = seedOrder();
    const theirs = seedOrder({ customer_id: C2 });
    seedMessage(theirs.id, "shop", "ของคนอื่น", ago(1000));
    expect((await call(liffMessages, theirs.id as string)).status).toBe(404);
    expect(await (await call(liffMessages, mine.id as string)).json()).toEqual([]);
  });

  it("messages of one order never show up in another order", async () => {
    const o1 = seedOrder();
    const o3 = seedOrder({ shop_id: SHOP_B });
    await send(liffSend, o1.id as string, "ห้องหนึ่ง");
    await send(liffSend, o3.id as string, "ห้องสาม");
    expect(
      (await (await call(liffMessages, o1.id as string)).json()).map((m: Row) => m.body),
    ).toEqual(["ห้องหนึ่ง"]);
    expect(
      (await (await call(liffMessages, o3.id as string)).json()).map((m: Row) => m.body),
    ).toEqual(["ห้องสาม"]);
    as("shopB");
    expect(
      (await (await call(shopMessages, o3.id as string)).json()).map((m: Row) => m.body),
    ).toEqual(["ห้องสาม"]);
  });

  it("a bad order id is 404 and a logged-out caller is refused", async () => {
    expect((await call(liffMessages, "nope")).status).toBe(404);
    h.customerLoggedIn = false;
    expect((await call(liffMessages, id(1))).status).toBe(401);
    h.access = null;
    expect((await call(shopMessages, id(1))).status).toBe(403);
  });

  it("a shop that is still pending cannot use the chat routes", async () => {
    const o = seedOrder();
    h.access = { role: "shop", shopId: SHOP_A, shopStatus: "pending" } satisfies Access;
    expect((await call(shopMessages, o.id as string)).status).toBe(403);
    expect((await send(shopSend, o.id as string, "x")).status).toBe(403);
    expect((await call(shopChats)).status).toBe(403);
  });
});

describe("rate limit", () => {
  it("20 messages in a minute from one side, then RATE_LIMITED; later it works again", async () => {
    const o = seedOrder();
    for (let i = 0; i < 20; i++)
      expect((await send(liffSend, o.id as string, `ข้อความ ${i}`)).status).toBe(200);
    const blocked = await send(liffSend, o.id as string, "ข้อความที่ 21");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe("RATE_LIMITED");
    expect(messagesOf(o.id)).toHaveLength(20);
    vi.advanceTimersByTime(61_000);
    expect((await send(liffSend, o.id as string, "ผ่านแล้ว")).status).toBe(200);
  });

  it("is counted per side and per order", async () => {
    const o = seedOrder();
    const other = seedOrder();
    for (let i = 0; i < 20; i++) await send(liffSend, o.id as string, `c${i}`);
    expect((await send(liffSend, o.id as string, "เกิน")).status).toBe(429);
    expect((await send(liffSend, other.id as string, "อีกห้อง")).status).toBe(200);
    as("shopA");
    expect((await send(shopSend, o.id as string, "ร้านตอบได้")).status).toBe(200);
  });
});

describe("GET ?after= and the page size", () => {
  function seedMany(orderId: unknown, count: number) {
    for (let i = 0; i < count; i++) {
      seedMessage(
        orderId,
        i % 2 ? "shop" : "customer",
        `m${String(i).padStart(3, "0")}`,
        new Date(NOW.getTime() - (count - i) * 1000).toISOString(),
      );
    }
  }

  it("without after: the latest 100, oldest first", async () => {
    const o = seedOrder();
    seedMany(o.id, 150);
    const list = await (await call(liffMessages, o.id as string)).json();
    expect(list).toHaveLength(100);
    expect(list[0].body).toBe("m050");
    expect(list[99].body).toBe("m149");
  });

  it("with after: only strictly newer messages, oldest first, at most 100", async () => {
    const o = seedOrder();
    seedMany(o.id, 150);
    const first = messagesOf(o.id)[0].created_at as string;
    const page = await (
      await call(liffMessages, o.id as string, { query: `?after=${encodeURIComponent(first)}` })
    ).json();
    expect(page).toHaveLength(100);
    expect(page[0].body).toBe("m001"); // the message at exactly `after` is not repeated
    expect(page[99].body).toBe("m100");
    const next = await (
      await call(liffMessages, o.id as string, {
        query: `?after=${encodeURIComponent(page[99].createdAt)}`,
      })
    ).json();
    expect(next.map((m: Row) => m.body)).toEqual(
      Array.from({ length: 49 }, (_, i) => `m${String(101 + i).padStart(3, "0")}`),
    );
  });

  it("nothing new gives an empty list, and a bad time is 422", async () => {
    const o = seedOrder();
    seedMessage(o.id, "shop", "a", ago(1000));
    expect(
      await (
        await call(liffMessages, o.id as string, {
          query: `?after=${encodeURIComponent(NOW.toISOString())}`,
        })
      ).json(),
    ).toEqual([]);
    for (const bad of ["yesterday", "2026-13-45", "123", ""]) {
      const res = await call(liffMessages, o.id as string, {
        query: `?after=${encodeURIComponent(bad)}`,
      });
      expect(res.status, bad).toBe(422);
    }
  });

  it("accepts a time with an offset or microseconds as Postgres writes it", async () => {
    const o = seedOrder();
    expect(
      (
        await call(liffMessages, o.id as string, {
          query: `?after=${encodeURIComponent("2026-11-12T05:00:00.123456+00:00")}`,
        })
      ).status,
    ).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------
describe("notifications (only the first of a burst)", () => {
  it("a shop sending 3 in a row makes one LINE notification; push_sent_at marks the first", async () => {
    const o = seedOrder();
    as("shopA");
    const ids: string[] = [];
    for (const text of ["หนึ่ง", "สอง", "สาม"]) {
      ids.push((await (await send(shopSend, o.id as string, text)).json()).id);
      vi.advanceTimersByTime(1000);
    }
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledWith(o.id, "chat_message");
    expect(h.notifyShop).not.toHaveBeenCalled();
    const stored = ids.map((mid) => messagesOf(o.id).find((m) => m.id === mid) as Row);
    expect(stored.map((m) => m.push_sent_at !== null)).toEqual([true, false, false]);
  });

  it("once the customer has read, the next shop message notifies again", async () => {
    const o = seedOrder();
    as("shopA");
    await send(shopSend, o.id as string, "หนึ่ง");
    await send(shopSend, o.id as string, "สอง");
    expect(h.notify).toHaveBeenCalledTimes(1);
    as("c1");
    await call(liffRead, o.id as string, { method: "POST" });
    as("shopA");
    await send(shopSend, o.id as string, "สาม");
    expect(h.notify).toHaveBeenCalledTimes(2);
  });

  it("a customer sending 3 in a row makes one shop notification, with the order", async () => {
    const o = seedOrder();
    for (const text of ["หนึ่ง", "สอง", "สาม"]) await send(liffSend, o.id as string, text);
    expect(h.notifyShop).toHaveBeenCalledTimes(1);
    expect(h.notifyShop).toHaveBeenCalledWith(SHOP_A, "chat_message", {
      orderId: o.id,
      orderNo: o.order_no,
    });
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("the two sides do not suppress each other, and system messages do not either", async () => {
    const o = seedOrder();
    seedMessage(o.id, "system", "ระบบ", ago(2000));
    await send(liffSend, o.id as string, "จากลูกค้า");
    as("shopA");
    await send(shopSend, o.id as string, "จากร้าน");
    expect(h.notifyShop).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it("an older unread message of the same side from before the room's history still counts", async () => {
    const o = seedOrder();
    seedMessage(o.id, "shop", "ค้างอยู่", ago(3600_000));
    as("shopA");
    await send(shopSend, o.id as string, "ใหม่");
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("a failing notify never fails the message", async () => {
    h.notify.mockRejectedValue(new Error("LINE down"));
    const o = seedOrder();
    as("shopA");
    const res = await send(shopSend, o.id as string, "ข้อความ");
    expect(res.status).toBe(200);
    expect(messagesOf(o.id)).toHaveLength(1);
    expect(messagesOf(o.id)[0].push_sent_at).toBeNull(); // not marked as sent
  });

  it("nobody else is told: no notification for a rejected message", async () => {
    const o = seedOrder();
    as("c2");
    await send(liffSend, o.id as string, "แทรก");
    await send(liffSend, o.id as string, "");
    expect(h.notifyShop).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
describe("read and unread counts", () => {
  it("read clears only the other side's messages; the counts are right on both sides", async () => {
    const o = seedOrder();
    seedMessage(o.id, "shop", "ร้าน 1", ago(5000));
    seedMessage(o.id, "shop", "ร้าน 2", ago(4000));
    seedMessage(o.id, "customer", "ลูกค้า 1", ago(3000));
    seedMessage(o.id, "system", "ระบบ", ago(2000));

    const customerBefore = await (await call(liffOrder, o.id as string)).json();
    as("shopA");
    const shopBefore = await (await call(shopOrder, o.id as string)).json();
    expect(customerBefore.unreadMessageCount).toBe(2);
    expect(shopBefore.unreadMessageCount).toBe(1);

    as("c1");
    const res = await call(liffRead, o.id as string, { method: "POST" });
    expect(await res.json()).toEqual({ unreadMessageCount: 0 });
    expect(
      messagesOf(o.id)
        .filter((m) => m.sender === "shop")
        .every((m) => m.read_at !== null),
    ).toBe(true);
    expect(messagesOf(o.id).find((m) => m.sender === "customer")?.read_at).toBeNull(); // not ours to clear
    expect(messagesOf(o.id).find((m) => m.sender === "system")?.read_at).toBeNull();

    expect((await (await call(liffOrder, o.id as string)).json()).unreadMessageCount).toBe(0);
    as("shopA");
    expect((await (await call(shopOrder, o.id as string)).json()).unreadMessageCount).toBe(1);
    await call(shopRead, o.id as string, { method: "POST" });
    expect((await (await call(shopOrder, o.id as string)).json()).unreadMessageCount).toBe(0);
  });

  it("read only touches this order", async () => {
    const a = seedOrder();
    const b = seedOrder();
    seedMessage(a.id, "shop", "a", ago(3000));
    seedMessage(b.id, "shop", "b", ago(3000));
    await call(liffRead, a.id as string, { method: "POST" });
    expect(messagesOf(a.id)[0].read_at).not.toBeNull();
    expect(messagesOf(b.id)[0].read_at).toBeNull();
  });

  it("a new message after reading counts as unread again", async () => {
    const o = seedOrder();
    seedMessage(o.id, "shop", "เก่า", ago(5000), { read_at: ago(4000) });
    seedMessage(o.id, "shop", "ใหม่", ago(1000));
    expect((await (await call(liffOrder, o.id as string)).json()).unreadMessageCount).toBe(1);
  });

  it("the order lists carry the count for every order", async () => {
    const o1 = seedOrder({ created_at: "2026-11-11T00:00:00.000Z" });
    const o2 = seedOrder({ created_at: "2026-11-12T00:00:00.000Z" });
    seedMessage(o1.id, "shop", "x", ago(3000));
    seedMessage(o1.id, "shop", "y", ago(2000));
    const mine = await (await call(liffOrders)).json();
    expect(mine.map((o: Row) => [o.id, o.unreadMessageCount])).toEqual([
      [o2.id, 0],
      [o1.id, 2],
    ]);
    seedMessage(o2.id, "customer", "z", ago(1000));
    as("shopA");
    const shops = await (await call(shopOrders)).json();
    expect(Object.fromEntries(shops.map((o: Row) => [o.id, o.unreadMessageCount]))).toEqual({
      [o1.id as string]: 0,
      [o2.id as string]: 1,
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("chat lists", () => {
  it("customer: rooms newest message first with unread counts and a total", async () => {
    const quiet = seedOrder({ created_at: "2026-11-10T00:00:00.000Z" });
    const busy = seedOrder({ created_at: "2026-11-11T00:00:00.000Z", shop_id: SHOP_B });
    const recent = seedOrder({ created_at: "2026-11-09T00:00:00.000Z" });
    seedMessage(busy.id, "shop", "ถามหน่อย", "2026-11-12T03:00:00.000Z");
    seedMessage(busy.id, "shop", "ล่าสุดของ B", "2026-11-12T04:00:00.000Z");
    seedMessage(recent.id, "customer", "ผมถามไว้", "2026-11-12T04:30:00.000Z");
    seedOrder({ customer_id: C2 });
    const json = await (await call(liffChats)).json();
    expect(json.totalUnread).toBe(2);
    expect(json.chats.map((c: Row) => c.orderId)).toEqual([recent.id, busy.id, quiet.id]);
    expect(json.chats[0]).toEqual({
      orderId: recent.id,
      orderNo: recent.order_no,
      shopName: "ร้านตัวอย่าง A",
      status: "paid",
      isClosed: false,
      lastMessage: { sender: "customer", body: "ผมถามไว้", createdAt: "2026-11-12T04:30:00.000Z" },
      unreadMessageCount: 0,
    });
    expect(json.chats[1]).toMatchObject({
      shopName: "ร้านตัวอย่าง B",
      unreadMessageCount: 2,
      lastMessage: { body: "ล่าสุดของ B" },
    });
    expect(json.chats[2]).toMatchObject({
      orderId: quiet.id,
      lastMessage: null,
      unreadMessageCount: 0,
    });
  });

  it("an ended order is listed only if it has messages, and shows as closed", async () => {
    const withMessages = seedOrder({ status: "completed" });
    seedOrder({ status: "cancelled" });
    seedMessage(withMessages.id, "shop", "ขอบคุณ", ago(1000));
    const json = await (await call(liffChats)).json();
    expect(json.chats.map((c: Row) => c.orderId)).toEqual([withMessages.id]);
    expect(json.chats[0]).toMatchObject({
      isClosed: true,
      status: "completed",
      unreadMessageCount: 1,
    });
  });

  it("an overdue order is expired first and so shows as closed", async () => {
    const o = seedOrder({ status: "submitted", response_deadline: ago(1000) });
    seedMessage(o.id, "customer", "สอบถาม", ago(2000));
    const json = await (await call(liffChats)).json();
    expect(json.chats[0]).toMatchObject({ orderId: o.id, status: "expired", isClosed: true });
  });

  it("shop: only its own orders, unread means the customers' messages", async () => {
    const mine = seedOrder();
    const other = seedOrder({ shop_id: SHOP_B });
    seedMessage(mine.id, "customer", "ถามราคา", ago(2000));
    seedMessage(mine.id, "shop", "ตอบแล้ว", ago(1000));
    seedMessage(other.id, "customer", "ของร้านอื่น", ago(500));
    as("shopA");
    const json = await (await call(shopChats)).json();
    expect(json.chats.map((c: Row) => c.orderId)).toEqual([mine.id]);
    expect(json.chats[0]).toMatchObject({ shopName: "ร้านตัวอย่าง A", unreadMessageCount: 1 });
    expect(json.totalUnread).toBe(1);
    expect(JSON.stringify(json)).not.toContain("ของร้านอื่น");
  });

  it("nothing yet: an empty list", async () => {
    expect(await (await call(liffChats)).json()).toEqual({ totalUnread: 0, chats: [] });
  });

  it("the number of queries does not grow with the number of rooms", async () => {
    const countQueries = async (rooms: number) => {
      db.tables.orders = [];
      db.tables.messages = [];
      for (let i = 0; i < rooms; i++) {
        const o = seedOrder();
        seedMessage(o.id, "shop", `m${i}`, ago(1000 + i));
      }
      let queries = 0;
      const realFrom = db.from.bind(db);
      db.from = (table: string) => {
        queries++;
        return realFrom(table);
      };
      const res = await call(liffChats);
      expect((await res.json()).chats).toHaveLength(rooms);
      db.from = realFrom;
      return queries;
    };
    const few = await countQueries(2);
    const many = await countQueries(60);
    expect(many).toBe(few);
  });
});

// ---------------------------------------------------------------------------------------------
describe("push subscriptions", () => {
  const sub = (over: Row = {}) => ({
    endpoint: "https://push.example.com/send/abc123",
    keys: {
      p256dh:
        "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
      auth: "tBHItJI5svbpez7KI4CCXg",
    },
    ...over,
  });
  const subscribe = (body: unknown) => call(pushSubscribe, undefined, { method: "POST", body });
  const unsubscribe = (body: unknown) => call(pushUnsubscribe, undefined, { method: "POST", body });
  const rows = () => db.rows("push_subscriptions");

  it("saves the device for the caller's shop", async () => {
    const res = await subscribe(sub());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(rows()).toEqual([
      expect.objectContaining({
        shop_id: SHOP_A,
        auth_user_id: "auth-user-1",
        endpoint: "https://push.example.com/send/abc123",
        auth: "tBHItJI5svbpez7KI4CCXg",
      }),
    ]);
  });

  it("the same device again updates it instead of adding a second row", async () => {
    await subscribe(sub());
    await subscribe(sub({ keys: { p256dh: "B".repeat(87), auth: "z".repeat(22) } }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ auth: "z".repeat(22), shop_id: SHOP_A });
  });

  it("shop A's device is never linked to shop B: B is refused and A keeps it", async () => {
    await subscribe(sub());
    as("shopB");
    const res = await subscribe(sub({ keys: { p256dh: "C".repeat(87), auth: "y".repeat(22) } }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/[฀-๿]/);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ shop_id: SHOP_A, auth: "tBHItJI5svbpez7KI4CCXg" });
  });

  it("two shops saving the same device at the same moment: one wins, the other is refused", async () => {
    const both = async () => {
      as("shopA");
      const a = subscribe(sub());
      as("shopB");
      const b = subscribe(sub());
      return Promise.all([a, b]);
    };
    const results = await both();
    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    expect(rows()).toHaveLength(1);
  });

  it("a shop waiting for approval may subscribe; a non-shop may not", async () => {
    h.access = { role: "shop", shopId: SHOP_A, shopStatus: "pending" } satisfies Access;
    expect((await subscribe(sub())).status).toBe(200);
    h.access = null;
    expect((await subscribe(sub({ endpoint: "https://push.example.com/other" }))).status).toBe(403);
    expect((await unsubscribe({ endpoint: "https://push.example.com/send/abc123" })).status).toBe(
      403,
    );
    expect(rows()).toHaveLength(1);
  });

  it("unsubscribe removes only the caller's own device and always answers ok", async () => {
    await subscribe(sub());
    as("shopB");
    expect(await (await unsubscribe({ endpoint: sub().endpoint })).json()).toEqual({ ok: true });
    expect(rows()).toHaveLength(1); // B cannot remove A's device
    as("shopA");
    expect(await (await unsubscribe({ endpoint: sub().endpoint })).json()).toEqual({ ok: true });
    expect(rows()).toHaveLength(0);
    expect((await unsubscribe({ endpoint: sub().endpoint })).status).toBe(200); // again: nothing to do
  });

  it("refuses badly shaped input in Thai and saves nothing", async () => {
    const bad = [
      sub({ endpoint: "http://push.example.com/x" }),
      sub({ endpoint: "not a url" }),
      sub({ endpoint: `https://push.example.com/${"a".repeat(2000)}` }),
      sub({ endpoint: 5 }),
      sub({ keys: undefined }),
      sub({ keys: { p256dh: "short", auth: "tBHItJI5svbpez7KI4CCXg" } }),
      sub({ keys: { p256dh: "B".repeat(87), auth: "bad key!" } }),
      sub({ keys: { p256dh: "B".repeat(87) } }),
      {},
    ];
    for (const body of bad) {
      const res = await subscribe(body);
      expect(res.status).toBe(422);
      const error = (await res.json()).error;
      for (const issue of error.details?.issues ?? []) expect(issue.message).toMatch(/[฀-๿]/);
    }
    expect(rows()).toHaveLength(0);
    expect((await unsubscribe({})).status).toBe(422);
    expect((await unsubscribe({ endpoint: "" })).status).toBe(422);
  });

  it("keeps only the start of a very long user agent", async () => {
    const req = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "A".repeat(500) },
      body: JSON.stringify(sub()),
    });
    await pushSubscribe(req, undefined as never);
    expect(rows()[0].user_agent).toBe("A".repeat(300));
  });
});

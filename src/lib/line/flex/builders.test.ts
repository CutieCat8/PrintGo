import { describe, expect, it } from "vitest";
import type { OrderRow } from "@/lib/db/types";
import { NOTIFY_EVENTS, type NotifyEvent } from "../notify";
import { buildNotifyMessages, thaiDateTime, type NotifyData } from "./builders";

const NOW = new Date("2026-11-16T05:00:00Z"); // 12:00 in Bangkok

const order = {
  id: "11111111-1111-4111-8111-111111111111",
  orderNo: "PG-0012",
  fulfillment: "pickup",
  status: "awaiting_payment",
  printSubtotalSatang: 2000,
  platformFeeSatang: 300,
  deliveryFeeSatang: 0,
  totalSatang: 2300,
  rejectReason: null,
  readyNote: null,
  readyInMinutes: 15,
  estimatedReadyAt: null,
  paymentDeadline: "2026-11-16T05:15:00Z",
  pickupCode: "4821",
  deliveryAddress: null,
  deliveryRecipientName: null,
} as unknown as OrderRow;

const data = (over: Partial<NotifyData> = {}, orderOver: Partial<OrderRow> = {}): NotifyData => ({
  order: { ...order, ...orderOver },
  shopName: "ร้านตัวอย่าง",
  shopAddress: "ตัวอย่างสมมติ 1 ถนนสมมติ",
  shopLat: 13.7,
  shopLng: 100.5,
  customerName: "ลูกค้าตัวอย่าง",
  services: [],
  paymentRejectReason: null,
  trackingUrl: null,
  chatPreview: null,
  liff: (p) => `https://liff.line.me/LIFF${p}`,
  now: NOW,
  ...over,
});

const delivery = { fulfillment: "delivery" } as Partial<OrderRow>;
const msgs = (event: NotifyEvent, d = data()) => buildNotifyMessages(event, d);
const json = (event: NotifyEvent, d = data()) => JSON.stringify(msgs(event, d));
const uris = (event: NotifyEvent, d = data()) =>
  [...json(event, d).matchAll(/"uri":"([^"]+)"/g)].map((m) => m[1]);

/** Events that send a form card (everything else is plain text or nothing). */
const CARD_EVENTS: NotifyEvent[] = [
  "quote_ready",
  "payment_verified",
  "payment_rejected",
  "order_rejected",
  "eta_changed",
  "chat_message",
  "handed_over",
];

describe("buildNotifyMessages", () => {
  it.each(CARD_EVENTS)("%s is a flex card with an altText and https buttons", (event) => {
    const [msg, ...rest] = msgs(event);
    expect(rest).toHaveLength(0);
    expect(msg.type).toBe("flex");
    if (msg.type !== "flex") return;
    expect(msg.altText.length).toBeGreaterThan(5);
    expect(msg.altText.length).toBeLessThanOrEqual(400);
    expect(msg.altText).toContain("PG-0012");
    expect(uris(event).length).toBeGreaterThan(0);
    expect(uris(event).every((u) => u.startsWith("https://"))).toBe(true);
  });

  it("order_expired, order_cancelled and ready are plain text with no button", () => {
    for (const event of ["order_expired", "order_cancelled", "ready"] as const) {
      const [msg, ...rest] = msgs(event);
      expect(rest).toHaveLength(0);
      expect(msg.type).toBe("text");
      expect(json(event)).toContain("PG-0012");
    }
  });

  it("printing and courier_requested send nothing", () => {
    expect(msgs("printing")).toEqual([]);
    expect(msgs("courier_requested")).toEqual([]);
  });

  it("every event is covered: card, text or nothing", () => {
    for (const event of NOTIFY_EVENTS) {
      expect(() => msgs(event)).not.toThrow();
    }
  });

  it("is deterministic: same input, same messages", () => {
    expect(json("quote_ready")).toBe(json("quote_ready"));
  });
});

describe("quote_ready", () => {
  it("shows money in baht, never raw satang", () => {
    const text = json("quote_ready");
    expect(text).toContain("฿20.00");
    expect(text).toContain("฿3.00");
    expect(text).toContain("฿23.00");
    expect(text).not.toMatch(/2300|2000(?!:)/);
  });

  it("has the form layout: title, shop, receiver, order type and the not-a-receipt note", () => {
    const text = json("quote_ready");
    expect(text).toContain("รายการสรุปออเดอร์ปริ้น");
    expect(text).toContain("ร้านตัวอย่าง");
    expect(text).toContain("ลูกค้าตัวอย่าง");
    expect(text).toContain("รับเองที่ร้าน");
    expect(text).toContain("QR พร้อมเพย์");
    expect(text).toContain("ไม่ถือเป็นใบเสร็จรับเงิน");
  });

  it("lists services, with 'ราคาตามตกลง' for a service without a price", () => {
    const text = json(
      "quote_ready",
      data({
        services: [
          { name: "เข้าเล่ม", quantity: 2, unitPriceSatang: 1500 },
          { name: "เคลือบ", quantity: 1, unitPriceSatang: null },
        ],
      }),
    );
    expect(text).toContain("เข้าเล่ม ×2 — ฿30.00");
    expect(text).toContain("เคลือบ ×1 — ราคาตามตกลง");
  });

  it("shows the estimated ready time (countdown and fixed) and the pay-by time", () => {
    expect(json("quote_ready")).toContain("15 นาทีหลังชำระเงิน");
    expect(json("quote_ready")).toContain("กรุณาชำระก่อน วันนี้ 12:15 น.");
    const fixed = json(
      "quote_ready",
      data({}, {
        readyInMinutes: null,
        estimatedReadyAt: "2026-11-17T05:00:00Z",
      } as Partial<OrderRow>),
    );
    expect(fixed).toContain("พรุ่งนี้ 12:00 น.");
  });

  it("adds the delivery fee and the delivery address only for delivery orders", () => {
    expect(json("quote_ready")).not.toContain("ค่าจัดส่ง");
    const d = json(
      "quote_ready",
      data({}, {
        fulfillment: "delivery",
        deliveryFeeSatang: 4500,
        totalSatang: 6800,
        deliveryAddress: "เลขที่ 1 ถนนสมมติ",
      } as Partial<OrderRow>),
    );
    expect(d).toContain("ค่าจัดส่ง");
    expect(d).toContain("฿45.00");
    expect(d).toContain("เลขที่ 1 ถนนสมมติ");
  });

  it("the button opens the order page in LIFF", () => {
    expect(uris("quote_ready")).toEqual([`https://liff.line.me/LIFF/orders/${order.id}`]);
  });
});

describe("pickup code privacy", () => {
  it("is not sent in any message (pickup uses the order number)", () => {
    expect(NOTIFY_EVENTS.filter((e) => json(e).includes("4821"))).toEqual([]);
  });

  it("never appears for a delivery order", () => {
    for (const event of NOTIFY_EVENTS) {
      expect(json(event, data({}, delivery))).not.toContain("4821");
    }
  });

  it("never appears in an altText", () => {
    for (const event of NOTIFY_EVENTS) {
      for (const msg of msgs(event)) {
        if (msg.type === "flex") expect(msg.altText).not.toContain("4821");
      }
    }
  });
});

describe("other events", () => {
  it("eta_changed opens the chat and has no cancel button (D19)", () => {
    expect(uris("eta_changed")).toEqual([`https://liff.line.me/LIFF/chats/${order.id}`]);
    expect(json("eta_changed")).not.toContain("ยกเลิก");
  });

  it("chat_message: altText is short and private, the card clips a long message", () => {
    const long = "ก".repeat(200);
    const [msg] = msgs("chat_message", data({ chatPreview: long }));
    if (msg.type !== "flex") throw new Error("expected flex");
    expect(msg.altText).toBe("ร้านมีคำถามเรื่องออเดอร์ PG-0012");
    expect(JSON.stringify(msg.contents)).not.toContain(long);
    expect(JSON.stringify(msg.contents)).toContain("…");
    expect(uris("chat_message")[0]).toBe(`https://liff.line.me/LIFF/chats/${order.id}`);
  });

  it("payment_rejected and order_rejected show the reason", () => {
    expect(json("payment_rejected", data({ paymentRejectReason: "ยอดไม่ตรง" }))).toContain(
      "ยอดไม่ตรง",
    );
    expect(
      json("order_rejected", data({}, { rejectReason: "ไฟล์มีรหัสผ่าน" } as Partial<OrderRow>)),
    ).toContain("ไฟล์มีรหัสผ่าน");
  });

  it("order_expired and order_cancelled use the agreed wording", () => {
    expect(json("order_expired")).toContain("หมดเวลาชำระเงินแล้วนะคะ");
    expect(json("order_cancelled")).toContain("แจ้งสลิปทางแชทนี้");
  });

  it("ready: pickup has the address and a maps link, delivery says the rider is being called", () => {
    const [pickup] = msgs("ready");
    if (pickup.type !== "text") throw new Error("expected text");
    expect(pickup.text).toContain("ตัวอย่างสมมติ 1 ถนนสมมติ");
    expect(pickup.text).toContain("https://www.google.com/maps/search/?api=1&query=13.7,100.5");
    expect(pickup.text).toContain("แจ้งเลขออเดอร์ PG-0012");

    const [home] = msgs("ready", data({}, delivery));
    if (home.type !== "text") throw new Error("expected text");
    expect(home.text).toContain("เรียกไรเดอร์");
    expect(home.text).not.toContain("ถนนสมมติ");
    expect(home.text).not.toContain("google.com");
  });

  it("ready without a shop position leaves the maps line out", () => {
    const [pickup] = msgs("ready", data({ shopLat: null, shopLng: null }));
    if (pickup.type !== "text") throw new Error("expected text");
    expect(pickup.text).not.toContain("Google Maps");
  });

  it("in_transit is a rider card; the button tracks the rider only for an https link", () => {
    expect(json("in_transit")).toContain("ไรเดอร์กำลังนำส่งงานถึงคุณ");
    expect(uris("in_transit")).toEqual([`https://liff.line.me/LIFF/orders/${order.id}`]);
    expect(uris("in_transit", data({ trackingUrl: "https://track.example/x" }))).toEqual([
      "https://track.example/x",
    ]);
    expect(json("in_transit", data({ trackingUrl: "https://track.example/x" }))).toContain(
      "ติดตามไรเดอร์",
    );
    for (const bad of ["javascript:alert(1)", "http://insecure.example"]) {
      expect(uris("in_transit", data({ trackingUrl: bad }))).toEqual([
        `https://liff.line.me/LIFF/orders/${order.id}`,
      ]);
    }
  });

  it("handed_over asks the customer to check and confirm, with the 10 minute note", () => {
    const text = json("handed_over");
    expect(text).toContain("📦 ร้านส่งมอบงานแล้ว");
    expect(text).toContain("ตรวจงานและยืนยัน");
    expect(text).toContain("10 นาที");
    expect(text).not.toContain("📋");
  });

  it("completed: pickup is one thank-you text, delivery is a delivered card then the thank-you", () => {
    const pickup = msgs("completed");
    expect(pickup).toHaveLength(1);
    expect(pickup[0].type).toBe("text");
    const home = msgs("completed", data({}, delivery));
    expect(home.map((m) => m.type)).toEqual(["flex", "text"]);
    expect(JSON.stringify(home)).toContain("จัดส่งงานถึงคุณแล้ว");
    expect(JSON.stringify(home)).toContain("ขอบคุณที่ไว้วางใจให้ PrintGo ดูแลน้า");
  });

  it("payment_verified shows shop, order type, ready time, paid amount and thanks", () => {
    const text = json("payment_verified");
    expect(text).toContain("ชำระเงินแล้ว");
    expect(text).toContain("ร้านตัวอย่าง");
    expect(text).toContain("ยอดที่ชำระ");
    expect(text).toContain("฿23.00");
    expect(text).toContain("ขอบคุณที่ใช้ PrintGo");
  });
});

describe("card design", () => {
  it("has no coloured header bar: the title is green text inside the body", () => {
    const [msg] = msgs("payment_verified");
    if (msg.type !== "flex") throw new Error("flex expected");
    const c = msg.contents as {
      header?: unknown;
      body: { contents: { text?: string; color?: string }[] };
    };
    expect(c.header).toBeUndefined();
    const title = c.body.contents.find((n) => n.text === "ชำระเงินแล้ว");
    expect(title?.color).toBe("#14532D");
  });

  it("actions are plain links, the main one in green", () => {
    const s = json("quote_ready");
    expect(s).toContain('"style":"link"');
    expect(s).not.toContain('"style":"primary"');
    expect(s).toContain('"color":"#14532D"');
  });

  it("shows the logo and the rider picture only when the public URL is https", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    try {
      process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test/";
      expect(json("quote_ready")).toContain('"url":"https://app.example.test/logo-256.png"');
      expect(json("in_transit")).toContain('"url":"https://app.example.test/rider-route.png"');
      process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
      expect(json("quote_ready")).not.toContain('"type":"image"');
      expect(json("in_transit")).not.toContain('"type":"image"');
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = prev;
    }
  });

  it("every card has the order number and the full Thai date and time", () => {
    expect(json("handed_over")).toContain("PG-0012");
    expect(json("handed_over")).toContain("16 พฤศจิกายน 2569 / 12:00 น.");
  });
});

describe("thaiDateTime", () => {
  it("uses Bangkok time and the Buddhist year", () => {
    expect(thaiDateTime(new Date("2026-11-16T21:30:00Z"))).toBe("17 พฤศจิกายน 2569 / 04:30 น.");
    expect(thaiDateTime(new Date("2026-01-01T00:00:00Z"))).toBe("1 มกราคม 2569 / 07:00 น.");
  });
});

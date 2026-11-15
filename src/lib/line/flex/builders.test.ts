import { describe, expect, it } from "vitest";
import type { OrderRow } from "@/lib/db/types";
import { NOTIFY_EVENTS, type NotifyEvent } from "../notify";
import { buildNotifyMessage, type NotifyData } from "./builders";

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
} as unknown as OrderRow;

const data = (over: Partial<NotifyData> = {}, orderOver: Partial<OrderRow> = {}): NotifyData => ({
  order: { ...order, ...orderOver },
  shopName: "ร้านตัวอย่าง",
  shopAddress: "ตัวอย่างสมมติ 1 ถนนสมมติ",
  services: [],
  paymentRejectReason: null,
  trackingUrl: null,
  chatPreview: null,
  liff: (p) => `https://liff.line.me/LIFF${p}`,
  now: NOW,
  ...over,
});

const json = (event: NotifyEvent, d = data()) => JSON.stringify(buildNotifyMessage(event, d));
const uris = (event: NotifyEvent, d = data()) =>
  [...json(event, d).matchAll(/"uri":"([^"]+)"/g)].map((m) => m[1]);

describe("buildNotifyMessage", () => {
  it.each(NOTIFY_EVENTS)("%s makes a flex message with an altText and a button", (event) => {
    const msg = buildNotifyMessage(event, data());
    expect(msg.type).toBe("flex");
    if (msg.type !== "flex") return;
    expect(msg.altText.length).toBeGreaterThan(5);
    expect(msg.altText.length).toBeLessThanOrEqual(400);
    expect(msg.altText).toContain("PG-0012");
    expect(uris(event).length).toBeGreaterThan(0);
    expect(uris(event).every((u) => u.startsWith("https://"))).toBe(true);
  });

  it("is deterministic: same input, same message", () => {
    expect(json("quote_ready")).toBe(json("quote_ready"));
  });
});

describe("quote_ready", () => {
  it("shows money in baht, never raw satang", () => {
    const text = json("quote_ready");
    expect(text).toContain("20.00 บาท");
    expect(text).toContain("3.00 บาท");
    expect(text).toContain("23.00 บาท");
    expect(text).not.toMatch(/2300|2000(?!:)/);
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
    expect(text).toContain("เข้าเล่ม ×2 — 30.00 บาท");
    expect(text).toContain("เคลือบ ×1 — ราคาตามตกลง");
  });

  it("shows the estimated ready time (countdown and fixed) and the pay-by time", () => {
    expect(json("quote_ready")).toContain("เสร็จประมาณ 15 นาทีหลังชำระเงิน");
    expect(json("quote_ready")).toContain("กรุณาชำระก่อน วันนี้ 12:15 น.");
    const fixed = json(
      "quote_ready",
      data({}, {
        readyInMinutes: null,
        estimatedReadyAt: "2026-11-17T05:00:00Z",
      } as Partial<OrderRow>),
    );
    expect(fixed).toContain("เสร็จประมาณ พรุ่งนี้ 12:00 น.");
  });

  it("adds the delivery fee only for delivery orders", () => {
    expect(json("quote_ready")).not.toContain("ค่าส่ง");
    const delivery = json(
      "quote_ready",
      data({}, {
        fulfillment: "delivery",
        deliveryFeeSatang: 4500,
        totalSatang: 6800,
      } as Partial<OrderRow>),
    );
    expect(delivery).toContain("ค่าส่ง");
    expect(delivery).toContain("45.00 บาท");
  });

  it("the button opens the order page in LIFF", () => {
    expect(uris("quote_ready")).toEqual([`https://liff.line.me/LIFF/orders/${order.id}`]);
  });
});

describe("pickup code privacy", () => {
  const withCode = NOTIFY_EVENTS.filter((e) => json(e).includes("4821"));

  it("appears only in payment_verified and ready", () => {
    expect([...withCode].sort()).toEqual(["payment_verified", "ready"]);
  });

  it("never appears for a delivery order", () => {
    const delivery = { fulfillment: "delivery" } as Partial<OrderRow>;
    for (const event of NOTIFY_EVENTS) {
      expect(json(event, data({}, delivery))).not.toContain("4821");
    }
  });

  it("never appears in an altText", () => {
    for (const event of NOTIFY_EVENTS) {
      const msg = buildNotifyMessage(event, data());
      if (msg.type === "flex") expect(msg.altText).not.toContain("4821");
    }
  });
});

describe("other events", () => {
  it("eta_changed opens the chat and has no cancel button (D19)", () => {
    expect(uris("eta_changed")[0]).toContain("/chats/");
    expect(json("eta_changed")).not.toContain("ยกเลิก");
  });

  it("chat_message: altText is short and private, the card clips a long message", () => {
    const long = "ก".repeat(200);
    const msg = buildNotifyMessage("chat_message", data({ chatPreview: long }));
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

  it("ready: pickup shows the shop address, delivery says a rider is being found", () => {
    expect(json("ready")).toContain("ตัวอย่างสมมติ 1 ถนนสมมติ");
    const delivery = json("ready", data({}, { fulfillment: "delivery" } as Partial<OrderRow>));
    expect(delivery).toContain("กำลังหาไรเดอร์");
    expect(delivery).not.toContain("ถนนสมมติ");
  });

  it("in_transit adds a tracking button only for an https link", () => {
    expect(uris("in_transit")).toHaveLength(1);
    expect(uris("in_transit", data({ trackingUrl: "https://track.example/x" }))).toContain(
      "https://track.example/x",
    );
    expect(uris("in_transit", data({ trackingUrl: "javascript:alert(1)" }))).toHaveLength(1);
    expect(uris("in_transit", data({ trackingUrl: "http://insecure.example" }))).toHaveLength(1);
  });
});

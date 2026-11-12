import { describe, expect, it } from "vitest";
import { ENUMS } from "@/lib/db/enums";
import { ORDER_STATUS_INFO, TONE_CLASSES, orderStatusLabel } from "./status";

describe("order status labels", () => {
  it("covers exactly the 11 statuses from CONTRACTS", () => {
    expect(Object.keys(ORDER_STATUS_INFO).sort()).toEqual([...ENUMS.OrderStatus].sort());
    expect(ENUMS.OrderStatus).toHaveLength(11);
  });

  it("uses the Thai labels from the Y1 task", () => {
    expect(orderStatusLabel("submitted")).toBe("รอร้านยืนยัน");
    expect(orderStatusLabel("awaiting_payment")).toBe("รอชำระเงิน");
    expect(orderStatusLabel("paid")).toBe("ชำระแล้ว");
    expect(orderStatusLabel("printing")).toBe("กำลังปริ้น");
    expect(orderStatusLabel("ready")).toBe("พร้อมรับ/พร้อมส่ง");
    expect(orderStatusLabel("courier_requested")).toBe("กำลังหาไรเดอร์");
    expect(orderStatusLabel("in_transit")).toBe("กำลังจัดส่ง");
    expect(orderStatusLabel("completed")).toBe("เสร็จสิ้น");
    expect(orderStatusLabel("rejected")).toBe("ร้านปฏิเสธ");
    expect(orderStatusLabel("cancelled")).toBe("ยกเลิก");
    expect(orderStatusLabel("expired")).toBe("หมดเวลา");
  });

  it("makes `ready` precise when fulfillment is known", () => {
    expect(orderStatusLabel("ready", "pickup")).toBe("พร้อมรับ");
    expect(orderStatusLabel("ready", "delivery")).toBe("พร้อมส่ง");
    expect(orderStatusLabel("printing", "pickup")).toBe("กำลังปริ้น");
  });

  it("has colour classes for every tone in use", () => {
    for (const { tone } of Object.values(ORDER_STATUS_INFO)) {
      expect(TONE_CLASSES[tone]).toBeTruthy();
    }
  });
});

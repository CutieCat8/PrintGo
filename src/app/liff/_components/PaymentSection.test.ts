import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentSection } from "./PaymentSection";

const now = new Date("2026-11-13T03:00:00Z");
const base = {
  orderId: "00000000-0000-4000-8000-000000000001",
  amountSatang: 123,
  onPaid: () => {},
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());
describe("customer payment integration", () => {
  it.each([null, "not-a-date"])(
    "does not offer payment when the authoritative deadline is %s",
    (deadline) => {
      const html = renderToStaticMarkup(createElement(PaymentSection, { ...base, deadline }));
      expect(html).toContain("โหลดออเดอร์ใหม่");
      expect(html).not.toContain('type="file"');
      expect(html).not.toContain("กำลังเตรียม QR");
    },
  );
  it("renders the real upload panel instead of the old placeholder", () => {
    const html = renderToStaticMarkup(
      createElement(PaymentSection, { ...base, deadline: "2026-11-13T03:30:00Z" }),
    );
    expect(html).toContain('type="file"');
    expect(html).toContain("ส่งสลิปเพื่อตรวจสอบ");
    expect(html).not.toContain("หน้าส่งสลิปกำลังจะเปิดใช้งาน");
    expect(html).not.toContain("จำลองชำระเงิน");
  });
  it("does not offer slip selection when the order deadline has passed", () => {
    const html = renderToStaticMarkup(
      createElement(PaymentSection, { ...base, deadline: now.toISOString() }),
    );
    expect(html).toContain("ไม่สามารถรับชำระเพิ่มได้");
    expect(html).not.toContain('type="file"');
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  resource: { data: undefined as unknown, error: null as unknown, mutate: vi.fn() },
}));
vi.mock("swr", () => ({ default: () => h.resource }));
import { Ledger } from "./Ledger";
const id = "00000000-0000-4000-8000-000000000001";
const date = "2026-11-13T00:00:00Z";
beforeEach(() => {
  h.resource.data = undefined;
  h.resource.error = null;
});
it("shows grouped shop totals and offers marking only pending entries", () => {
  h.resource.data = {
    kind: "settlements",
    pendingSatang: 12000,
    paidSatang: 2000,
    shops: [
      {
        shopId: id,
        name: "ร้านสมมติ",
        phone: "0000000000",
        pendingSatang: 12000,
        paidSatang: 2000,
        settlements: [
          {
            id,
            orderId: id,
            shopId: id,
            orderNo: "PG-0001",
            amountSatang: 12000,
            status: "pending",
            paidAt: null,
            createdAt: date,
            proofPath: null,
          },
          {
            id: "00000000-0000-4000-8000-000000000002",
            orderId: id,
            shopId: id,
            orderNo: "PG-0002",
            amountSatang: 2000,
            status: "paid",
            paidAt: date,
            createdAt: date,
            proofPath: "private-proof/example.png",
          },
        ],
      },
    ],
  };
  const html = renderToStaticMarkup(createElement(Ledger, { kind: "settlements" }));
  expect(html).toContain("ร้านสมมติ");
  expect(html).toContain("120.00");
  expect(html).toContain("20.00");
  expect(html.match(/บันทึกโอนให้ร้านแล้ว/g)).toHaveLength(1);
  expect(html).not.toContain("private-proof");
  expect(html).not.toContain("<input");
});
it("shows refund recipient/reason safely and no pending action for paid refunds", () => {
  h.resource.data = {
    kind: "refunds",
    pendingSatang: 0,
    paidSatang: 5000,
    refunds: [
      {
        id,
        orderId: id,
        orderNo: "PG-0003",
        customerName: "ลูกค้าสมมติ",
        amountSatang: 5000,
        reason: "<script>สมมติ</script>",
        status: "paid",
        paidAt: date,
        createdAt: date,
      },
    ],
  };
  const html = renderToStaticMarkup(createElement(Ledger, { kind: "refunds" }));
  expect(html).toContain("ลูกค้าสมมติ");
  expect(html).toContain("50.00");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>สมมติ");
  expect(html).not.toContain("บันทึกโอนคืนแล้ว");
});
it("shows a failure instead of cached financial rows", () => {
  h.resource.data = { kind: "refunds", pendingSatang: 0, paidSatang: 0, refunds: [] };
  h.resource.error = new Error("unavailable");
  const html = renderToStaticMarkup(createElement(Ledger, { kind: "refunds" }));
  expect(html).toContain("ลองใหม่");
  expect(html).not.toContain("ยอดรอโอนในรายการ");
});

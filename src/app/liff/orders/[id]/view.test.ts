import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { OrderDetail } from "@/lib/db/types";
import { ToastProvider } from "@/components/ui";
import { mockApi, mockConfig } from "@/lib/client/mock/server";
import { CustomerOrderPage } from "./view";

const h = vi.hoisted(() => ({ order: undefined as OrderDetail | undefined }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: h.order?.id }),
  usePathname: () => `/liff/orders/${h.order?.id}`,
}));
vi.mock("@/lib/client/hooks", async (original) => ({
  ...(await original<typeof import("@/lib/client/hooks")>()),
  useOrder: () => ({ data: h.order, isLoading: false, error: null, mutate: vi.fn() }),
}));

beforeAll(async () => {
  mockConfig.delay = false;
  mockConfig.params = {};
  const sample = (await mockApi.listMyOrders()).find((o) => o.status === "awaiting_payment")!;
  h.order = await mockApi.getMyOrder(sample.id);
  h.order.paymentDeadline = new Date(Date.now() + 1800000).toISOString();
});
function render(status: "pending_review" | "rejected") {
  h.order = {
    ...h.order!,
    payment: {
      id: "00000000-0000-4000-8000-000000000001",
      amountSatang: h.order!.totalSatang!,
      status,
      createdAt: h.order!.createdAt,
      rejectReason: status === "rejected" ? "ตัวอย่างสมมติ: ยอดไม่ตรง" : null,
    },
  };
  return renderToStaticMarkup(createElement(ToastProvider, null, createElement(CustomerOrderPage)));
}
describe("customer order payment after reload", () => {
  it("keeps the actual panel mounted when polling changes pending_review to rejected", () => {
    const pending = render("pending_review");
    const rejected = render("rejected");
    for (const html of [pending, rejected]) {
      expect(html).toContain("ชำระเงินด้วยพร้อมเพย์");
      expect(html).not.toContain("ตกลง ชำระเงิน");
    }
    expect(pending).not.toContain("ไม่เอา ยกเลิก");
    expect(rejected).toContain("ส่งสลิปเพื่อตรวจสอบ");
  });
});

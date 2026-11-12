import { afterEach, beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  single: vi.fn(),
  finalize: vi.fn(),
  transition: vi.fn(),
  review: vi.fn(),
  signed: vi.fn(),
  rows: [] as unknown[],
}));
vi.mock("@/lib/db/server", () => ({
  getServiceClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: () => Promise.resolve({ data: h.rows, error: null }),
        maybeSingle: h.single,
      };
      return q;
    },
    storage: { from: () => ({ createSignedUrl: h.signed }) },
  }),
}));
vi.mock("@/lib/domain/orders/transition", () => ({
  finalizePayment: h.finalize,
  transition: h.transition,
}));
vi.mock("@/lib/domain/orders/review", () => ({ reviewPayment: h.review }));
import { createAdminOperations } from "./operations";
const id = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";
function payment(status = "pending_review") {
  return {
    id,
    created_at: "2026-11-13T00:00:00Z",
    order_id: orderId,
    amount_satang: 12600,
    status,
    slip_path: `${orderId}/fictional.png`,
    slip_ref: null,
    verified_by: null,
    verified_at: null,
    reject_reason: null,
  };
}
beforeEach(() => {
  h.single.mockResolvedValue({ data: payment(), error: null });
  h.finalize.mockResolvedValue({ status: "paid" });
});
afterEach(() => {
  vi.resetAllMocks();
  h.rows = [];
});
it("approval uses atomic finalizer and allows a verified replay", async () => {
  const service = createAdminOperations();
  await service.approve(id);
  expect(h.finalize).toHaveBeenCalledWith({ orderId, paymentId: id, verifiedBy: "admin" });
  h.single.mockResolvedValueOnce({ data: payment("verified"), error: null });
  await service.approve(id);
  expect(h.finalize).toHaveBeenCalledTimes(2);
});
it.each(["pending", "rejected"])("refuses approval from %s", async (status) => {
  h.single.mockResolvedValueOnce({ data: payment(status), error: null });
  await expect(createAdminOperations().approve(id)).rejects.toMatchObject({ status: 409 });
  expect(h.finalize).not.toHaveBeenCalled();
});
it("delegates refund/reject to one review service and partial cancellation to transition", async () => {
  const service = createAdminOperations();
  await service.refund(id, "สมมติ");
  await service.reject(id, "สมมติ");
  expect(h.review.mock.calls).toEqual([
    [id, "refund", "สมมติ"],
    [id, "reject", "สมมติ"],
  ]);
  await service.cancel(orderId, "สมมติ", 5000);
  expect(h.transition).toHaveBeenCalledWith(
    expect.objectContaining({
      orderId,
      to: "cancelled",
      actor: "admin",
      refundSatang: 5000,
      patch: { rejectReason: "สมมติ" },
    }),
  );
  await service.complete(orderId, "สมมติ");
  expect(h.transition).toHaveBeenLastCalledWith({
    orderId,
    from: "ready",
    to: "completed",
    actor: "admin",
    patch: { rejectReason: "สมมติ" },
  });
});
it("missing payment is 404 and never reaches finalizer", async () => {
  h.single.mockResolvedValueOnce({ data: null, error: null });
  await expect(createAdminOperations().approve(id)).rejects.toMatchObject({ status: 404 });
  expect(h.finalize).not.toHaveBeenCalled();
});

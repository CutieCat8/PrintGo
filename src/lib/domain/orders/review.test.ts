import { beforeEach, afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ rpc: vi.fn(), notify: vi.fn(), expire: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ getServiceClient: () => ({ rpc: h.rpc, from: h.from }) }));
vi.mock("@/lib/line/notify", () => ({ notify: h.notify }));
vi.mock("./expire", () => ({ expireIfDue: h.expire }));
import { reviewPayment } from "./review";
const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  h.rpc.mockResolvedValue({ data: { changed: true, orderId: id }, error: null });
  h.notify.mockResolvedValue(undefined);
});
afterEach(() => vi.resetAllMocks());
it("validates blank/long reasons and IDs before RPC", async () => {
  for (const [pid, reason] of [
    [id, " "],
    [id, "x".repeat(501)],
    ["invalid", "理由"],
  ])
    await expect(reviewPayment(pid, "reject", reason)).rejects.toMatchObject({ status: 422 });
  expect(h.rpc).not.toHaveBeenCalled();
});
it("notifies once only for a changed rejection", async () => {
  await reviewPayment(id, "reject", " ตัวอย่างสมมติ ");
  expect(h.rpc).toHaveBeenCalledWith("review_order_payment", {
    p_payment_id: id,
    p_action: "reject",
    p_reason: "ตัวอย่างสมมติ",
  });
  expect(h.notify).toHaveBeenCalledWith(id, "payment_rejected");
  h.rpc.mockResolvedValueOnce({ data: { changed: false, orderId: id }, error: null });
  await reviewPayment(id, "reject", "ตัวอย่างสมมติ");
  expect(h.notify).toHaveBeenCalledTimes(1);
});
it.each([
  ["PT409", 409],
  ["PT404", 404],
  ["PT422", 422],
  ["XX000", 500],
])("maps %s without leaking RPC details", async (code, status) => {
  h.rpc.mockResolvedValueOnce({ error: { code, message: "private data" } });
  await expect(reviewPayment(id, "reject", "ตัวอย่างสมมติ")).rejects.toMatchObject({ status });
  expect(h.notify).not.toHaveBeenCalled();
});
it("keeps committed rejection when notification fails", async () => {
  h.notify.mockRejectedValueOnce(Error("stub unavailable"));
  await expect(reviewPayment(id, "reject", "ตัวอย่างสมมติ")).resolves.toEqual({ changed: true });
});

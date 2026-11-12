import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ auth: vi.fn(), charge: vi.fn(), sign: vi.fn(), submit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireCustomer: h.auth }));
vi.mock("./service", async (original) => ({
  ...(await original<typeof import("./service")>()),
  getPaymentService: () => h,
}));
import { ApiError } from "@/lib/errors";
import { POST as charge } from "@/app/api/payments/orders/[orderId]/charge/route";
import { POST as sign } from "@/app/api/payments/orders/[orderId]/slip/sign/route";
import { POST as submit } from "@/app/api/payments/orders/[orderId]/slip/route";

const id = "00000000-0000-4000-8000-000000000001";
const ctx = () => ({ params: Promise.resolve({ orderId: id }) });
function req(body?: unknown) {
  return new Request("https://example.invalid/api", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
beforeEach(() => {
  h.auth.mockResolvedValue({ customerId: "customer-from-auth" });
  h.charge.mockResolvedValue({ amountSatang: 12600 });
  h.sign.mockResolvedValue({ path: "signed" });
  h.submit.mockResolvedValue({ status: "pending_review" });
});
afterEach(() => vi.resetAllMocks());
describe("payment route boundaries", () => {
  it.each([charge, sign, submit])(
    "requires authentication before parsing or service calls",
    async (handler) => {
      h.auth.mockRejectedValue(new ApiError("UNAUTHENTICATED", 401));
      const response = await handler(req(), ctx());
      expect(response.status).toBe(401);
      expect(h.charge).not.toHaveBeenCalled();
      expect(h.sign).not.toHaveBeenCalled();
      expect(h.submit).not.toHaveBeenCalled();
    },
  );
  it("ignores spoofed client amount and customer ID for charge", async () => {
    const response = await charge(req({ amountSatang: 1, customerId: "other" }), ctx());
    expect(response.status).toBe(200);
    expect(h.charge).toHaveBeenCalledWith("customer-from-auth", id);
    expect(await response.json()).toEqual({ amountSatang: 12600 });
  });
  it("passes the verified caller and sign MIME only", async () => {
    expect((await sign(req({ mime: "image/png" }), ctx())).status).toBe(200);
    expect(h.sign).toHaveBeenCalledWith("customer-from-auth", id, "image/png");
  });
  it("passes a slip path without accepting client amounts", async () => {
    expect((await submit(req({ slipPath: "own/path" }), ctx())).status).toBe(200);
    expect(h.submit).toHaveBeenCalledWith("customer-from-auth", id, "own/path");
    expect((await submit(req({ slipPath: "own/path", amountSatang: 1 }), ctx())).status).toBe(422);
  });
  it.each(["application/pdf", "image/svg+xml", "text/plain"])(
    "rejects unsupported sign MIME %s",
    async (mime) => {
      expect((await sign(req({ mime }), ctx())).status).toBe(422);
      expect(h.sign).not.toHaveBeenCalled();
    },
  );
  it.each([sign, submit])("rejects malformed JSON", async (handler) => {
    expect(
      (await handler(new Request("https://example.invalid", { method: "POST", body: "{" }), ctx()))
        .status,
    ).toBe(422);
  });
  it.each([charge, sign, submit])("rejects invalid order ID before service", async (handler) => {
    expect(
      (
        await handler(req({ mime: "image/png" }), {
          params: Promise.resolve({ orderId: "invalid" }),
        })
      ).status,
    ).toBe(404);
  });
  it("preserves duplicate slip 409 and never rewrites it as success", async () => {
    h.submit.mockRejectedValue(new ApiError("PAYMENT_DUPLICATE_SLIP", 409));
    const response = await submit(req({ slipPath: "own/path" }), ctx());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("PAYMENT_DUPLICATE_SLIP");
  });
});

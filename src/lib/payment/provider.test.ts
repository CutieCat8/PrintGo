import { afterEach, describe, expect, it, vi } from "vitest";
import { getPaymentProvider } from "./index";

afterEach(() => vi.unstubAllEnvs());

describe("PaymentProvider", () => {
  it("does not require env just to import or construct the provider", () => {
    vi.stubEnv("PLATFORM_PROMPTPAY_ID", "");
    expect(typeof getPaymentProvider().createCharge).toBe("function");
  });

  it("uses the configured fictional account without storing a charge in DB", async () => {
    vi.stubEnv("PLATFORM_PROMPTPAY_ID", "0000000000000");
    const { promptpayPayload, qrDataUrl } = await getPaymentProvider().createCharge({
      orderId: "fictional-order",
      amountSatang: 2200,
    });
    expect(promptpayPayload).toBe(
      "00020101021229370016A000000677010111021300000000000005802TH5303764540522.006304049D",
    );
    expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it.each(["", "not-a-real-promptpay-id"])(
    "fails closed for missing/invalid configuration %j",
    async (id) => {
      vi.stubEnv("PLATFORM_PROMPTPAY_ID", id);
      await expect(
        getPaymentProvider().createCharge({ orderId: "fictional-order", amountSatang: 1 }),
      ).rejects.toMatchObject({ code: "INTERNAL", status: 500 });
      try {
        await getPaymentProvider().createCharge({ orderId: "fictional-order", amountSatang: 1 });
      } catch (error) {
        if (id) expect(String(error)).not.toContain(id);
      }
    },
  );

  it("validates the amount through the provider", async () => {
    vi.stubEnv("PLATFORM_PROMPTPAY_ID", "0000000000");
    await expect(
      getPaymentProvider().createCharge({ orderId: "fictional-order", amountSatang: 0.1 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
  });

  it.each(["", "   "])("rejects empty order ID %j", async (orderId) => {
    vi.stubEnv("PLATFORM_PROMPTPAY_ID", "0000000000");
    await expect(
      getPaymentProvider().createCharge({ orderId, amountSatang: 1 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
  });

  it("never verifies a slip before A2 is implemented, even when a key is present", async () => {
    vi.stubEnv("SLIPOK_API_KEY", "fictional-test-key");
    const result = await getPaymentProvider().verifySlip({
      slipBytes: new Uint8Array([0]),
      expectedAmountSatang: 1,
    });
    expect(result.result).toBe("review");
    expect(result.slipRef).toBeUndefined();
  });
});

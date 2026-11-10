import { afterEach, describe, expect, it, vi } from "vitest";
import { applyDeliveryUpdate, createDeliveryForOrder, quoteDelivery } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("delivery stubs (replaced by Z7)", () => {
  it("quoteDelivery answers with the flat base fee and says it is only an estimate", async () => {
    vi.stubEnv("DELIVERY_BASE_SATANG", "4000");
    await expect(quoteDelivery("shop-1", { lat: 18.79, lng: 98.98 })).resolves.toEqual({
      feeSatang: 4000,
      estimated: true,
    });
  });

  it("createDeliveryForOrder returns a pending_admin delivery without touching anything", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const delivery = await createDeliveryForOrder("order-1");
    expect(delivery).toMatchObject({ provider: "manual", status: "pending_admin" });
  });

  it("applyDeliveryUpdate echoes the status it was given", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const delivery = await applyDeliveryUpdate("order-1", { status: "booked", feeSatang: 6500 });
    expect(delivery).toMatchObject({ status: "booked", feeSatang: 6500 });
  });
});

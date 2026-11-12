import { afterEach, describe, expect, it, vi } from "vitest";
import { manualFeeSatang, manualProvider } from "./manual";

afterEach(() => vi.unstubAllEnvs());

describe("manualFeeSatang", () => {
  it("charges only the base fee at zero distance", () => {
    vi.stubEnv("DELIVERY_BASE_SATANG", "4000");
    vi.stubEnv("DELIVERY_PER_KM_SATANG", "1000");
    expect(manualFeeSatang(0)).toBe(4000);
  });

  it("adds the per-km part and rounds up to a whole satang", () => {
    vi.stubEnv("DELIVERY_BASE_SATANG", "4000");
    vi.stubEnv("DELIVERY_PER_KM_SATANG", "1000");
    expect(manualFeeSatang(3)).toBe(7000);
    expect(manualFeeSatang(2.0004)).toBe(6001);
  });

  it("falls back to the O5 sample numbers when env is unset", () => {
    vi.stubEnv("DELIVERY_BASE_SATANG", "");
    vi.stubEnv("DELIVERY_PER_KM_SATANG", "");
    expect(manualFeeSatang(1)).toBe(5000);
  });

  it("rejects a non-integer fee setting", () => {
    vi.stubEnv("DELIVERY_BASE_SATANG", "40.5");
    expect(() => manualFeeSatang(1)).toThrow(/DELIVERY_BASE_SATANG/);
  });
});

describe("manualProvider", () => {
  it("quotes an estimate with no ETA", async () => {
    vi.stubEnv("DELIVERY_BASE_SATANG", "4000");
    vi.stubEnv("DELIVERY_PER_KM_SATANG", "1000");
    const quote = await manualProvider.getQuote({
      pickup: { lat: 18, lng: 98 },
      dropoff: { lat: 18, lng: 98 },
    });
    expect(quote).toEqual({ feeSatang: 4000, etaMinutes: null, estimated: true });
  });

  it("creates a pending_admin delivery with no provider reference", async () => {
    const place = { lat: 18, lng: 98, address: "x" };
    await expect(
      manualProvider.create({ orderId: "o1", pickup: place, dropoff: place }),
    ).resolves.toEqual({
      providerRef: null,
      status: "pending_admin",
    });
  });
});

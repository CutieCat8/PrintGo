import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/errors";
import {
  calculateTotals,
  customerVisible,
  estimate,
  formatBaht,
  getFeeRate,
  type EstimateInput,
  type FileSetting,
  type ShopServiceInput,
} from "./index";

// All prices below are made-up sample numbers, not real shop prices.
const RULES = [
  { color: "bw", paper: "A4", sides: "single", pricePerPageSatang: 100 },
  { color: "bw", paper: "A4", sides: "double", pricePerPageSatang: 80 },
  { color: "color", paper: "A4", sides: "single", pricePerPageSatang: 500 },
] as EstimateInput["rules"];

const file = (over: Partial<FileSetting> = {}): FileSetting => ({
  pageCount: 10,
  color: "bw",
  paper: "A4",
  sides: "single",
  copies: 1,
  ...over,
});

const svc = (over: Partial<ShopServiceInput> = {}): ShopServiceInput => ({
  id: "svc-binding",
  name: "เข้าเล่ม",
  priceSatang: 3500,
  unit: "per_set",
  isActive: true,
  ...over,
});

function run(over: Partial<EstimateInput> = {}) {
  return estimate({
    files: [file()],
    rules: RULES,
    tiers: [],
    shopServices: [],
    selectedServices: [],
    fulfillment: "pickup",
    deliveryFeeSatang: 0,
    ...over,
  });
}

function expectValidationError(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).code).toBe("VALIDATION_ERROR");
    expect((e as ApiError).status).toBe(422);
    return e as ApiError;
  }
  throw new Error("expected ApiError(VALIDATION_ERROR)");
}

describe("calculateTotals", () => {
  const fee = (printSubtotalSatang: number, feeRate = 0.05, deliveryFeeSatang = 0) =>
    calculateTotals({ printSubtotalSatang, deliveryFeeSatang, feeRate });

  it("matches the CONTRACTS examples (22 -> 3, 120 -> 6, 600 -> 30 baht)", () => {
    expect(fee(2200).platformFeeSatang).toBe(300);
    expect(fee(12000).platformFeeSatang).toBe(600);
    expect(fee(60000).platformFeeSatang).toBe(3000);
  });

  it("applies the 300 minimum and ceil around the boundary", () => {
    expect(fee(5980).platformFeeSatang).toBe(300); // 5% = 299 -> minimum 300
    expect(fee(5981).platformFeeSatang).toBe(300); // 299.05 -> ceil 300
    expect(fee(6000).platformFeeSatang).toBe(300); // exactly 300
    expect(fee(6001).platformFeeSatang).toBe(301); // 300.05 -> ceil 301
  });

  it("handles 1 satang and 0 satang", () => {
    expect(fee(1).platformFeeSatang).toBe(300);
    expect(fee(0).platformFeeSatang).toBe(300);
  });

  it("is exact where floating point would drift (0.07 x 10000)", () => {
    expect(Math.ceil(0.07 * 10000)).toBe(701); // naive float maths is off by one satang
    expect(fee(10000, 0.07).platformFeeSatang).toBe(700);
    expect(fee(12000).platformFeeSatang).toBe(600);
  });

  it("adds the delivery fee to the total but not to the fee base", () => {
    expect(fee(12000, 0.05, 4000)).toEqual({ platformFeeSatang: 600, totalSatang: 16600 });
  });

  it("works with print + services: 120 + 2 sets x 35 = 190 baht", () => {
    expect(fee(19000)).toEqual({ platformFeeSatang: 950, totalSatang: 19950 });
  });

  it("rejects bad input", () => {
    expect(() => fee(-1)).toThrow();
    expect(() => fee(1.5)).toThrow();
    expect(() => fee(1000, 1.5)).toThrow();
    expect(() => fee(1000, -0.1)).toThrow();
    expect(() => fee(1000, 0.05, -1)).toThrow();
  });

  it("always returns integers", () => {
    for (const p of [1, 7, 333, 5981, 6001, 99999, 123457]) {
      const r = fee(p, 0.07, 1234);
      expect(Number.isInteger(r.platformFeeSatang)).toBe(true);
      expect(Number.isInteger(r.totalSatang)).toBe(true);
    }
  });
});

describe("getFeeRate", () => {
  it("defaults to 0.05", () => {
    expect(getFeeRate({})).toBe(0.05);
    expect(getFeeRate({ PLATFORM_FEE_RATE: "" })).toBe(0.05);
  });
  it("reads the env value within 0-1", () => {
    expect(getFeeRate({ PLATFORM_FEE_RATE: "0.1" })).toBe(0.1);
    expect(getFeeRate({ PLATFORM_FEE_RATE: "0" })).toBe(0);
    expect(getFeeRate({ PLATFORM_FEE_RATE: "1" })).toBe(1);
  });
  it("throws outside 0-1 or non-numeric", () => {
    expect(() => getFeeRate({ PLATFORM_FEE_RATE: "5" })).toThrow();
    expect(() => getFeeRate({ PLATFORM_FEE_RATE: "-0.1" })).toThrow();
    expect(() => getFeeRate({ PLATFORM_FEE_RATE: "abc" })).toThrow();
  });
});

describe("formatBaht", () => {
  it("formats satang as baht", () => {
    expect(formatBaht(0)).toBe("0.00");
    expect(formatBaht(5)).toBe("0.05");
    expect(formatBaht(2200)).toBe("22.00");
    expect(formatBaht(125050)).toBe("1,250.50");
    expect(formatBaht(100000000)).toBe("1,000,000.00");
  });
  it("throws on negative or non-integer", () => {
    expect(() => formatBaht(-1)).toThrow();
    expect(() => formatBaht(1.5)).toThrow();
    expect(() => formatBaht(Number.NaN)).toThrow();
  });
});

describe("estimate: print cost", () => {
  it("prices one file as pages x copies x price per page", () => {
    const e = run({ files: [file({ pageCount: 10, copies: 3 })] });
    expect(e.totalPages).toBe(30);
    expect(e.perFile).toEqual([{ pages: 30, filePrice: 3000 }]);
    expect(e.estimatedPrintSatang).toBe(3000);
    expect(e.requiresManualPrice).toBe(false);
  });

  it("handles 1 page and 1 satang results", () => {
    const rules = [{ ...RULES[0], pricePerPageSatang: 1 }];
    const e = run({ files: [file({ pageCount: 1 })], rules });
    expect(e.estimatedPrintSatang).toBe(1);
  });

  it("prices several files with different modes", () => {
    const e = run({
      files: [
        file({ pageCount: 10 }), // 10 x 100 = 1000
        file({ pageCount: 5, sides: "double", copies: 2 }), // 10 x 80 = 800
        file({ pageCount: 2, color: "color" }), // 2 x 500 = 1000
      ],
    });
    expect(e.perFile.map((f) => f.filePrice)).toEqual([1000, 800, 1000]);
    expect(e.totalPages).toBe(22);
    expect(e.estimatedPrintSatang).toBe(2800);
  });

  it("rejects a combination the shop does not offer and names the file", () => {
    const err = expectValidationError(() => run({ files: [file(), file({ paper: "A3" })] }));
    expect(err.message).toBe("ร้านนี้ไม่รับงานชุดค่านี้");
    expect(err.details).toMatchObject({ fileIndex: 1, paper: "A3" });
  });

  it("rejects 0 pages, 0 copies, fractional pages and no files", () => {
    expectValidationError(() => run({ files: [file({ pageCount: 0 })] }));
    expectValidationError(() => run({ files: [file({ copies: 0 })] }));
    expectValidationError(() => run({ files: [file({ pageCount: 1.5 })] }));
    expectValidationError(() => run({ files: [] }));
  });

  it("only charges delivery for delivery orders", () => {
    expect(run({ fulfillment: "pickup", deliveryFeeSatang: 4000 }).deliveryFeeSatang).toBe(0);
    expect(run({ fulfillment: "delivery", deliveryFeeSatang: 4000 }).deliveryFeeSatang).toBe(4000);
  });
});

describe("estimate: volume discount tiers", () => {
  it("is manual exactly at minPages, not below", () => {
    const tiers = [{ minPages: 100 }];
    expect(run({ files: [file({ pageCount: 99 })], tiers }).requiresManualPrice).toBe(false);
    expect(run({ files: [file({ pageCount: 100 })], tiers }).requiresManualPrice).toBe(true);
  });

  it("counts pages across the whole order, including copies", () => {
    const tiers = [{ minPages: 100 }];
    const e = run({
      files: [file({ pageCount: 30 }), file({ pageCount: 30, copies: 2 })], // 30 + 60 = 90
      tiers,
    });
    expect(e.requiresManualPrice).toBe(false);
    const e2 = run({ files: [file({ pageCount: 40 }), file({ pageCount: 30, copies: 2 })], tiers }); // 100
    expect(e2.requiresManualPrice).toBe(true);
  });

  it("still computes the internal estimate when manual", () => {
    const e = run({ files: [file({ pageCount: 100 })], tiers: [{ minPages: 100 }] });
    expect(e.estimatedPrintSatang).toBe(10000);
  });
});

describe("estimate: extra services (D22)", () => {
  it("per_set: price x copies; print 12000 + 2 sets x 3500 = 19000 -> fee 950, total 19950", () => {
    const e = run({
      files: [file({ pageCount: 60, copies: 2 })], // 120 pages x 100 = 12000
      shopServices: [svc()],
      selectedServices: [{ serviceId: "svc-binding" }],
    });
    expect(e.estimatedPrintSatang).toBe(12000);
    expect(e.estimatedServicesSatang).toBe(7000);
    expect(e.serviceLines).toHaveLength(1);
    expect(e.serviceLines[0]).toMatchObject({ quantity: 2, lineTotalSatang: 7000, fileIndex: 0 });
    const totals = calculateTotals({
      printSubtotalSatang: e.estimatedPrintSatang + e.estimatedServicesSatang,
      deliveryFeeSatang: e.deliveryFeeSatang,
      feeRate: 0.05,
    });
    expect(totals).toEqual({ platformFeeSatang: 950, totalSatang: 19950 });
  });

  it("per_order is charged once even with several files", () => {
    const e = run({
      files: [file(), file({ copies: 3 })],
      shopServices: [svc({ id: "svc-cover", unit: "per_order", priceSatang: 2000 })],
      selectedServices: [{ serviceId: "svc-cover" }],
    });
    expect(e.serviceLines).toHaveLength(1);
    expect(e.serviceLines[0]).toMatchObject({
      fileIndex: null,
      quantity: 1,
      lineTotalSatang: 2000,
    });
    expect(e.estimatedServicesSatang).toBe(2000);
  });

  it("applies to every file by default and only to selected files with fileIndexes", () => {
    const base = {
      files: [file({ copies: 1 }), file({ copies: 2 }), file({ copies: 4 })],
      shopServices: [svc({ priceSatang: 1000 })],
    };
    const all = run({ ...base, selectedServices: [{ serviceId: "svc-binding" }] });
    expect(all.estimatedServicesSatang).toBe(1000 * (1 + 2 + 4));
    const some = run({
      ...base,
      selectedServices: [{ serviceId: "svc-binding", fileIndexes: [2, 0] }],
    });
    expect(some.serviceLines.map((l) => l.fileIndex)).toEqual([0, 2]);
    expect(some.estimatedServicesSatang).toBe(1000 * (1 + 4));
  });

  it("a negotiable (null price) service makes the order manual and is not summed", () => {
    const e = run({
      shopServices: [svc({ priceSatang: null }), svc({ id: "other", priceSatang: 500 })],
      selectedServices: [{ serviceId: "svc-binding" }, { serviceId: "other" }],
    });
    expect(e.requiresManualPrice).toBe(true);
    expect(e.estimatedServicesSatang).toBe(500);
    expect(e.serviceLines[0]).toMatchObject({ unitPriceSatang: null, lineTotalSatang: null });
  });

  it("rejects duplicate, unknown, inactive and out-of-range selections", () => {
    const base = { shopServices: [svc()] };
    expectValidationError(() =>
      run({
        ...base,
        selectedServices: [{ serviceId: "svc-binding" }, { serviceId: "svc-binding" }],
      }),
    );
    expectValidationError(() => run({ ...base, selectedServices: [{ serviceId: "nope" }] }));
    expectValidationError(() =>
      run({
        shopServices: [svc({ isActive: false })],
        selectedServices: [{ serviceId: "svc-binding" }],
      }),
    );
    expectValidationError(() =>
      run({ ...base, selectedServices: [{ serviceId: "svc-binding", fileIndexes: [1] }] }),
    );
    expectValidationError(() =>
      run({ ...base, selectedServices: [{ serviceId: "svc-binding", fileIndexes: [-1] }] }),
    );
    expectValidationError(() =>
      run({ ...base, selectedServices: [{ serviceId: "svc-binding", fileIndexes: [0, 0] }] }),
    );
    expectValidationError(() =>
      run({ ...base, selectedServices: [{ serviceId: "svc-binding", fileIndexes: [] }] }),
    );
  });

  it("with no services the result equals the print-only result", () => {
    const e = run({ files: [file({ pageCount: 7, copies: 2 })] });
    expect(e.estimatedServicesSatang).toBe(0);
    expect(e.serviceLines).toEqual([]);
    expect(e.estimatedPrintSatang).toBe(1400);
  });

  it("every money value is an integer", () => {
    const e = run({
      files: [file({ pageCount: 13, copies: 3 })],
      shopServices: [svc({ priceSatang: 1234 })],
      selectedServices: [{ serviceId: "svc-binding" }],
    });
    for (const n of [
      e.estimatedPrintSatang,
      e.estimatedServicesSatang,
      ...e.perFile.map((f) => f.filePrice),
      ...e.serviceLines.map((l) => l.lineTotalSatang as number),
    ]) {
      expect(Number.isInteger(n)).toBe(true);
    }
  });
});

describe("customerVisible", () => {
  it("passes amounts through when the price is not manual", () => {
    const e = run({ files: [file({ pageCount: 10 })] });
    const v = customerVisible(e);
    expect(v.estimatedPrintSatang).toBe(1000);
    expect(v.perFile[0].filePrice).toBe(1000);
  });

  it("hides every amount when manual (tier)", () => {
    const e = run({ files: [file({ pageCount: 100 })], tiers: [{ minPages: 100 }] });
    const v = customerVisible(e);
    expect(v.requiresManualPrice).toBe(true);
    expect(v.estimatedPrintSatang).toBeNull();
    expect(v.estimatedServicesSatang).toBeNull();
    expect(v.perFile.every((f) => f.filePrice === null)).toBe(true);
    expect(v.totalPages).toBe(100);
  });

  it("hides service prices when manual (negotiable service)", () => {
    const e = run({
      shopServices: [svc({ priceSatang: null }), svc({ id: "other", priceSatang: 500 })],
      selectedServices: [{ serviceId: "svc-binding" }, { serviceId: "other" }],
    });
    const v = customerVisible(e);
    expect(
      v.serviceLines.every((l) => l.unitPriceSatang === null && l.lineTotalSatang === null),
    ).toBe(true);
    expect(v.estimatedPrintSatang).toBeNull();
    expect(v.estimatedServicesSatang).toBeNull();
    expect(v.perFile.every((f) => f.filePrice === null)).toBe(true);
  });

  it("returns a copy, so editing the result does not change the estimate", () => {
    const e = run({ files: [file()] });
    const v = customerVisible(e);
    v.perFile[0].filePrice = 1;
    expect(e.perFile[0].filePrice).toBe(1000);
  });
});

describe("extra cases from review", () => {
  it("shop has services but customer selects none: same as print-only", () => {
    const e = run({ shopServices: [svc(), svc({ id: "x", priceSatang: null })] });
    expect(e.requiresManualPrice).toBe(false);
    expect(e.estimatedServicesSatang).toBe(0);
    expect(e.serviceLines).toEqual([]);
  });

  it("rejects an out-of-range fileIndexes even for a per_order service", () => {
    expectValidationError(() =>
      run({
        shopServices: [svc({ unit: "per_order" })],
        selectedServices: [{ serviceId: "svc-binding", fileIndexes: [5] }],
      }),
    );
  });

  it("rejects a fee rate finer than 4 decimal places instead of rounding it", () => {
    expect(() => getFeeRate({ PLATFORM_FEE_RATE: "0.00005" })).toThrow();
    expect(() =>
      calculateTotals({ printSubtotalSatang: 1000, deliveryFeeSatang: 0, feeRate: 0.00005 }),
    ).toThrow();
    expect(getFeeRate({ PLATFORM_FEE_RATE: "0.0725" })).toBe(0.0725);
  });
});

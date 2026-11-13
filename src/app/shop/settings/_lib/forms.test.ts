import { beforeEach, describe, expect, it } from "vitest";
import {
  HoursBody,
  PricingBody,
  ProfileBody,
  ServiceCreateBody,
} from "@/lib/domain/shops/settingsSchemas";
import { ApiClientError } from "@/lib/client/http";
import { mockApi, mockConfig, resetMock } from "@/lib/client/mock/server";
import {
  copyHours,
  errorsFrom,
  FormProblem,
  hoursBody,
  hoursDraft,
  pricingBody,
  pricingDraft,
  pricingErrorPath,
  profileBody,
  profileDraft,
  profileWithPause,
  serviceBody,
  serviceDraft,
} from "./forms";

const empty = () => pricingDraft({ rules: [], tiers: [] });
describe("settings input boundaries", () => {
  it.each(["0", "-1", "1.001", "1e2", "1,2", "NaN", "100.01", "0x10"])(
    "rejects invalid page price %s",
    (price) => {
      const draft = empty();
      draft.prices["bw-A4-single"] = price;
      expect(() => pricingBody(draft)).toThrow(FormProblem);
    },
  );
  it.each([
    ["0.01", 1],
    ["1.23", 123],
    ["100", 10000],
  ])("converts %s exactly to integer satang", (price, satang) => {
    const draft = empty();
    draft.prices["bw-A4-single"] = price;
    const body = pricingBody(draft);
    expect(body.rules).toEqual([
      { color: "bw", paper: "A4", sides: "single", pricePerPageSatang: satang },
    ]);
    expect(PricingBody.parse(body)).toEqual(body);
  });
  it("omits unsupported combinations and rejects duplicate/noninteger discount thresholds", () => {
    expect(pricingBody(empty())).toEqual({ rules: [], tiers: [] });
    for (const minPages of ["1.5", "0", "1000001"])
      expect(() => pricingBody({ ...empty(), tiers: [{ minPages, note: "" }] })).toThrow(
        FormProblem,
      );
    expect(() =>
      pricingBody({
        ...empty(),
        tiers: [
          { minPages: "10", note: "" },
          { minPages: "10", note: "" },
        ],
      }),
    ).toThrow(FormProblem);
  });
  it("accepts midnight close, copies without changing weekdays and rejects overnight hours", () => {
    const rows = hoursDraft([]);
    rows[1] = { weekday: 1, openTime: "09:00", closeTime: "24:00", isClosed: false };
    const copied = copyHours(rows, 1);
    expect(copied.map((row) => row.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(HoursBody.parse(hoursBody(copied))).toEqual(copied);
    expect(rows[0].isClosed).toBe(true);
    rows[1].closeTime = "08:00";
    expect(() => hoursBody(rows)).toThrow(FormProblem);
    expect(HoursBody.safeParse(hoursBody(hoursDraft([]))).success).toBe(true);
  });
  it("negotiated services carry null and never a leftover numeric price", () => {
    const draft = { ...serviceDraft(), name: "ตัวอย่างสมมติ", negotiated: true, priceBaht: "999" };
    expect(ServiceCreateBody.parse(serviceBody(draft)).priceSatang).toBeNull();
    expect(serviceBody({ ...draft, negotiated: false, priceBaht: "10,000.00" }).priceSatang).toBe(
      1000000,
    );
    expect(() => serviceBody({ ...draft, negotiated: false, priceBaht: "10000.01" })).toThrow(
      FormProblem,
    );
  });
  it("maps compressed API rule indices back to the visible price field", () => {
    const draft = empty();
    draft.prices["color-A3-double"] = "5";
    const body = pricingBody(draft);
    const error = new ApiClientError("VALIDATION_ERROR", 422, "ข้อมูลผิด", {
      issues: [{ path: "rules.0.pricePerPageSatang", message: "ราคาไม่ถูกต้อง" }],
    });
    expect(errorsFrom(error, (path) => pricingErrorPath(body, path))).toEqual({
      "prices.color-A3-double": "ราคาไม่ถูกต้อง",
    });
  });
});

// Uses Yuri's in-memory API, not Supabase or production data. Exercises the same
// outgoing form bodies against the customer-facing shop list and estimate.
describe("mock shop settings to customer flow", () => {
  beforeEach(() => {
    resetMock();
    mockConfig.delay = false;
    mockConfig.params = {};
  });
  it("validates profile, rejects blank coordinates and cutoff overflow", async () => {
    const draft = profileDraft(await mockApi.getShopProfile());
    expect(ProfileBody.safeParse(profileBody(draft)).success).toBe(true);
    expect(() => profileBody({ ...draft, lat: "" })).toThrow(FormProblem);
    expect(() => profileBody({ ...draft, cutoffMinutes: "241" })).toThrow(FormProblem);
  });
  it("preserves the header pause change while saving other profile edits", async () => {
    const draft = { ...profileDraft(await mockApi.getShopProfile()), name: "ตัวอย่างชื่อใหม่" };
    const body = profileBody(profileWithPause(draft, true, null));
    expect(body.isPaused).toBe(true);
    expect(body.name).toBe("ตัวอย่างชื่อใหม่");
    expect(profileWithPause(draft, true, false).isPaused).toBe(false);
    expect(profileWithPause(draft, false, null).isPaused).toBe(false);
  });
  it("updates customer prices, service edits/visibility/deletion, and manual-price estimates", async () => {
    const shop = await mockApi.getShopProfile();
    const draft = empty();
    draft.prices["bw-A4-single"] = "1.23";
    await mockApi.updateShopPricing(pricingBody(draft));
    const request = {
      shopId: shop.id,
      fulfillment: "pickup" as const,
      files: [
        {
          pageCount: 10,
          copies: 1,
          color: "bw" as const,
          paper: "A4" as const,
          sides: "single" as const,
        },
      ],
    };
    expect((await mockApi.listShops()).find((s) => s.id === shop.id)?.startingPriceSatang).toBe(
      123,
    );
    expect((await mockApi.estimate(request)).estimatedPrintSatang).toBe(1230);
    const created = await mockApi.createShopService(
      serviceBody({ ...serviceDraft(), name: "ตัวอย่างสมมติ", priceBaht: "35" }),
    );
    const selected = { ...request, services: [{ serviceId: created.id }] };
    expect((await mockApi.estimate(selected)).servicesSatang).toBe(3500);
    await mockApi.updateShopService(created.id, {
      name: "ตัวอย่างแก้ไข",
      priceSatang: null,
      unit: created.unit,
      sortOrder: created.sortOrder,
      isActive: true,
    });
    const manual = await mockApi.estimate(selected);
    expect(manual.requiresManualPrice).toBe(true);
    expect(manual.totalSatang).toBeNull();
    expect(manual.serviceLines[0].unitPriceSatang).toBeNull();
    expect(
      (await mockApi.listShops())
        .find((s) => s.id === shop.id)
        ?.services.find((s) => s.id === created.id),
    ).toMatchObject({ name: "ตัวอย่างแก้ไข", priceSatang: null });
    await mockApi.updateShopService(created.id, {
      name: created.name,
      priceSatang: 3500,
      unit: created.unit,
      sortOrder: 0,
      isActive: false,
    });
    expect(
      (await mockApi.listShops())
        .find((s) => s.id === shop.id)
        ?.services.some((s) => s.id === created.id),
    ).toBe(false);
    await mockApi.deleteShopService(created.id);
    expect((await mockApi.listShopServices()).some((s) => s.id === created.id)).toBe(false);
    await mockApi.updateShopPricing({
      ...pricingBody(draft),
      tiers: [{ minPages: 10, note: null }],
    });
    expect((await mockApi.estimate(request)).totalSatang).toBeNull();
  });
});

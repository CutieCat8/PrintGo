import { describe, expect, it } from "vitest";
import { calculateOverview, thaiDayRange } from "./deliveries";
import { mapUrl } from "./delivery-types";
import { ManualDeliveryUpdate } from "@/lib/delivery/manual-update";
const now = new Date("2026-11-13T17:05:00Z"); // 14 Nov Bangkok
describe("A7 money and overview", () => {
  it("uses Bangkok midnight with an exclusive next-day bound", () => {
    expect(thaiDayRange(now)).toEqual({
      start: "2026-11-13T17:00:00.000Z",
      end: "2026-11-14T17:00:00.000Z",
    });
  });
  it("counts the created-today cohort but revenue by completion day, excludes cancelled and open fees", () => {
    const row = (
      status: string,
      created_at: string,
      completed_at: string | null,
      platform_fee_satang: number | null,
    ) => ({ status, created_at, completed_at, platform_fee_satang });
    expect(
      calculateOverview(
        [
          row("completed", "2026-11-13T17:00:00.000Z", "2026-11-13T18:00:00.000Z", 300),
          row("completed", "2026-11-12T00:00:00.000Z", "2026-11-13T17:00:00.000Z", 500),
          row("completed", "2026-11-12T00:00:00.000Z", "2026-11-13T16:59:59.000Z", 400),
          row("cancelled", "2026-11-13T18:00:00.000Z", null, 99999),
          row("paid", "2026-11-13T18:00:00.000Z", null, 99999),
        ],
        now,
      ),
    ).toEqual({
      ordersToday: 3,
      completedToday: 1,
      platformFeeTodaySatang: 800,
      platformFeeTotalSatang: 1200,
    });
  });
  it("does not silently report invalid or overflowing revenue", () => {
    expect(() =>
      calculateOverview(
        [
          {
            status: "completed",
            created_at: now.toISOString(),
            completed_at: now.toISOString(),
            platform_fee_satang: null,
          },
        ],
        now,
      ),
    ).toThrow();
  });
  it.each([-1, 1.1, 2147483648, NaN])("rejects invalid actual fee %s", (feeSatang) => {
    expect(ManualDeliveryUpdate.safeParse({ status: "booked", feeSatang }).success).toBe(false);
  });
  it.each([
    "not-a-url",
    "",
    "https://%",
    "javascript:alert(1)",
    "http://example.invalid",
    "https://user:secret@example.invalid",
  ])("rejects unsafe URL %s", (trackingUrl) => {
    expect(ManualDeliveryUpdate.safeParse({ status: "booked", trackingUrl }).success).toBe(false);
  });
  it("rejects client order totals and accepts zero actual fee", () => {
    expect(ManualDeliveryUpdate.safeParse({ status: "booked", totalSatang: 1 }).success).toBe(
      false,
    );
    expect(ManualDeliveryUpdate.parse({ status: "booked", feeSatang: 0 }).feeSatang).toBe(0);
  });
  it("encodes the coordinates without recipient names in Maps URL", () => {
    const u = new URL(mapUrl(18.8, 99)!);
    expect(u.searchParams.get("api")).toBe("1");
    expect(u.searchParams.get("query")).toBe("18.8,99");
    expect(mapUrl(null, 99)).toBeNull();
    expect(mapUrl(91, 99)).toBeNull();
  });
});

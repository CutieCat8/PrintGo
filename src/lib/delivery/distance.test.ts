import { describe, expect, it } from "vitest";
import { distanceKm } from "./distance";

describe("distanceKm", () => {
  it("is 0 for the same point", () => {
    expect(distanceKm({ lat: 18.79, lng: 98.98 }, { lat: 18.79, lng: 98.98 })).toBe(0);
  });

  it("is about 111 km per degree of latitude", () => {
    const km = distanceKm({ lat: 18, lng: 98 }, { lat: 19, lng: 98 });
    expect(km).toBeGreaterThan(110.5);
    expect(km).toBeLessThan(111.9);
  });

  it("is symmetric", () => {
    const a = { lat: 18.79, lng: 98.98 };
    const b = { lat: 18.8, lng: 99.0 };
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 10);
  });
});

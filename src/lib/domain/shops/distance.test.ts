import { describe, expect, it } from "vitest";
import { haversineKm } from "./distance";

describe("haversineKm", () => {
  it("is 0 for the same point", () => {
    expect(haversineKm({ lat: 18.7953, lng: 98.9534 }, { lat: 18.7953, lng: 98.9534 })).toBe(0);
  });

  it("one degree of latitude is about 111.19 km", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
  });

  it("one degree of longitude on the equator is about 111.19 km", () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.19, 1);
  });

  it("Bangkok to Chiang Mai is about 583 km in a straight line", () => {
    const km = haversineKm({ lat: 13.7563, lng: 100.5018 }, { lat: 18.7883, lng: 98.9853 });
    expect(km).toBeGreaterThan(578);
    expect(km).toBeLessThan(588);
  });

  it("is symmetric", () => {
    const a = { lat: 18.7953, lng: 98.9534 };
    const b = { lat: 18.7885, lng: 98.9918 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });

  it("half the earth apart is about 20015 km and does not return NaN", () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(km).toBeCloseTo(20015.09, 0);
  });

  it("is not rounded", () => {
    const km = haversineKm({ lat: 18.7953, lng: 98.9534 }, { lat: 18.8003, lng: 98.9505 });
    expect(km).not.toBe(Math.round(km * 10) / 10);
  });

  it("rejects non-finite coordinates", () => {
    expect(() => haversineKm({ lat: Number.NaN, lng: 0 }, { lat: 0, lng: 0 })).toThrow();
  });
});

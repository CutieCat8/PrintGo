import { describe, expect, it } from "vitest";
import { STAGE_SECONDS, riderStage, sampleArrivalWindow } from "./riderTracker";

const S = STAGE_SECONDS * 1000;

describe("riderStage", () => {
  it("starts at searching and moves one stage every 6 seconds", () => {
    expect(riderStage("courier_requested", 0)).toBe(0);
    expect(riderStage("courier_requested", S - 1)).toBe(0);
    expect(riderStage("courier_requested", S)).toBe(1);
    expect(riderStage("courier_requested", 2 * S)).toBe(2);
    expect(riderStage("courier_requested", 3 * S)).toBe(3);
  });

  it("stops at arrived and never goes past it or below zero", () => {
    expect(riderStage("courier_requested", 100 * S)).toBe(3);
    expect(riderStage("courier_requested", -5000)).toBe(0);
  });

  it("a real in_transit order is never shown before delivering", () => {
    expect(riderStage("in_transit", 0)).toBe(2);
    expect(riderStage("in_transit", 3 * S)).toBe(3);
  });

  it("a completed order is always arrived", () => {
    expect(riderStage("completed", 0)).toBe(3);
  });
});

describe("sampleArrivalWindow", () => {
  it("is a 10 minute window starting 15 minutes after the start", () => {
    const { from, to } = sampleArrivalWindow(Date.UTC(2026, 10, 18, 0, 0));
    expect(from.toISOString()).toBe("2026-11-18T00:15:00.000Z");
    expect(to.getTime() - from.getTime()).toBe(10 * 60_000);
  });
});

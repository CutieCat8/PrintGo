import { describe, expect, it } from "vitest";
import { hourOptions, joinTime, minuteOptions, splitTime } from "./timeParts";

describe("splitTime", () => {
  it("reads HH:mm and ignores anything else", () => {
    expect(splitTime("09:30")).toEqual({ hour: "09", minute: "30" });
    expect(splitTime("24:00")).toEqual({ hour: "24", minute: "00" });
    for (const bad of ["", undefined, "9:30", "09:3", "09-30", "09:30:00", "abc"]) {
      expect(splitTime(bad)).toEqual({ hour: "", minute: "" });
    }
  });
});

describe("joinTime", () => {
  it("joins the parts; a chosen hour with no minute means :00", () => {
    expect(joinTime({ hour: "09", minute: "30" })).toBe("09:30");
    expect(joinTime({ hour: "18", minute: "" })).toBe("18:00");
  });
  it("is empty until an hour is chosen", () => {
    expect(joinTime({ hour: "", minute: "30" })).toBe("");
  });
  it("24 is only valid when allowed, and only as 24:00", () => {
    expect(joinTime({ hour: "24", minute: "30" }, true)).toBe("24:00");
    expect(joinTime({ hour: "24", minute: "00" }, false)).toBe("");
  });
  it("round-trips with splitTime", () => {
    for (const v of ["00:00", "09:05", "23:55", "24:00"]) {
      expect(joinTime(splitTime(v), true)).toBe(v);
    }
  });
});

describe("options", () => {
  it("hours 00-23, plus 24 when allowed", () => {
    expect(hourOptions()).toHaveLength(24);
    expect(hourOptions(true).at(-1)).toBe("24");
  });
  it("minutes in 5-minute steps and never hides a saved odd minute", () => {
    expect(minuteOptions()).toHaveLength(12);
    expect(minuteOptions("07")).toContain("07");
    expect(minuteOptions("07")).toHaveLength(13);
    expect(minuteOptions("30")).toHaveLength(12);
  });
});

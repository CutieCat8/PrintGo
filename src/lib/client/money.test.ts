import { describe, expect, it } from "vitest";
import { formatBaht } from "./money";

describe("formatBaht", () => {
  it("formats the contract examples", () => {
    expect(formatBaht(2200)).toBe("22.00");
    expect(formatBaht(125050)).toBe("1,250.50");
  });

  it("handles small and large amounts", () => {
    expect(formatBaht(0)).toBe("0.00");
    expect(formatBaht(5)).toBe("0.05");
    expect(formatBaht(99)).toBe("0.99");
    expect(formatBaht(100)).toBe("1.00");
    expect(formatBaht(123456789)).toBe("1,234,567.89");
  });

  it("rejects floats and negatives", () => {
    expect(() => formatBaht(22.5)).toThrow(RangeError);
    expect(() => formatBaht(-100)).toThrow(RangeError);
    expect(() => formatBaht(Number.NaN)).toThrow(RangeError);
  });
});

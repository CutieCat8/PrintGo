import { describe, expect, it } from "vitest";
import { formatBaht, parseBahtToSatang } from "./money";

describe("formatBaht", () => {
  it("formats the contract examples", () => {
    expect(formatBaht(2200)).toBe("22.00");
    expect(formatBaht(125050)).toBe("1,250.50");
  });

  it("handles small and large amounts", () => {
    expect(formatBaht(0)).toBe("0.00");
    expect(formatBaht(5)).toBe("0.05");
    expect(formatBaht(123456789)).toBe("1,234,567.89");
  });

  it("rejects floats and negatives", () => {
    expect(() => formatBaht(22.5)).toThrow();
    expect(() => formatBaht(-100)).toThrow();
  });
});

describe("parseBahtToSatang", () => {
  it("parses whole and decimal baht without float error", () => {
    expect(parseBahtToSatang("120")).toBe(12000);
    expect(parseBahtToSatang("1,250.5")).toBe(125050);
    expect(parseBahtToSatang("0.29")).toBe(29);
    expect(parseBahtToSatang("19.99")).toBe(1999);
    expect(parseBahtToSatang(" 7.05 ")).toBe(705);
  });

  it("rejects anything that is not a plain amount", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "12.", ".5", "฿20"]) {
      expect(parseBahtToSatang(bad)).toBeNull();
    }
  });
});

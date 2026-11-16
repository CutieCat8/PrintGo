import { describe, expect, it } from "vitest";
import { formatRanges, parsePageRange, selectedPageCount } from "./pages";

describe("formatRanges", () => {
  it("joins runs and keeps single pages", () => {
    expect(formatRanges([1, 2, 3, 5, 8, 9, 10])).toBe("1-3,5,8-10");
    expect(formatRanges([7])).toBe("7");
    expect(formatRanges([])).toBe("");
  });
  it("sorts and removes duplicates", () => {
    expect(formatRanges([5, 1, 2, 2, 3])).toBe("1-3,5");
  });
});

describe("parsePageRange", () => {
  it("reads the example of the design", () => {
    const r = parsePageRange("1-3, 5, 8-10", 12);
    expect(r).toEqual({ ok: true, pages: [1, 2, 3, 5, 8, 9, 10], canonical: "1-3,5,8-10" });
  });
  it("accepts spaces, other commas and unicode dashes, in any order, with overlaps", () => {
    const r = parsePageRange("8–10，  5 ; 1-3 2-4", 12);
    expect(r).toMatchObject({ ok: true, canonical: "1-5,8-10" });
  });
  it("selecting every page is the same as all pages (canonical null)", () => {
    expect(parsePageRange("1-12", 12)).toMatchObject({ ok: true, canonical: null });
    expect(parsePageRange("1-6,7-12", 12)).toMatchObject({ ok: true, canonical: null });
  });
  it.each([
    ["", 12],
    ["   ", 12],
    ["0", 12],
    ["0-3", 12],
    ["13", 12],
    ["3-1", 12],
    ["1-13", 12],
    ["a", 12],
    ["1-", 12],
    ["-3", 12],
    ["1--3", 12],
    ["1.5", 12],
    ["1e3", 12],
    ["999999", 12],
    ["1-2-3", 12],
    ["١", 12], // Arabic-indic digit
  ])("rejects %j", (text, total) => {
    expect(parsePageRange(text, total).ok).toBe(false);
  });
  it("rejects a text that is far too long, and a file with no pages", () => {
    expect(parsePageRange("1,".repeat(20_000), 12).ok).toBe(false);
    expect(parsePageRange("1", 0).ok).toBe(false);
    expect(parsePageRange("1", 1.5).ok).toBe(false);
  });
  it("does not blow up on huge ranges (bounded by the file's page count)", () => {
    const r = parsePageRange("1-10000", 10000);
    expect(r).toMatchObject({ ok: true, canonical: null });
  });
});

describe("selectedPageCount", () => {
  it("null or empty means every page", () => {
    expect(selectedPageCount(null, 12)).toBe(12);
    expect(selectedPageCount(undefined, 12)).toBe(12);
    expect(selectedPageCount("", 12)).toBe(12);
  });
  it("counts the selected pages", () => {
    expect(selectedPageCount("1-3,5,8-10", 12)).toBe(7);
  });
  it("an unreadable range falls back to every page (display only)", () => {
    expect(selectedPageCount("zzz", 12)).toBe(12);
  });
});

describe("large files and tolerant typing", () => {
  it("odd pages of a 300-page file work (the range text is long but valid)", () => {
    const odd = Array.from({ length: 150 }, (_, i) => i * 2 + 1);
    const text = formatRanges(odd);
    expect(text.length).toBeGreaterThan(200);
    const r = parsePageRange(text, 300);
    expect(r).toMatchObject({ ok: true, canonical: text });
    expect(selectedPageCount(text, 300)).toBe(150);
  });

  it("odd pages of a 10,000-page file fit under the cap", () => {
    const odd = Array.from({ length: 5000 }, (_, i) => i * 2 + 1);
    expect(parsePageRange(formatRanges(odd), 10_000)).toMatchObject({ ok: true });
  });

  it("accepts spaces around the dash", () => {
    expect(parsePageRange("1 - 3 , 5", 12)).toMatchObject({ ok: true, canonical: "1-3,5" });
  });

  it("thousands of overlapping huge ranges are cheap (merged as intervals)", () => {
    const text = Array.from({ length: 3000 }, () => "1-10000").join(",");
    const t0 = Date.now();
    expect(parsePageRange(text, 10_000)).toMatchObject({ ok: true, canonical: null });
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

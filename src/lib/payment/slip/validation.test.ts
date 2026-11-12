import { describe, expect, it } from "vitest";
import { parseAmountSatang, parseTimestamp, validateSlipInput } from "./validation";

describe("external slip amount", () => {
  it.each([
    [123.45, 12345],
    [12345.0, 1234500],
    ["123.45", 12345],
    ["1", 100],
    ["0.01", 1],
    ["0", 0],
    ["123.4", 12340],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])("parses %s as integer satang", (value, expected) => {
    expect(parseAmountSatang(value)).toBe(expected);
  });
  it.each([
    "1.001",
    "1.2300000001",
    "1e2",
    "-1",
    "NaN",
    "Infinity",
    "",
    " 1.00",
    "1.00\n",
    "90071992547409.92",
    "1,000",
    "01.00",
    NaN,
    Infinity,
  ])("does not round or guess %s", (value) => {
    expect(parseAmountSatang(value)).toBeNull();
  });
});

describe("order/transfer timestamps", () => {
  it("compares explicit offsets as the same instant", () => {
    expect(parseTimestamp("2026-11-11T10:00:00+07:00")).toBe(
      parseTimestamp("2026-11-11T03:00:00Z"),
    );
  });
  it.each([undefined, "", "2026-11-11T03:00:00", "2026-02-30T03:00:00Z", "invalid"])(
    "rejects missing, timezone-less, or invalid time %s",
    (value) => {
      expect(parseTimestamp(value)).toBeNull();
    },
  );
});

describe("slip input", () => {
  it.each([0, -1, 0.01, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid expected amount %s before network",
    (expectedAmountSatang) => {
      expect(() =>
        validateSlipInput({ slipBytes: new Uint8Array([1]), expectedAmountSatang }),
      ).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR", status: 422 }));
    },
  );
  it.each([new Uint8Array(), new Uint8Array(5 * 1024 * 1024 + 1)])(
    "rejects empty/oversize image",
    (slipBytes) => {
      expect(() => validateSlipInput({ slipBytes, expectedAmountSatang: 1 })).toThrow(
        expect.objectContaining({ code: "VALIDATION_ERROR", status: 422 }),
      );
    },
  );
});

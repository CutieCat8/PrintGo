import { expect, it } from "vitest";
import { parseDeliveryFee } from "./delivery-fee";
it.each([
  ["0", 0],
  ["0.01", 1],
  ["1,250.50", 125050],
  ["6500", 650000],
  ["", undefined],
] as const)("parses actual delivery fee %s", (text, expected) =>
  expect(parseDeliveryFee(text)).toBe(expected),
);
it.each(["1,2", "0,1", "1,,000", "12,34.50", "1,000,", "-1", "1.234", "21474836.48"])(
  "rejects malformed or overflowing fee %s",
  (text) => expect(parseDeliveryFee(text)).toBeNull(),
);

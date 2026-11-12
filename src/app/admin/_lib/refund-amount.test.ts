import { expect, it } from "vitest";
import { parseRefundAmount } from "./refund-amount";
it("accepts exact satang, valid grouping and the full-refund default", () => {
  expect(parseRefundAmount("", 12600)).toBeUndefined();
  expect(parseRefundAmount("50.01", 12600)).toBe(5001);
  expect(parseRefundAmount("1,250.50", 200000)).toBe(125050);
  expect(parseRefundAmount("126.00", 12600)).toBe(12600);
});
it.each(["1,2", "0,1", "12,34.00", "1.001", "0", "-1", "126.01", "1e2", "Infinity"])(
  "rejects malformed or out-of-range %s",
  (value) => expect(parseRefundAmount(value, 12600)).toBeNull(),
);

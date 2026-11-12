import { describe, expect, it } from "vitest";
import { countdown, secondsLeft, slipFileProblem } from "./helpers";
describe("payment file and deadline checks", () => {
  it.each(["image/png", "image/jpeg"])("accepts supported %s at the size limit", (type) => {
    expect(slipFileProblem({ type, size: 5 * 1024 * 1024 })).toBeNull();
  });
  it.each([
    { type: "image/png", size: 0 },
    { type: "image/png", size: 5 * 1024 * 1024 + 1 },
    { type: "image/svg+xml", size: 10 },
    { type: "application/pdf", size: 10 },
  ])("rejects invalid file %j", (file) => {
    expect(slipFileProblem(file)).not.toBeNull();
  });
  it("does not offer payment after expiry or with an invalid deadline", () => {
    expect(secondsLeft("invalid", Date.now())).toBe(0);
    const time = Date.parse("2026-11-12T03:00:00Z");
    expect(secondsLeft("2026-11-12T03:00:00Z", time)).toBe(0);
    expect(secondsLeft("2026-11-12T03:01:00Z", time)).toBe(60);
    expect(countdown(65)).toBe("1:05");
  });
});

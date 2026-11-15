import { afterEach, describe, expect, it, vi } from "vitest";
import { notify } from "./notify";

afterEach(() => vi.restoreAllMocks());

describe("notification stub (replaced by Z6)", () => {
  it("notify resolves and only logs", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(notify("order-1", "quote_ready")).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { notify } from "./notify";
import { notifyShop } from "../push/notifyShop";

afterEach(() => vi.restoreAllMocks());

describe("notification stubs (replaced by Z6 and Z12)", () => {
  it("notify resolves and only logs", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(notify("order-1", "quote_ready")).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("notifyShop resolves and only logs", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(
      notifyShop("shop-1", "order_new", { orderId: "order-1", orderNo: "PG-0001" }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
  });
});

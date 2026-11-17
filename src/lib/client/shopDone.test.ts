import { describe, expect, it } from "vitest";
import type { Order } from "@/lib/db/types";
import { doneGroupOf, groupDoneOrders } from "./shopDone";

let n = 0;
const order = (
  status: Order["status"],
  fulfillment: Order["fulfillment"] = "pickup",
  updatedAt = `2026-11-18T0${n++ % 10}:00:00.000Z`,
) => ({ id: `o${n}`, status, fulfillment, updatedAt }) as unknown as Order;

describe("doneGroupOf", () => {
  it("maps each ending to its group and leaves open work out", () => {
    expect(doneGroupOf({ status: "completed", fulfillment: "pickup" })).toBe("completed");
    expect(doneGroupOf({ status: "rejected", fulfillment: "pickup" })).toBe("rejected");
    expect(doneGroupOf({ status: "cancelled", fulfillment: "delivery" })).toBe("cancelled");
    expect(doneGroupOf({ status: "expired", fulfillment: "pickup" })).toBe("expired");
    expect(doneGroupOf({ status: "printing", fulfillment: "pickup" })).toBeNull();
    expect(doneGroupOf({ status: "ready", fulfillment: "pickup" })).toBeNull();
  });

  it("a delivery order after printing is its own group", () => {
    for (const status of ["ready", "courier_requested", "in_transit"] as const) {
      expect(doneGroupOf({ status, fulfillment: "delivery" })).toBe("handed_off");
    }
  });
});

describe("groupDoneOrders", () => {
  it("counts every order per group, skips empty groups and keeps a fixed order", () => {
    const groups = groupDoneOrders([
      order("expired"),
      order("completed"),
      order("completed"),
      order("cancelled"),
      order("courier_requested", "delivery"),
      order("submitted"),
    ]);
    expect(groups.map((g) => [g.key, g.count])).toEqual([
      ["completed", 2],
      ["handed_off", 1],
      ["cancelled", 1],
      ["expired", 1],
    ]);
  });

  it("lists only the newest per group but still reports the true count", () => {
    const many = Array.from({ length: 35 }, (_, i) =>
      order("completed", "pickup", `2026-11-18T00:${String(i).padStart(2, "0")}:00.000Z`),
    );
    const [group] = groupDoneOrders(many, 30);
    expect(group!.count).toBe(35);
    expect(group!.items).toHaveLength(30);
    expect(group!.items[0]!.updatedAt).toBe("2026-11-18T00:34:00.000Z");
  });

  it("is empty when nothing has finished", () => {
    expect(groupDoneOrders([order("paid"), order("printing")])).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const transitionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/domain/orders/transition", () => ({ transitionManualDelivery: transitionMock }));
import {
  applyDeliveryUpdate,
  createDeliveryForOrder,
  getDeliveryProvider,
  quoteDelivery,
} from "./index";

type Result = { data: unknown; error: unknown };
const results: Record<string, Result[]> = {};
const calls: { table: string; op: string; arg?: unknown }[] = [];

function next(table: string): Result {
  const r = results[table]?.shift();
  if (!r) throw new Error(`unexpected query on ${table}`);
  return r;
}
function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const op of ["select", "eq", "single", "maybeSingle", "insert", "update"]) {
    b[op] = (arg?: unknown) => {
      calls.push({ table, op, arg });
      return op === "single" || op === "maybeSingle" ? Promise.resolve(next(table)) : b;
    };
  }
  return b;
}
vi.mock("@/lib/db/server", () => ({ getServiceClient: () => ({ from: builder }) }));

const shop = { lat: 18.79, lng: 98.98, address: "shop", name: "Shop", phone: "081" };
const deliveryRow = {
  id: "d1",
  provider: "manual",
  status: "pending_admin",
  fee_satang: null,
  tracking_url: null,
  note: null,
  updated_at: "2026-11-11T00:00:00Z",
};

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  vi.stubEnv("DELIVERY_BASE_SATANG", "4000");
  vi.stubEnv("DELIVERY_PER_KM_SATANG", "1000");
});
afterEach(() => vi.unstubAllEnvs());

describe("getDeliveryProvider", () => {
  it("defaults to manual and refuses providers that are not built", () => {
    expect(getDeliveryProvider().name).toBe("manual");
    vi.stubEnv("DELIVERY_PROVIDER", "grab");
    expect(() => getDeliveryProvider()).toThrow(/grab/);
  });
});

describe("quoteDelivery", () => {
  it("quotes from the shop location and labels it an estimate", async () => {
    results.shops = [{ data: shop, error: null }];
    await expect(quoteDelivery("s1", { lat: 18.79, lng: 98.98 })).resolves.toEqual({
      feeSatang: 4000,
      estimated: true,
    });
  });
});

describe("createDeliveryForOrder", () => {
  it("returns the existing delivery without inserting again", async () => {
    results.deliveries = [{ data: deliveryRow, error: null }];
    const d = await createDeliveryForOrder("o1");
    expect(d).toMatchObject({ id: "d1", feeSatang: null, status: "pending_admin" });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("inserts a pending_admin manual delivery for a new order", async () => {
    results.deliveries = [
      { data: null, error: null },
      { data: deliveryRow, error: null },
    ];
    results.orders = [
      {
        data: {
          shop_id: "s1",
          delivery_address: "home",
          delivery_lat: 18.8,
          delivery_lng: 99,
          delivery_recipient_name: "A",
          delivery_recipient_phone: "082",
        },
        error: null,
      },
    ];
    results.shops = [{ data: shop, error: null }];
    await createDeliveryForOrder("o1");
    expect(calls.find((c) => c.op === "insert")?.arg).toEqual({
      order_id: "o1",
      provider: "manual",
      provider_ref: null,
      status: "pending_admin",
    });
  });

  it("refuses an order without a destination", async () => {
    results.deliveries = [{ data: null, error: null }];
    results.orders = [
      { data: { shop_id: "s1", delivery_lat: null, delivery_lng: null }, error: null },
    ];
    await expect(createDeliveryForOrder("o1")).rejects.toThrow(/no delivery destination/);
  });
});

describe("applyDeliveryUpdate", () => {
  it("routes manual updates through the atomic order transition boundary", async () => {
    results.deliveries = [{ data: { provider: "manual" }, error: null }];
    transitionMock.mockResolvedValue({ status: "booked" });
    await applyDeliveryUpdate("o1", { status: "booked", feeSatang: 6500 });
    expect(transitionMock).toHaveBeenCalledWith("o1", { status: "booked", feeSatang: 6500 });
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });
  it("writes snake_case columns for the given order", async () => {
    results.deliveries = [
      { data: { provider: "grab" }, error: null },
      { data: { ...deliveryRow, status: "booked", fee_satang: 6500 }, error: null },
    ];
    const d = await applyDeliveryUpdate("o1", { status: "booked", feeSatang: 6500 });
    expect(calls.find((c) => c.op === "update")?.arg).toEqual({
      status: "booked",
      fee_satang: 6500,
    });
    expect(d).toMatchObject({ status: "booked", feeSatang: 6500 });
  });
});

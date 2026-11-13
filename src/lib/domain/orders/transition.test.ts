import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import type { Actor } from "./rules";
import { ACTIVE_STATUSES, TERMINAL_STATUSES, TRANSITIONS } from "./rules";
import { finalizePayment, transition, transitionManualDelivery } from "./transition";

// ---------------------------------------------------------------------------------------------
// An in-memory stand-in for the Supabase client. It is NOT Postgres: it only imitates the few
// query shapes transition.ts uses, including the "where status in (...)" condition of the update.
// Every query yields once before it runs, so two concurrent calls really interleave.
// ---------------------------------------------------------------------------------------------
type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  db: null as unknown,
  notify: vi.fn(),
  createDelivery: vi.fn(),
  nextInt: null as null | ((min: number, max: number) => number),
}));

vi.mock("@/lib/db/server", () => ({ getServiceClient: () => h.db }));
vi.mock("@/lib/line/notify", () => ({ notify: h.notify }));
vi.mock("@/lib/delivery", () => ({ createDeliveryForOrder: h.createDelivery }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    randomInt: (min: number, max: number) =>
      h.nextInt ? h.nextInt(min, max) : actual.randomInt(min, max),
  };
});

const LEAKY_CODE = "4821";

class FakeDb {
  tables: Record<string, Row[]> = { orders: [], settlements: [], refunds: [] };
  failInsertInto: string | null = null;
  failUpdate = false;
  // RPC response simulator only; actual SQL rollback/concurrency is tested separately in Postgres.
  async rpc(_name: string, args: Record<string, unknown>) {
    await Promise.resolve();
    const order = this.tables.orders.find((row) => row.id === args.p_order_id)!;
    if (!(args.p_from as string[]).includes(order.status as string))
      return { data: null, error: { code: "PT409" } };
    const table = args.p_to === "paid" ? "settlements" : "refunds";
    if (this.failUpdate || this.failInsertInto === table)
      return { data: null, error: { code: "23514", details: `pickup_code=${LEAKY_CODE}` } };
    Object.assign(order, args.p_values);
    this.tables[table].push(
      table === "settlements"
        ? {
            id: `${table}-${this.tables[table].length + 1}`,
            shop_id: order.shop_id,
            order_id: order.id,
            amount_satang: order.print_subtotal_satang,
            status: "pending",
          }
        : {
            id: `${table}-${this.tables[table].length + 1}`,
            order_id: order.id,
            amount_satang: args.p_refund_satang ?? order.total_satang,
            reason: order.reject_reason,
            status: "pending",
          },
    );
    return { data: { order: { ...order }, changed: true }, error: null };
  }
  from(name: string) {
    return new Query(this, name);
  }
}

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: "select" | "update" | "insert" | "upsert" | null = null;
  private payload: Row | null = null;
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private filters: ((r: Row) => boolean)[] = [];
  private returning = false;
  private single = false;
  private max = Infinity;
  constructor(
    private db: FakeDb,
    private table: string,
  ) {}
  select() {
    if (this.op === null) this.op = "select";
    else this.returning = true;
    return this;
  }
  update(p: Row) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  insert(p: Row) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  upsert(p: Row, opts: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.payload = p;
    this.opts = opts;
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  then<T1, T2>(
    ok?: ((v: { data: unknown; error: unknown }) => T1 | PromiseLike<T1>) | null,
    bad?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    return this.run().then(ok, bad);
  }
  private async run(): Promise<{ data: unknown; error: unknown }> {
    await Promise.resolve(); // let a concurrent call run between our read and our write
    const rows = this.db.tables[this.table];
    const match = () => rows.filter((r) => this.filters.every((f) => f(r)));
    const out = (list: Row[]) => ({
      data: this.single ? (list[0] ? { ...list[0] } : null) : list.map((r) => ({ ...r })),
      error: null,
    });
    if (this.op === "select") return out(match().slice(0, this.max));
    if (this.op === "update") {
      if (this.db.failUpdate) {
        return {
          data: null,
          error: {
            code: "23514",
            message: "new row violates check constraint",
            details: `Failing row contains (pickup_code = ${LEAKY_CODE})`,
          },
        };
      }
      const hit = match();
      for (const r of hit) Object.assign(r, this.payload);
      return this.returning ? out(hit) : { data: null, error: null };
    }
    if (this.db.failInsertInto === this.table) {
      return { data: null, error: new Error(`insert into ${this.table} failed`) };
    }
    const row = { id: `${this.table}-${rows.length + 1}`, ...this.payload } as Row;
    if (this.op === "upsert") {
      const key = this.opts.onConflict as string;
      if (rows.some((r) => r[key] === row[key])) return { data: null, error: null };
    }
    rows.push(row);
    return { data: null, error: null };
  }
}

// ---------------------------------------------------------------------------------------------
let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const SHOP_A = uid();
const SHOP_B = uid();
const NOW = new Date("2026-11-12T03:00:00.000Z");

function makeOrder(over: Row = {}): Row {
  const iso = NOW.toISOString();
  return {
    id: uid(),
    created_at: iso,
    order_no: "PG-0001",
    customer_id: uid(),
    shop_id: SHOP_A,
    status: "submitted",
    fulfillment: "pickup",
    delivery_address: null,
    delivery_lat: null,
    delivery_lng: null,
    delivery_recipient_name: null,
    delivery_recipient_phone: null,
    customer_note: null,
    requires_manual_price: false,
    estimated_print_satang: 12000,
    estimated_services_satang: 0,
    print_subtotal_satang: 12000,
    platform_fee_satang: 600,
    delivery_fee_satang: 0,
    total_satang: 12600,
    reject_reason: null,
    response_deadline: iso,
    payment_deadline: null,
    ready_in_minutes: 30,
    estimated_ready_at: null,
    ready_note: null,
    pickup_code: null,
    paid_at: null,
    completed_at: null,
    updated_at: iso,
    ...over,
  };
}

let db: FakeDb;
function seed(over: Row = {}): Row {
  const o = makeOrder(over);
  db.tables.orders.push(o);
  return o;
}
const stored = (o: Row) => db.tables.orders.find((r) => r.id === o.id) as Row;

async function expectApiError(p: Promise<unknown>, code: string, status: number) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe(code);
  expect((err as ApiError).status).toBe(status);
  return err as ApiError;
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  db = new FakeDb();
  h.db = db;
  h.nextInt = null;
  h.notify.mockReset().mockResolvedValue(undefined);
  h.createDelivery.mockReset().mockResolvedValue({});
  delete process.env.PAYMENT_WINDOW_MINUTES;
  delete process.env.PLATFORM_FEE_RATE;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
describe("every row of the CONTRACTS section 4 table", () => {
  it("has the 14 rows of the contract", () => {
    expect(TRANSITIONS).toHaveLength(14);
  });

  const cases = TRANSITIONS.flatMap((rule) => rule.from.map((from) => ({ rule, from })));

  it.each(cases)("$from -> $rule.to by $rule.actors.0", async ({ rule, from }) => {
    const order = seed({ status: from, fulfillment: rule.fulfillment ?? "pickup" });
    const patch =
      rule.to === "awaiting_payment"
        ? { readyInMinutes: 30 }
        : rule.requiresReason
          ? { rejectReason: "เหตุผลทดสอบ" }
          : undefined;
    const result = await transition({
      orderId: order.id as string,
      from,
      to: rule.to,
      actor: rule.actors[0],
      patch,
    });
    expect(result.status).toBe(rule.to);
    expect(stored(order).status).toBe(rule.to);
    if (rule.notify) expect(h.notify).toHaveBeenCalledWith(order.id, rule.notify);
  });

  it("every actor listed in a row may do it, and no other actor may", async () => {
    const all: Actor[] = ["customer", "shop", "admin", "system"];
    for (const rule of TRANSITIONS) {
      for (const actor of all) {
        const order = seed({
          status: rule.from[0],
          fulfillment: rule.fulfillment ?? "pickup",
        });
        const call = transition({
          orderId: order.id as string,
          from: rule.from[0],
          to: rule.to,
          actor,
          patch:
            rule.to === "awaiting_payment"
              ? { readyInMinutes: 30 }
              : rule.requiresReason ||
                  (actor === "admin" && rule.to === "completed" && rule.fulfillment === "pickup")
                ? { rejectReason: "เหตุผล" }
                : undefined,
        });
        if (rule.actors.includes(actor)) await expect(call).resolves.toBeTruthy();
        else await expectApiError(call, "ORDER_INVALID_TRANSITION", 409);
      }
    }
  });
});

describe("rules that must not be allowed", () => {
  it("a customer cannot move an order from printing to ready", async () => {
    const o = seed({ status: "printing" });
    await expectApiError(
      transition({ orderId: o.id as string, from: "printing", to: "ready", actor: "customer" }),
      "ORDER_INVALID_TRANSITION",
      409,
    );
    expect(stored(o).status).toBe("printing");
  });

  it("a customer cannot cancel after payment (D19)", async () => {
    for (const status of ["paid", "printing", "ready"] as const) {
      const o = seed({ status });
      await expectApiError(
        transition({
          orderId: o.id as string,
          from: status,
          to: "cancelled",
          actor: "customer",
          patch: { rejectReason: "ขอยกเลิก" },
        }),
        "ORDER_INVALID_TRANSITION",
        409,
      );
      expect(stored(o).status).toBe(status);
    }
  });

  it("cannot skip steps", async () => {
    const o = seed({ status: "submitted" });
    for (const to of ["paid", "printing", "ready", "completed"] as const) {
      await expectApiError(
        transition({ orderId: o.id as string, from: "submitted", to, actor: "admin" }),
        "ORDER_INVALID_TRANSITION",
        409,
      );
    }
    expect(stored(o).status).toBe("submitted");
  });

  it("cannot leave a terminal state", async () => {
    for (const status of TERMINAL_STATUSES) {
      const o = seed({ status });
      for (const to of ["submitted", "paid", "completed", "cancelled"] as const) {
        await expectApiError(
          transition({ orderId: o.id as string, from: status, to, actor: "admin" }),
          "ORDER_INVALID_TRANSITION",
          409,
        );
      }
      expect(stored(o).status).toBe(status);
    }
  });

  it("answers 409 with the current status when the order is not in the expected one", async () => {
    const o = seed({ status: "awaiting_payment" });
    const err = await expectApiError(
      transition({
        orderId: o.id as string,
        from: "submitted",
        to: "rejected",
        actor: "shop",
        patch: { rejectReason: "x" },
      }),
      "ORDER_INVALID_TRANSITION",
      409,
    );
    expect(err.details).toMatchObject({ currentStatus: "awaiting_payment" });
  });

  it("404 for an unknown order", async () => {
    await expectApiError(
      transition({ orderId: uid(), from: "submitted", to: "expired", actor: "system" }),
      "NOT_FOUND",
      404,
    );
  });

  it("rejects patch fields the step does not allow (no writing status or totals through patch)", async () => {
    const o = seed({ status: "paid" });
    for (const patch of [
      { status: "completed" },
      { totalSatang: 1 },
      { pickupCode: "1234" },
      { shopId: uid() },
    ]) {
      await expectApiError(
        transition({
          orderId: o.id as string,
          from: "paid",
          to: "printing",
          actor: "shop",
          patch: patch as never,
        }),
        "VALIDATION_ERROR",
        422,
      );
    }
    expect(stored(o).status).toBe("paid");
    expect(stored(o).total_satang).toBe(12600);
  });

  it("an empty from list is rejected", async () => {
    const o = seed();
    await expectApiError(
      transition({ orderId: o.id as string, from: [], to: "expired", actor: "system" }),
      "VALIDATION_ERROR",
      422,
    );
  });

  it("pickup-only and delivery-only steps check the fulfillment", async () => {
    const d = seed({ status: "ready", fulfillment: "delivery" });
    await expectApiError(
      transition({ orderId: d.id as string, from: "ready", to: "completed", actor: "shop" }),
      "ORDER_INVALID_TRANSITION",
      409,
    );
    const p = seed({ status: "ready", fulfillment: "pickup" });
    await expectApiError(
      transition({
        orderId: p.id as string,
        from: "ready",
        to: "courier_requested",
        actor: "system",
      }),
      "ORDER_INVALID_TRANSITION",
      409,
    );
    expect(stored(d).status).toBe("ready");
    expect(stored(p).status).toBe("ready");
    expect(h.createDelivery).not.toHaveBeenCalled();
  });
});

describe("submitted -> awaiting_payment (shop confirms)", () => {
  const confirm = (o: Row, patch: Record<string, unknown>) =>
    transition({
      orderId: o.id as string,
      from: "submitted",
      to: "awaiting_payment",
      actor: "shop",
      patch: patch as never,
    });

  it("uses the estimate, adds the 5% fee (min 300) and the delivery fee, and sets the deadline", async () => {
    const o = seed({
      print_subtotal_satang: null,
      platform_fee_satang: null,
      total_satang: null,
      ready_in_minutes: null,
      estimated_print_satang: 10000,
      estimated_services_satang: 2000,
      fulfillment: "delivery",
      delivery_fee_satang: 4000,
    });
    const r = await confirm(o, { readyInMinutes: 30, readyNote: "รับได้หลังบ่ายสอง" });
    expect(r.printSubtotalSatang).toBe(12000);
    expect(r.platformFeeSatang).toBe(600);
    expect(r.totalSatang).toBe(16600);
    expect(r.readyInMinutes).toBe(30);
    expect(r.estimatedReadyAt).toBeNull();
    expect(r.readyNote).toBe("รับได้หลังบ่ายสอง");
    expect(r.paymentDeadline).toBe(new Date(NOW.getTime() + 30 * 60_000).toISOString());
  });

  it("applies the minimum fee of 300 satang to a small order", async () => {
    const o = seed({ estimated_print_satang: 2200, estimated_services_satang: 0 });
    const r = await confirm(o, { readyInMinutes: 15 });
    expect(r.platformFeeSatang).toBe(300);
    expect(r.totalSatang).toBe(2500);
  });

  it("lets the shop change the price of a non-manual order", async () => {
    const o = seed();
    const r = await confirm(o, { readyInMinutes: 15, printSubtotalSatang: 20000 });
    expect(r.printSubtotalSatang).toBe(20000);
    expect(r.platformFeeSatang).toBe(1000);
    expect(r.totalSatang).toBe(21000);
  });

  it("honours PAYMENT_WINDOW_MINUTES", async () => {
    process.env.PAYMENT_WINDOW_MINUTES = "10";
    const o = seed();
    const r = await confirm(o, { readyInMinutes: 15 });
    expect(r.paymentDeadline).toBe(new Date(NOW.getTime() + 10 * 60_000).toISOString());
  });

  it("a manual-price order needs the shop's price (MANUAL_PRICE_REQUIRED) and accepts one", async () => {
    const o = seed({ requires_manual_price: true });
    await expectApiError(confirm(o, { readyInMinutes: 15 }), "MANUAL_PRICE_REQUIRED", 409);
    await expectApiError(
      confirm(o, { readyInMinutes: 15, printSubtotalSatang: 0 }),
      "MANUAL_PRICE_REQUIRED",
      409,
    );
    expect(stored(o).status).toBe("submitted");
    const r = await confirm(o, { readyInMinutes: 15, printSubtotalSatang: 50000 });
    expect(r.printSubtotalSatang).toBe(50000);
    expect(r.platformFeeSatang).toBe(2500);
  });

  it("needs exactly one ready-time choice", async () => {
    const o = seed();
    const future = new Date(NOW.getTime() + 3600_000).toISOString();
    await expectApiError(confirm(o, {}), "VALIDATION_ERROR", 422);
    await expectApiError(
      confirm(o, { readyInMinutes: 15, estimatedReadyAt: future }),
      "VALIDATION_ERROR",
      422,
    );
    expect(stored(o).status).toBe("submitted");
  });

  it("validates minutes (5-2880), a fixed time in the future and the 200 character note", async () => {
    const o = seed();
    for (const minutes of [4, 2881, 1.5]) {
      await expectApiError(confirm(o, { readyInMinutes: minutes }), "VALIDATION_ERROR", 422);
    }
    await expectApiError(
      confirm(o, { estimatedReadyAt: new Date(NOW.getTime() - 1000).toISOString() }),
      "VALIDATION_ERROR",
      422,
    );
    await expectApiError(
      confirm(o, { readyInMinutes: 15, readyNote: "ก".repeat(201) }),
      "VALIDATION_ERROR",
      422,
    );
    const future = new Date(NOW.getTime() + 3600_000).toISOString();
    const ok = await confirm(o, { estimatedReadyAt: future });
    expect(ok.estimatedReadyAt).toBe(future);
    expect(ok.readyInMinutes).toBeNull();
  });
});

describe("-> paid", () => {
  const pay = (o: Row, actor: Actor = "system") =>
    transition({ orderId: o.id as string, from: "awaiting_payment", to: "paid", actor });

  it("sets paid_at, a 4-digit pickup code, estimated_ready_at and one settlement", async () => {
    const o = seed({
      status: "awaiting_payment",
      ready_in_minutes: 30,
      print_subtotal_satang: 12000,
    });
    const r = await pay(o);
    expect(r.paidAt).toBe(NOW.toISOString());
    expect(r.pickupCode).toMatch(/^[1-9][0-9]{3}$/);
    expect(r.estimatedReadyAt).toBe(new Date(NOW.getTime() + 30 * 60_000).toISOString());
    expect(r.readyInMinutes).toBe(30); // kept as history
    expect(db.tables.settlements).toHaveLength(1);
    expect(db.tables.settlements[0]).toMatchObject({
      order_id: o.id,
      shop_id: SHOP_A,
      amount_satang: 12000,
      status: "pending",
    });
    expect(h.notify).toHaveBeenCalledWith(o.id, "payment_verified");
  });

  it("keeps a fixed estimated_ready_at chosen by the shop", async () => {
    const fixed = new Date(NOW.getTime() + 5 * 3600_000).toISOString();
    const o = seed({
      status: "awaiting_payment",
      ready_in_minutes: null,
      estimated_ready_at: fixed,
    });
    const r = await pay(o, "admin");
    expect(r.estimatedReadyAt).toBe(fixed);
  });

  it("the pickup code differs from codes of the shop's open orders, ignoring other shops and finished orders", async () => {
    h.nextInt = (min) => min + counter++; // candidates 1000..1019 in order
    let counter = 0;
    for (let code = 1000; code <= 1004; code++) {
      seed({ status: "ready", pickup_code: String(code) }); // open, same shop: blocks
    }
    seed({ status: "completed", pickup_code: "1005" }); // finished: does not block
    seed({ status: "ready", pickup_code: "1005", shop_id: SHOP_B }); // other shop: does not block
    const o = seed({ status: "awaiting_payment" });
    const r = await pay(o);
    expect(r.pickupCode).toBe("1005");
  });

  it("grows to 5 digits when every 4-digit candidate is taken", async () => {
    let counter = 0;
    h.nextInt = (min) => min + counter++;
    for (let code = 1000; code < 1020; code++) seed({ status: "ready", pickup_code: String(code) });
    const o = seed({ status: "awaiting_payment" });
    counter = 0;
    h.nextInt = (min) => min + counter++;
    const r = await pay(o);
    expect(r.pickupCode).toMatch(/^[1-9][0-9]{4}$/);
  });

  it("never writes the pickup code to a log", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];
    const o = seed({ status: "awaiting_payment" });
    const r = await pay(o);
    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(r.pickupCode as string);
      }
    }
  });

  it("creates the settlement and code only once when two requests race", async () => {
    const o = seed({ status: "awaiting_payment" });
    const results = await Promise.allSettled([pay(o), pay(o, "admin")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ApiError);
    expect((failed.reason as ApiError).code).toBe("ORDER_INVALID_TRANSITION");
    expect(db.tables.settlements).toHaveLength(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it("a second call after success gets 409 and changes nothing", async () => {
    const o = seed({ status: "awaiting_payment" });
    const first = await pay(o);
    await expectApiError(pay(o), "ORDER_INVALID_TRANSITION", 409);
    expect(stored(o).pickup_code).toBe(first.pickupCode);
    expect(db.tables.settlements).toHaveLength(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });
});

describe("refunds", () => {
  const reject = (o: Row, extra: Partial<Parameters<typeof transition>[0]> = {}) =>
    transition({
      orderId: o.id as string,
      from: ["paid", "printing"],
      to: "rejected",
      actor: "shop",
      patch: { rejectReason: "เปิดไฟล์ไม่ได้" },
      ...extra,
    });

  it("shop rejecting after payment refunds the full total as pending", async () => {
    const o = seed({ status: "paid" });
    const r = await reject(o);
    expect(r.rejectReason).toBe("เปิดไฟล์ไม่ได้");
    expect(db.tables.refunds).toEqual([
      expect.objectContaining({
        order_id: o.id,
        amount_satang: 12600,
        reason: "เปิดไฟล์ไม่ได้",
        status: "pending",
      }),
    ]);
  });

  it("an admin can refund less than the total, but not more, zero or a fraction", async () => {
    const make = () => seed({ status: "in_transit" });
    const cancel = (o: Row, refundSatang?: number) =>
      transition({
        orderId: o.id as string,
        from: "in_transit",
        to: "cancelled",
        actor: "admin",
        patch: { rejectReason: "ไรเดอร์ล้มเหลว" },
        refundSatang,
      });
    const bad = make();
    for (const amount of [12601, 0, -5, 100.5]) {
      await expectApiError(cancel(bad, amount), "VALIDATION_ERROR", 422);
    }
    expect(stored(bad).status).toBe("in_transit");
    expect(db.tables.refunds).toHaveLength(0);

    const partial = make();
    await cancel(partial, 5000);
    expect(db.tables.refunds[0]).toMatchObject({ amount_satang: 5000, status: "pending" });
    const full = make();
    await cancel(full);
    expect(db.tables.refunds[1]).toMatchObject({ amount_satang: 12600 });
  });

  it("needs a reason", async () => {
    const o = seed({ status: "paid" });
    await expectApiError(reject(o, { patch: {} }), "VALIDATION_ERROR", 422);
    await expectApiError(reject(o, { patch: { rejectReason: "   " } }), "VALIDATION_ERROR", 422);
    expect(stored(o).status).toBe("paid");
  });

  it("a rejection before payment, and a customer cancel before payment, create no refund", async () => {
    const a = seed({ status: "submitted" });
    await transition({
      orderId: a.id as string,
      from: "submitted",
      to: "rejected",
      actor: "shop",
      patch: { rejectReason: "ปิดร้าน" },
    });
    const b = seed({ status: "awaiting_payment" });
    await transition({
      orderId: b.id as string,
      from: ["submitted", "awaiting_payment"],
      to: "cancelled",
      actor: "customer",
    });
    expect(db.tables.refunds).toHaveLength(0);
  });

  it("a refundSatang on a step that has no refund is rejected", async () => {
    const o = seed({ status: "paid" });
    await expectApiError(
      transition({
        orderId: o.id as string,
        from: "paid",
        to: "printing",
        actor: "shop",
        refundSatang: 100,
      }),
      "VALIDATION_ERROR",
      422,
    );
  });

  it("two racing rejections make one refund", async () => {
    const o = seed({ status: "paid" });
    const results = await Promise.allSettled([reject(o), reject(o)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(db.tables.refunds).toHaveLength(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });
});

describe("completion and delivery", () => {
  it("sets completed_at on both ways to completed", async () => {
    const a = seed({ status: "ready" });
    const ra = await transition({
      orderId: a.id as string,
      from: "ready",
      to: "completed",
      actor: "shop",
    });
    expect(ra.completedAt).toBe(NOW.toISOString());
    const b = seed({ status: "in_transit", fulfillment: "delivery" });
    const rb = await transition({
      orderId: b.id as string,
      from: "in_transit",
      to: "completed",
      actor: "system",
    });
    expect(rb.completedAt).toBe(NOW.toISOString());
  });

  it("calls createDeliveryForOrder once when moving to courier_requested", async () => {
    const o = seed({ status: "ready", fulfillment: "delivery" });
    await transition({
      orderId: o.id as string,
      from: "ready",
      to: "courier_requested",
      actor: "system",
    });
    expect(h.createDelivery).toHaveBeenCalledTimes(1);
    expect(h.createDelivery).toHaveBeenCalledWith(o.id);
  });
});

describe("partial refunds belong to the admin", () => {
  it("a shop cannot choose the refund amount", async () => {
    const o = seed({ status: "paid" });
    await expectApiError(
      transition({
        orderId: o.id as string,
        from: "paid",
        to: "rejected",
        actor: "shop",
        patch: { rejectReason: "เปิดไฟล์ไม่ได้" },
        refundSatang: 100,
      }),
      "VALIDATION_ERROR",
      422,
    );
    expect(stored(o).status).toBe("paid");
    expect(db.tables.refunds).toHaveLength(0);
  });

  it("an admin cancelling at the right moment can", async () => {
    const o = seed({ status: "paid" });
    await transition({
      orderId: o.id as string,
      from: "paid",
      to: "cancelled",
      actor: "admin",
      patch: { rejectReason: "ลูกค้าขอ" },
      refundSatang: 100,
    });
    expect(db.tables.refunds[0]).toMatchObject({ amount_satang: 100 });
  });
});

describe("reason length", () => {
  const reject = (reason: string) => {
    const o = seed({ status: "submitted" });
    return transition({
      orderId: o.id as string,
      from: "submitted",
      to: "rejected",
      actor: "shop",
      patch: { rejectReason: reason },
    });
  };
  it("accepts 500 characters and rejects 501", async () => {
    await expect(reject("ก".repeat(500))).resolves.toBeTruthy();
    await expectApiError(reject("ก".repeat(501)), "VALIDATION_ERROR", 422);
  });
});

describe("failures around the update", () => {
  it("a failing update gives a plain 500 and leaks no row data to the error or the log", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    db.failUpdate = true;
    const o = seed({ status: "awaiting_payment" });
    const e = await expectApiError(
      transition({
        orderId: o.id as string,
        from: "awaiting_payment",
        to: "paid",
        actor: "system",
      }),
      "INTERNAL",
      500,
    );
    expect(JSON.stringify(e.details)).not.toContain(LEAKY_CODE);
    expect(JSON.stringify(err.mock.calls)).not.toContain(LEAKY_CODE);
    expect(stored(o).status).toBe("awaiting_payment");
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("a failing notify does not break the transition", async () => {
    h.notify.mockRejectedValue(new Error("LINE is down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const o = seed({ status: "paid" });
    const r = await transition({
      orderId: o.id as string,
      from: "paid",
      to: "printing",
      actor: "shop",
    });
    expect(r.status).toBe("printing");
  });

  it("a failed financial write rolls back the state change and permits retry", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    db.failInsertInto = "refunds";
    const o = seed({ status: "paid" });
    await expect(
      transition({
        orderId: o.id as string,
        from: "paid",
        to: "rejected",
        actor: "shop",
        patch: { rejectReason: "เสีย" },
      }),
    ).rejects.toMatchObject({ code: "INTERNAL" });
    expect(err).not.toHaveBeenCalled();
    expect(stored(o).status).toBe("paid");
    expect(db.tables.refunds).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
  });
});

describe("nothing else writes orders.status", () => {
  function sources(dir: string, exts = ["ts", "tsx", "mjs"]): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path, exts);
      const ext = name.split(".").pop() as string;
      return exts.includes(ext) && !/\.test\.ts$/.test(name) ? [path] : [];
    });
  }

  it("only transition.ts updates the orders table", () => {
    // Other columns (e.g. the shop's ETA) may be updated elsewhere; `status` may not.
    const offenders = sources("src")
      .filter((p) => !p.replace(/\\/g, "/").endsWith("domain/orders/transition.ts"))
      .filter((p) =>
        // `status` inside the data of update/upsert (before any .eq/.in filter or the end of the statement)
        /from\(\s*["']orders["']\s*\)\s*\.(?:update|upsert)\((?:(?!\.eq\(|\.in\(|;)[\s\S]){0,300}?\bstatus\b/.test(
          readFileSync(p, "utf8"),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it("only internal transition RPCs persist orders.status in SQL", () => {
    const offenders = sources("supabase", ["sql"]).filter((p) =>
      /update\s+(public\.)?orders\b[^;]{0,300}?\bstatus\s*=/i.test(readFileSync(p, "utf8")),
    );
    expect(offenders).toEqual([
      "supabase/migrations/20261112090000_atomic_order_finance.sql",
      "supabase/migrations/20261114090000_manual_delivery_transition.sql",
    ]);
  });

  it("the table covers every open status", () => {
    for (const status of ACTIVE_STATUSES) {
      expect(TRANSITIONS.some((r) => r.from.includes(status))).toBe(true);
    }
  });
});

describe("atomic finalizer adapter", () => {
  it("passes payment context in one RPC and notifies only a changed result", async () => {
    const o = seed({ status: "awaiting_payment" });
    const rpc = vi.spyOn(db, "rpc");
    await finalizePayment({
      orderId: o.id as string,
      paymentId: uid(),
      slipRef: "FICTIONALREF",
      verifiedBy: "slipok",
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_to: "paid",
      p_actor: "system",
      p_verifier: "slipok",
      p_slip_ref: "FICTIONALREF",
    });
    expect(h.notify).toHaveBeenCalledOnce();
  });
  it("accepts a database-confirmed replay after the order advanced without notifying again", async () => {
    const o = seed({ status: "printing", paid_at: NOW.toISOString() });
    vi.spyOn(db, "rpc").mockResolvedValueOnce({ data: { order: o, changed: false }, error: null });
    const result = await finalizePayment({
      orderId: o.id as string,
      paymentId: uid(),
      verifiedBy: "admin",
    });
    expect(result.status).toBe("printing");
    expect(h.notify).not.toHaveBeenCalled();
  });
  it("regenerates a pickup code after database arbitration rejects a concurrent collision", async () => {
    const o = seed({ status: "awaiting_payment" });
    const original = db.rpc.bind(db);
    const rpc = vi.spyOn(db, "rpc").mockResolvedValueOnce({ data: null, error: { code: "PT410" } });
    rpc.mockImplementationOnce(original);
    await finalizePayment({
      orderId: o.id as string,
      paymentId: uid(),
      slipRef: "FICTIONALREF",
      verifiedBy: "slipok",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(db.tables.settlements).toHaveLength(1);
    expect(h.notify).toHaveBeenCalledOnce();
  });
});

describe("admin completion requires and preserves the reason", () => {
  it("rejects missing reasons and delivery completion", async () => {
    const o = seed({ status: "ready", fulfillment: "pickup" });
    await expectApiError(
      transition({ orderId: o.id as string, from: "ready", to: "completed", actor: "admin" }),
      "VALIDATION_ERROR",
      422,
    );
    const delivery = seed({ status: "ready", fulfillment: "delivery" });
    await expectApiError(
      transition({
        orderId: delivery.id as string,
        from: "ready",
        to: "completed",
        actor: "admin",
        patch: { rejectReason: "ตัวอย่างสมมติ" },
      }),
      "ORDER_INVALID_TRANSITION",
      409,
    );
  });
  it("stores an admin completion reason", async () => {
    const o = seed({ status: "ready", fulfillment: "pickup" });
    await transition({
      orderId: o.id as string,
      from: "ready",
      to: "completed",
      actor: "admin",
      patch: { rejectReason: "ตัวอย่างสมมติ" },
    });
    expect(stored(o).reject_reason).toBe("ตัวอย่างสมมติ");
  });
});

describe("manual delivery transition boundary", () => {
  const delivery = {
    id: "00000000-0000-4000-8000-000000000099",
    provider: "manual",
    status: "in_transit",
    fee_satang: 6500,
    tracking_url: null,
    note: null,
    updated_at: "2026-11-13T00:00:00Z",
  };
  it("notifies only after a committed order change, not on replay", async () => {
    const o = seed({ status: "courier_requested", fulfillment: "delivery" });
    const rpc = vi
      .spyOn(db, "rpc")
      .mockResolvedValue({ data: { delivery, orderChanged: true }, error: null } as never);
    expect(
      (await transitionManualDelivery(o.id as string, { status: "in_transit" })).feeSatang,
    ).toBe(6500);
    expect(h.notify).toHaveBeenCalledWith(o.id, "in_transit");
    h.notify.mockClear();
    rpc.mockResolvedValue({ data: { delivery, orderChanged: false }, error: null } as never);
    await transitionManualDelivery(o.id as string, { status: "in_transit" });
    expect(h.notify).not.toHaveBeenCalled();
  });
  it("never notifies after persistence failure and hides DB details", async () => {
    const o = seed({ status: "courier_requested", fulfillment: "delivery" });
    vi.spyOn(db, "rpc").mockResolvedValue({
      data: null,
      error: { code: "PT409", details: "private" },
    } as never);
    await expectApiError(
      transitionManualDelivery(o.id as string, { status: "in_transit" }),
      "ORDER_INVALID_TRANSITION",
      409,
    );
    expect(h.notify).not.toHaveBeenCalled();
  });
});

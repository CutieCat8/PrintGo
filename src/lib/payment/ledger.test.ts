import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSettlementService } from "./settlement";
import { createRefundService } from "./refund";
import { sumSatang } from "./ledger";
import { MarkSettlementPaid } from "./ledger-types";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const created = "2026-11-13T00:00:00.000Z";
function settlement(n: number, orderStatus = "completed", shop = 1) {
  return {
    id: uid(n),
    order_id: uid(n + 1000),
    shop_id: uid(shop),
    amount_satang: 12000,
    status: "pending",
    paid_at: null as string | null,
    created_at: created,
    proof_path: null as string | null,
    orders: {
      order_no: `PG-${n}`,
      status: orderStatus,
      shop_id: uid(shop),
      print_subtotal_satang: 12000,
    },
    shops: { name: `ร้านสมมติ ${shop}`, phone: "0000000000" },
  };
}
function refund(n: number, status = "cancelled") {
  return {
    id: uid(n),
    order_id: uid(n + 1000),
    amount_satang: 5000,
    reason: "ตัวอย่างสมมติ",
    status: "pending",
    paid_at: null as string | null,
    created_at: created,
    orders: {
      order_no: `PG-${n}`,
      status,
      total_satang: 12600,
      customers: { display_name: "ลูกค้าสมมติ" },
    },
  };
}
type Row = Record<string, unknown>;
function field(row: Row, key: string): unknown {
  return key.split(".").reduce<unknown>((value, k) => (value as Row)?.[k], row);
}
/** Query imitation for conditional-update races. Actual PostgREST is checked separately. */
class Db {
  settlements: Row[] = [];
  refunds: Row[] = [];
  updates = 0;
  fail = false;
  loseUpdate = false;
  pages = 0;
  from(table: "settlements" | "refunds") {
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let single = false;
    let limit = Infinity;
    const q = {
      select: () => q,
      eq: (key: string, v: unknown) => {
        filters.push((r) => field(r, key) === v);
        return q;
      },
      gt: (key: string, v: string) => {
        filters.push((r) => String(field(r, key)) > v);
        return q;
      },
      order: () => q,
      limit: (n: number) => {
        limit = n;
        return q;
      },
      maybeSingle: () => {
        single = true;
        return q;
      },
      update: (v: Row) => {
        patch = v;
        return q;
      },
      then: (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => {
            if (this.fail) return { data: null, error: { message: "private DB detail" } };
            const rows = this[table]
              .filter((r) => filters.every((f) => f(r)))
              .sort((a, b) => String(a.id).localeCompare(String(b.id)))
              .slice(0, limit);
            if (patch) {
              if (this.loseUpdate) {
                this.loseUpdate = false;
                return { data: null, error: null };
              }
              for (const row of rows) {
                Object.assign(row, patch);
                this.updates++;
              }
            } else if (!single) this.pages++;
            return { data: structuredClone(single ? (rows[0] ?? null) : rows), error: null };
          })
          .then(resolve, reject),
    };
    return q;
  }
  client() {
    return this as unknown as SupabaseClient;
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(created));
});
afterEach(() => vi.useRealTimers());
describe("settlement ledger", () => {
  it("groups eligible orders by shop using integer amounts and separate status totals", async () => {
    const db = new Db();
    db.settlements = [
      settlement(10),
      { ...settlement(11), status: "paid", paid_at: created },
      settlement(12, "completed", 2),
      settlement(13, "cancelled"),
      settlement(14, "rejected"),
      settlement(15, "paid"),
    ];
    const result = await createSettlementService(db.client()).list("all");
    expect(result.shops).toHaveLength(2);
    expect(result.pendingSatang).toBe(24000);
    expect(result.paidSatang).toBe(12000);
    expect(result.shops[0].settlements).toHaveLength(2);
    expect(result.shops[0].pendingSatang).toBe(12000);
    expect((await createSettlementService(db.client()).list("pending")).paidSatang).toBe(0);
  });
  it("reads beyond the PostgREST page limit without losing rows", async () => {
    const db = new Db();
    db.settlements = Array.from({ length: 205 }, (_, i) => settlement(i + 10));
    const result = await createSettlementService(db.client()).list();
    expect(result.shops[0].settlements).toHaveLength(205);
    expect(result.pendingSatang).toBe(2460000);
    expect(db.pages).toBe(3);
  });
  it.each(["paid", "printing", "ready", "cancelled", "rejected", "expired"])(
    "refuses transferring order in %s",
    async (status) => {
      const db = new Db();
      db.settlements = [settlement(10, status)];
      await expect(createSettlementService(db.client()).markPaid(uid(10))).rejects.toMatchObject({
        status: 409,
      });
      expect(db.updates).toBe(0);
    },
  );
  it("refuses mismatched subtotal or shop and does not change the row", async () => {
    const db = new Db();
    const row = settlement(10);
    row.orders.print_subtotal_satang = 1;
    db.settlements = [row];
    await expect(createSettlementService(db.client()).markPaid(row.id)).rejects.toMatchObject({
      status: 409,
    });
    row.orders.print_subtotal_satang = 12000;
    row.orders.shop_id = uid(2);
    await expect(createSettlementService(db.client()).markPaid(row.id)).rejects.toMatchObject({
      status: 409,
    });
    expect(db.updates).toBe(0);
  });
  it("two concurrent requests write once and replay preserves timestamp and proof", async () => {
    const db = new Db();
    db.settlements = [settlement(10)];
    const service = createSettlementService(db.client());
    const results = await Promise.all([
      service.markPaid(uid(10), "proof/first.png"),
      service.markPaid(uid(10), "proof/second.png"),
    ]);
    expect(results.map((r) => r.changed).sort()).toEqual([false, true]);
    expect(db.updates).toBe(1);
    const before = structuredClone(db.settlements[0]);
    vi.setSystemTime(new Date("2026-11-14T00:00:00Z"));
    const replay = await service.markPaid(uid(10), "proof/third.png");
    expect(replay.changed).toBe(false);
    expect(db.settlements[0]).toEqual(before);
    expect(replay.settlement.status).toBe("paid");
  });
});
describe("refund ledger", () => {
  it("lists full and partial refunds with exact totals", async () => {
    const db = new Db();
    db.refunds = [
      refund(20),
      { ...refund(21, "expired"), amount_satang: 12600, status: "paid", paid_at: created },
    ];
    const result = await createRefundService(db.client()).list("all");
    expect(result.pendingSatang).toBe(5000);
    expect(result.paidSatang).toBe(12600);
    expect(result.refunds[0].customerName).toBe("ลูกค้าสมมติ");
  });
  it("concurrent marking chooses one timestamp and cannot revert to pending", async () => {
    const db = new Db();
    db.refunds = [refund(20)];
    const service = createRefundService(db.client());
    const r = await Promise.all([service.markPaid(uid(20)), service.markPaid(uid(20))]);
    expect(r.map((x) => x.changed).sort()).toEqual([false, true]);
    expect(db.updates).toBe(1);
    vi.setSystemTime(new Date("2026-11-14T00:00:00Z"));
    const again = await service.markPaid(uid(20));
    expect(again.refund.paidAt).toBe(created);
    expect(db.updates).toBe(1);
  });
  it.each(["cancelled", "rejected", "expired"])(
    "allows an existing valid refund for %s",
    async (status) => {
      const db = new Db();
      db.refunds = [refund(20, status)];
      expect((await createRefundService(db.client()).markPaid(uid(20))).refund.status).toBe("paid");
    },
  );
  it("rejects over-refund and incompatible order state", async () => {
    const db = new Db();
    const row = refund(20);
    row.amount_satang = 12601;
    db.refunds = [row];
    const service = createRefundService(db.client());
    await expect(service.markPaid(row.id)).rejects.toMatchObject({ status: 409 });
    row.amount_satang = 5000;
    row.orders.status = "completed";
    await expect(service.markPaid(row.id)).rejects.toMatchObject({ status: 409 });
    expect(db.updates).toBe(0);
  });
});
describe("ledger errors and money boundary", () => {
  it.each(["settlement", "refund"])(
    "%s handles missing, DB failure and a lost pending update",
    async (kind) => {
      const db = new Db();
      const service =
        kind === "settlement"
          ? createSettlementService(db.client())
          : createRefundService(db.client());
      await expect(service.markPaid(uid(30))).rejects.toMatchObject({ status: 404 });
      db.fail = true;
      await expect(service.list()).rejects.toMatchObject({ status: 500 });
      db.fail = false;
      if (kind === "settlement") db.settlements = [settlement(30)];
      else db.refunds = [refund(30)];
      db.loseUpdate = true;
      await expect(service.markPaid(uid(30))).rejects.toMatchObject({ status: 409 });
      expect(db.updates).toBe(0);
    },
  );
  it("refuses unsafe totals rather than rounding satang", () => {
    expect(sumSatang([1, 2, 3])).toBe(6);
    for (const values of [[0.1], [-1], [Number.MAX_SAFE_INTEGER, 1]])
      expect(() => sumSatang(values)).toThrow();
  });
  it("accepts only relative proof paths and optional proof", () => {
    expect(MarkSettlementPaid.parse({})).toEqual({});
    expect(MarkSettlementPaid.parse({ proofPath: "หลักฐาน/หนึ่ง.png" }).proofPath).toBe(
      "หลักฐาน/หนึ่ง.png",
    );
    for (const proofPath of [
      "https://example.com/proof",
      "../proof.png",
      "/proof.png",
      "proof//a.png",
      "proof\\a.png",
      "proof/a.png?token=x",
    ])
      expect(MarkSettlementPaid.safeParse({ proofPath }).success).toBe(false);
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { ShopRow, ShopPricingRuleRow, parseRow } from "@/lib/db/types";
import { buildShopList } from "@/lib/domain/shops/search";
import { createAdminShopsService, presentAdminShop } from "./shops";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function raw(n: number, status = "pending") {
  return {
    id: uid(n),
    name: `ร้านสมมติ ${n}`,
    phone: "0000000000",
    address: "ที่อยู่สมมติ",
    status,
    created_at: "2026-11-12T00:00:00Z",
    shop_pricing_rules: [{ id: uid(n + 1000) }],
    shop_hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday })),
    lat: 18,
    lng: 98,
    is_paused: false,
    accepts_delivery: true,
    cutoff_minutes: 30,
  };
}
type Raw = ReturnType<typeof raw>;

/** Simulated query/conditional update only; no Postgres connection. */
class Db {
  shops: Raw[] = [];
  pendingPayments = 2;
  fail = false;
  loseToStatus: string | null = null;
  updates = 0;
  pages = 0;
  from(table: string) {
    const filters: [string, unknown][] = [];
    let patch: Record<string, unknown> | null = null;
    let single = false;
    let start = 0;
    let end = Infinity;
    const q = {
      select: () => q,
      order: () => q,
      eq: (name: string, value: unknown) => {
        filters.push([name, value]);
        return q;
      },
      range: (a: number, b: number) => {
        start = a;
        end = b;
        this.pages++;
        return q;
      },
      maybeSingle: () => {
        single = true;
        return q;
      },
      update: (value: Record<string, unknown>) => {
        patch = value;
        return q;
      },
      then: <T, E>(
        ok?: ((v: unknown) => T | PromiseLike<T>) | null,
        bad?: ((e: unknown) => E | PromiseLike<E>) | null,
      ) => {
        const run = async () => {
          await Promise.resolve();
          if (this.fail)
            return { data: null, count: null, error: { message: "private-db-detail" } };
          if (table === "payments") return { data: null, count: this.pendingPayments, error: null };
          if (patch && this.loseToStatus) {
            this.shops[0].status = this.loseToStatus;
            this.loseToStatus = null;
          }
          const found = this.shops.filter((row) =>
            filters.every(([name, value]) => row[name as keyof Raw] === value),
          );
          if (patch) {
            found.forEach((row) => Object.assign(row, patch));
            this.updates += found.length;
          }
          const page = found.slice(start, end + 1).map((row) => ({ ...row }));
          return { data: single ? (page[0] ?? null) : page, error: null };
        };
        return run().then(ok, bad);
      },
    };
    return q;
  }
  service() {
    return createAdminShopsService(this as unknown as SupabaseClient);
  }
}

describe("admin shop list", () => {
  it("places pending shops first and counts pending shop/slip work separately", async () => {
    const db = new Db();
    db.shops = [raw(1, "active"), raw(2, "suspended"), raw(3, "pending")];
    const result = await db.service().list();
    expect(result.shops.map((s) => s.status)).toEqual(["pending", "active", "suspended"]);
    expect(result).toMatchObject({ pendingShopCount: 1, pendingPaymentCount: 2 });
  });
  it("reports empty price/hours for newly registered shops without inventing defaults", () => {
    expect(presentAdminShop({ ...raw(1), shop_pricing_rules: [], shop_hours: [] })).toMatchObject({
      hasPricing: false,
      hasHours: false,
    });
    expect(
      presentAdminShop({ ...raw(1), shop_hours: [{ weekday: 0 }, { weekday: 0 }] }).hasHours,
    ).toBe(false);
  });
  it("reads multiple pages rather than silently dropping shops", async () => {
    const db = new Db();
    db.shops = Array.from({ length: 201 }, (_, index) => raw(index + 1));
    expect((await db.service().list()).shops).toHaveLength(201);
    expect(db.pages).toBe(2);
  });
  it("empty list is valid", async () => {
    expect((await new Db().service().list()).shops).toEqual([]);
  });
  it("does not expose raw database errors", async () => {
    const db = new Db();
    db.fail = true;
    await expect(db.service().list()).rejects.toMatchObject({ code: "INTERNAL", status: 500 });
  });
});

describe("approve/suspend", () => {
  it("approves pending and replay does not write twice", async () => {
    const db = new Db();
    db.shops = [raw(1)];
    expect((await db.service().change(uid(1), "approve")).status).toBe("active");
    await db.service().change(uid(1), "approve");
    expect(db.updates).toBe(1);
  });
  it("concurrent approvals perform one status update", async () => {
    const db = new Db();
    db.shops = [raw(1)];
    const results = await Promise.all([
      db.service().change(uid(1), "approve"),
      db.service().change(uid(1), "approve"),
    ]);
    expect(results.every((shop) => shop.status === "active")).toBe(true);
    expect(db.updates).toBe(1);
  });
  it.each(["pending", "active"])(
    "can suspend %s and replay does not write twice",
    async (status) => {
      const db = new Db();
      db.shops = [raw(1, status)];
      expect((await db.service().change(uid(1), "suspend")).status).toBe("suspended");
      await db.service().change(uid(1), "suspend");
      expect(db.updates).toBe(1);
    },
  );
  it("does not reactivate a suspended shop through pending approval", async () => {
    const db = new Db();
    db.shops = [raw(1, "suspended")];
    await expect(db.service().change(uid(1), "approve")).rejects.toMatchObject({ status: 422 });
    expect(db.updates).toBe(0);
  });
  it("missing shop returns 404", async () => {
    await expect(new Db().service().change(uid(1), "approve")).rejects.toMatchObject({
      status: 404,
    });
  });
  it("a competing suspension is not overwritten by approval", async () => {
    const db = new Db();
    db.shops = [raw(1)];
    db.loseToStatus = "suspended";
    await expect(db.service().change(uid(1), "approve")).rejects.toMatchObject({ status: 422 });
    expect(db.shops[0].status).toBe("suspended");
    expect(db.updates).toBe(0);
  });
  it("a suspended shop is removed by Plu's actual search projection", async () => {
    const db = new Db();
    db.shops = [raw(1, "active")];
    const prices = [
      ShopPricingRuleRow.parse({
        id: uid(1001),
        createdAt: "2026-11-12T00:00:00Z",
        shopId: uid(1),
        color: "bw",
        paper: "A4",
        sides: "single",
        pricePerPageSatang: 100,
      }),
    ];
    const search = () =>
      buildShopList({
        shops: db.shops.map((shop) => parseRow(ShopRow, shop)),
        hours: [],
        services: [],
        rules: prices,
        now: new Date("2026-11-12T06:00:00Z"),
      });
    expect(search()).toHaveLength(1);
    await db.service().change(uid(1), "suspend");
    expect(search()).toEqual([]);
  });
});

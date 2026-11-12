import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { GET } from "./route";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  db: null as unknown,
  requireCustomer: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({ getServiceClient: () => h.db }));
vi.mock("@/lib/auth", () => ({ requireCustomer: h.requireCustomer }));

// Stand-in for the few Supabase query shapes the search uses. NOT Postgres.
class Query implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: ((r: Row) => boolean)[] = [];
  constructor(private rows: Row[]) {}
  select() {
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
  then<T1, T2>(
    ok?: ((v: { data: Row[]; error: null }) => T1 | PromiseLike<T1>) | null,
    bad?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    const data = this.rows.filter((r) => this.filters.every((f) => f(r)));
    return Promise.resolve({ data, error: null }).then(ok, bad);
  }
}
const fakeDb = (tables: Record<string, Row[]>) => ({
  from: (name: string) => new Query(tables[name] ?? []),
});

let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const S1 = "00000000-0000-4000-8000-0000000000b1";
const T = "2026-11-12T00:00:00Z";
const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000a2";
const C = "00000000-0000-4000-8000-0000000000a3";
const shopRow = (id: string, name: string, lat: number, lng: number, status = "active"): Row => ({
  id,
  created_at: T,
  name,
  phone: "0800000000",
  address: "ที่อยู่สมมติ",
  lat,
  lng,
  status,
  is_paused: false,
  accepts_delivery: true,
  cutoff_minutes: 30,
});
const hours = (shopId: string): Row[] =>
  [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    id: uid(),
    created_at: T,
    shop_id: shopId,
    weekday: d,
    open_time: "00:00:00",
    close_time: "23:59:00",
    is_closed: false,
  }));
const rule = (shopId: string, price: number): Row => ({
  id: uid(),
  created_at: T,
  shop_id: shopId,
  color: "bw",
  paper: "A4",
  sides: "single",
  price_per_page_satang: price,
});

const req = (query = "") => new Request(`http://localhost/api/liff/shops${query}`);
const call = (query = "") => GET(req(query), undefined as never);

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-12T06:00:00Z") }); // Thursday 13:00 in Bangkok
  h.requireCustomer.mockReset().mockResolvedValue({ customerId: "c1", lineUserId: "u1" });
  h.db = fakeDb({
    shops: [
      shopRow(A, "ร้านตัวอย่าง A", 18.7953, 98.9534),
      shopRow(B, "ร้านตัวอย่าง B", 18.8003, 98.9505),
      shopRow(C, "ร้านตัวอย่าง C", 18.7885, 98.9918),
      shopRow("00000000-0000-4000-8000-0000000000a4", "รออนุมัติ", 18.79, 98.95, "pending"),
    ],
    shop_hours: [...hours(A), ...hours(B), ...hours(C)],
    shop_pricing_rules: [rule(A, 200), rule(B, 150), rule(C, 210)],
    shop_services: [
      {
        id: S1,
        created_at: T,
        shop_id: A,
        name: "เข้าเล่ม",
        price_satang: 3500,
        unit: "per_set",
        is_active: true,
        sort_order: 0,
      },
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/liff/shops", () => {
  it("requires a customer: no login -> 401 and the database is not touched", async () => {
    h.requireCustomer.mockRejectedValue(new ApiError("UNAUTHENTICATED", 401));
    const from = vi.fn();
    h.db = { from };
    const res = await call();
    expect(from).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("without coordinates: names in order, distanceKm null", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((s: Row) => s.name)).toEqual([
      "ร้านตัวอย่าง A",
      "ร้านตัวอย่าง B",
      "ร้านตัวอย่าง C",
    ]);
    expect(body.every((s: Row) => s.distanceKm === null)).toBe(true);
  });

  it("with coordinates: nearest first and distance rounded to 1 decimal", async () => {
    const res = await call("?lat=18.7953&lng=98.9534");
    const body = await res.json();
    expect(body.map((s: Row) => s.id)).toEqual([A, B, C]);
    expect(body[0].distanceKm).toBe(0);
    expect(body[1].distanceKm).toBe(0.6); // A to B is about 0.63 km
    for (const s of body) expect(Number.isInteger(s.distanceKm * 10)).toBe(true);
  });

  it("returns the CONTRACTS 6.1 fields and the shop's services", async () => {
    const body = await (await call()).json();
    expect(body[0]).toEqual({
      id: A,
      name: "ร้านตัวอย่าง A",
      address: "ที่อยู่สมมติ",
      distanceKm: null,
      isOpen: true,
      opensAt: "00:00",
      closesAt: "23:59",
      isPaused: false,
      acceptsDelivery: true,
      startingPriceSatang: 200,
      services: [{ id: S1, name: "เข้าเล่ม", priceSatang: 3500, unit: "per_set" }],
    });
    expect(body[1].startingPriceSatang).toBe(150);
  });

  it("never lists pending or suspended shops", async () => {
    const body = await (await call()).json();
    expect(body.map((s: Row) => s.name)).not.toContain("รออนุมัติ");
  });

  it("rounds distance to the nearest tenth (0.0701 km -> 0.1, not 0.0)", async () => {
    h.db = fakeDb({
      shops: [shopRow(A, "ใกล้มาก", 18.79593, 98.9534)],
      shop_hours: hours(A),
      shop_pricing_rules: [rule(A, 200)],
    });
    const body = await (await call("?lat=18.7953&lng=98.9534")).json();
    expect(body[0].distanceKm).toBe(0.1);
  });

  it("only one of lat/lng -> 422", async () => {
    for (const q of ["?lat=18.7", "?lng=98.9"]) {
      const res = await call(q);
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("bad coordinates -> 422", async () => {
    for (const q of [
      "?lat=abc&lng=98",
      "?lat=91&lng=98",
      "?lat=18&lng=181",
      "?lat=&lng=",
      "?lat=1e2&lng=1",
    ]) {
      expect((await call(q)).status).toBe(422);
    }
  });

  it("an empty list when no shop is active", async () => {
    h.db = fakeDb({ shops: [] });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

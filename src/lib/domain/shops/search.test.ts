import { describe, expect, it, vi } from "vitest";
import type { ShopHourRow, ShopPricingRuleRow, ShopRow, ShopServiceRow } from "@/lib/db/types";
import { buildShopList, type SearchInput } from "./search";

let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const T = "2026-11-12T00:00:00Z";
const NOW = new Date("2026-11-12T06:00:00Z"); // Thursday 13:00 in Bangkok

// Sample coordinates and prices only (made up).
function shop(over: Partial<ShopRow> = {}): ShopRow {
  return {
    id: uid(),
    createdAt: T,
    name: "ร้าน ก",
    phone: "0800000000",
    address: "ที่อยู่สมมติ",
    lat: 18.7953,
    lng: 98.9534,
    status: "active",
    isPaused: false,
    acceptsDelivery: true,
    cutoffMinutes: 30,
    ...over,
  };
}
const hoursFor = (shopId: string): ShopHourRow[] =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    id: uid(),
    createdAt: T,
    shopId,
    weekday,
    openTime: "09:00:00",
    closeTime: "18:00:00",
    isClosed: false,
  }));
const rule = (
  shopId: string,
  price: number,
  over: Partial<ShopPricingRuleRow> = {},
): ShopPricingRuleRow => ({
  id: uid(),
  createdAt: T,
  shopId,
  color: "bw",
  paper: "A4",
  sides: "single",
  pricePerPageSatang: price,
  ...over,
});
const service = (shopId: string, over: Partial<ShopServiceRow> = {}): ShopServiceRow => ({
  id: uid(),
  createdAt: T,
  shopId,
  name: "เข้าเล่ม",
  priceSatang: 3500,
  unit: "per_set",
  isActive: true,
  sortOrder: 0,
  ...over,
});

function input(shops: ShopRow[], extra: Partial<SearchInput> = {}): SearchInput {
  return {
    shops,
    hours: shops.flatMap((s) => hoursFor(s.id)),
    rules: shops.flatMap((s) => [rule(s.id, 200), rule(s.id, 100, { sides: "double" })]),
    services: [],
    now: NOW,
    ...extra,
  };
}

describe("buildShopList: who is listed", () => {
  it("lists only active shops", () => {
    const a = shop({ name: "ใช้งานอยู่" });
    const pending = shop({ name: "รออนุมัติ", status: "pending" });
    const suspended = shop({ name: "ระงับ", status: "suspended" });
    const list = buildShopList(input([a, pending, suspended]));
    expect(list.map((s) => s.name)).toEqual(["ใช้งานอยู่"]);
  });

  it("hides a shop that has no price rule yet (D23)", () => {
    const withPrices = shop({ name: "มีราคา" });
    const without = shop({ name: "ยังไม่ตั้งราคา" });
    const i = input([withPrices, without]);
    i.rules = i.rules.filter((r) => r.shopId === withPrices.id);
    expect(buildShopList(i).map((s) => s.name)).toEqual(["มีราคา"]);
  });

  it("keeps closed and paused shops in the list with isOpen false", () => {
    const paused = shop({ name: "พัก", isPaused: true });
    const late = shop({ name: "ปิดแล้ว" });
    const i = input([paused, late], { now: new Date("2026-11-12T12:00:00Z") }); // 19:00 Bangkok
    const byName = Object.fromEntries(buildShopList(i).map((s) => [s.name, s]));
    expect(byName["พัก"]).toMatchObject({ isOpen: false, isPaused: true });
    expect(byName["ปิดแล้ว"]).toMatchObject({ isOpen: false, isPaused: false });
  });

  it("one shop with unreadable hours does not break the list: it shows as closed", () => {
    const good = shop({ name: "ปกติ" });
    const broken = shop({ name: "เวลาเสีย" });
    const i = input([good, broken]);
    i.hours = i.hours.map((h) => (h.shopId === broken.id ? { ...h, openTime: "xx" } : h));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const list = buildShopList(i);
    expect(list).toHaveLength(2);
    expect(list.find((s) => s.name === "ปกติ")?.isOpen).toBe(true);
    expect(list.find((s) => s.name === "เวลาเสีย")).toMatchObject({
      isOpen: false,
      opensAt: null,
      closesAt: null,
    });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("does not hide a far-away shop (default)", () => {
    const far = shop({ name: "ไกล", lat: 13.7563, lng: 100.5018 });
    const list = buildShopList(input([far], { lat: 18.7953, lng: 98.9534 }));
    expect(list).toHaveLength(1);
    expect(list[0].distanceKm).toBeGreaterThan(500);
  });
});

describe("buildShopList: content", () => {
  it("gives the lowest price per page as the starting price", () => {
    const s = shop();
    const list = buildShopList(input([s]));
    expect(list[0].startingPriceSatang).toBe(100);
  });

  it("starting price does not depend on whether the shop is open", () => {
    const s = shop({ isPaused: true });
    expect(buildShopList(input([s]))[0].startingPriceSatang).toBe(100);
  });

  it("lists only active services, ordered by sortOrder, with the contract fields", () => {
    const s = shop();
    const cover = service(s.id, {
      name: "ปกใส",
      sortOrder: 2,
      unit: "per_order",
      priceSatang: null,
    });
    const bind = service(s.id, { name: "เข้าเล่ม", sortOrder: 1 });
    const hidden = service(s.id, { name: "ปิดอยู่", sortOrder: 0, isActive: false });
    const other = service(shop().id, { name: "ของร้านอื่น", sortOrder: 0 });
    const list = buildShopList(input([s], { services: [cover, hidden, bind, other] }));
    expect(list[0].services).toEqual([
      { id: bind.id, name: "เข้าเล่ม", priceSatang: 3500, unit: "per_set" },
      { id: cover.id, name: "ปกใส", priceSatang: null, unit: "per_order" },
    ]);
  });

  it("has exactly the CONTRACTS 6.1 fields", () => {
    const list = buildShopList(input([shop()], { lat: 18.8, lng: 98.95 }));
    expect(Object.keys(list[0]).sort()).toEqual(
      [
        "id",
        "name",
        "address",
        "distanceKm",
        "isOpen",
        "opensAt",
        "closesAt",
        "isPaused",
        "acceptsDelivery",
        "startingPriceSatang",
        "services",
      ].sort(),
    );
  });

  it("reports open state in Thai time", () => {
    const list = buildShopList(input([shop()]));
    expect(list[0]).toMatchObject({ isOpen: true, opensAt: "09:00", closesAt: "18:00" });
  });
});

describe("buildShopList: ordering", () => {
  it("sorts nearest first when coordinates are given", () => {
    const near = shop({ name: "ซ ใกล้", lat: 18.7953, lng: 98.9534 });
    const mid = shop({ name: "ข กลาง", lat: 18.8003, lng: 98.9505 });
    const far = shop({ name: "ก ไกล", lat: 18.7885, lng: 98.9918 });
    const list = buildShopList(input([far, near, mid], { lat: 18.7953, lng: 98.9534 }));
    expect(list.map((s) => s.name)).toEqual(["ซ ใกล้", "ข กลาง", "ก ไกล"]);
    expect(list[0].distanceKm).toBe(0);
  });

  it("breaks ties on distance by name", () => {
    const b = shop({ name: "ข" });
    const a = shop({ name: "ก" });
    const list = buildShopList(input([b, a], { lat: 18.7953, lng: 98.9534 }));
    expect(list.map((s) => s.name)).toEqual(["ก", "ข"]);
  });

  it("without coordinates: distanceKm is null and shops are sorted by name", () => {
    const c = shop({ name: "ค", lat: 1, lng: 1 });
    const a = shop({ name: "ก", lat: 50, lng: 50 });
    const b = shop({ name: "ข", lat: 20, lng: 20 });
    const list = buildShopList(input([c, a, b]));
    expect(list.map((s) => s.name)).toEqual(["ก", "ข", "ค"]);
    expect(list.every((s) => s.distanceKm === null)).toBe(true);
  });

  it("refuses only one of lat/lng", () => {
    expect(() => buildShopList(input([shop()], { lat: 1 }))).toThrow();
    expect(() => buildShopList(input([shop()], { lng: 1 }))).toThrow();
  });
});

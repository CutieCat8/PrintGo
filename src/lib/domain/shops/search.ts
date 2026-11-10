import { getServiceClient } from "@/lib/db/server";
import {
  parseRow,
  ShopHourRow,
  ShopPricingRuleRow,
  ShopRow,
  ShopServiceRow,
  type ServiceUnit,
} from "@/lib/db/types";
import { haversineKm } from "./distance";
import { isShopOpen, type OpenState } from "./hours";

export type ShopListItem = {
  id: string;
  name: string;
  address: string;
  distanceKm: number | null; // exact km; the API rounds it to 1 decimal
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  isPaused: boolean;
  acceptsDelivery: boolean;
  startingPriceSatang: number;
  services: { id: string; name: string; priceSatang: number | null; unit: ServiceUnit }[];
};

export type SearchInput = {
  shops: ShopRow[];
  hours: ShopHourRow[];
  rules: ShopPricingRuleRow[];
  services: ShopServiceRow[];
  lat?: number;
  lng?: number;
  now: Date;
};

const byName = new Intl.Collator("th").compare;

/**
 * Pure part of the search. Lists only `active` shops that have at least one price rule (D23).
 * Closed or paused shops stay in the list with `isOpen = false`. No distance filter (default).
 */
export function buildShopList(input: SearchInput): ShopListItem[] {
  const { shops, hours, rules, services, lat, lng, now } = input;
  if ((lat === undefined) !== (lng === undefined)) {
    throw new Error("searchShops: pass both lat and lng or neither");
  }
  const origin = lat !== undefined && lng !== undefined ? { lat, lng } : null;

  const items: ShopListItem[] = [];
  for (const shop of shops) {
    if (shop.status !== "active") continue;
    const prices = rules.filter((r) => r.shopId === shop.id).map((r) => r.pricePerPageSatang);
    if (prices.length === 0) continue;

    let state: OpenState;
    try {
      state = isShopOpen(
        shop,
        hours.filter((h) => h.shopId === shop.id),
        now,
      );
    } catch {
      // One shop with unreadable hours must not break the whole list: show it as closed.
      console.error(`[searchShops] unreadable opening hours for shop ${shop.id}`);
      state = { isOpen: false, opensAt: null, closesAt: null };
    }
    items.push({
      id: shop.id,
      name: shop.name,
      address: shop.address,
      distanceKm: origin ? haversineKm(origin, { lat: shop.lat, lng: shop.lng }) : null,
      isOpen: state.isOpen,
      opensAt: state.opensAt,
      closesAt: state.closesAt,
      isPaused: shop.isPaused,
      acceptsDelivery: shop.acceptsDelivery,
      startingPriceSatang: Math.min(...prices),
      services: services
        .filter((s) => s.shopId === shop.id && s.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder || byName(a.name, b.name))
        .map((s) => ({ id: s.id, name: s.name, priceSatang: s.priceSatang, unit: s.unit })),
    });
  }

  return items.sort((a, b) => {
    if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }
    return byName(a.name, b.name);
  });
}

/** Loads the data for the shop list from the database and builds it. */
export async function searchShops(args: {
  lat?: number;
  lng?: number;
  now: Date;
}): Promise<ShopListItem[]> {
  const db = getServiceClient();

  const shopsRes = await db.from("shops").select("*").eq("status", "active");
  if (shopsRes.error) throw shopsRes.error;
  const shops = (shopsRes.data ?? []).map((r) => parseRow(ShopRow, r));
  if (shops.length === 0) return [];
  const ids = shops.map((s) => s.id);

  const [hoursRes, rulesRes, servicesRes] = await Promise.all([
    db.from("shop_hours").select("*").in("shop_id", ids),
    db.from("shop_pricing_rules").select("*").in("shop_id", ids),
    db.from("shop_services").select("*").in("shop_id", ids).eq("is_active", true),
  ]);
  for (const res of [hoursRes, rulesRes, servicesRes]) if (res.error) throw res.error;

  return buildShopList({
    shops,
    hours: (hoursRes.data ?? []).map((r) => parseRow(ShopHourRow, r)),
    rules: (rulesRes.data ?? []).map((r) => parseRow(ShopPricingRuleRow, r)),
    services: (servicesRes.data ?? []).map((r) => parseRow(ShopServiceRow, r)),
    ...args,
  });
}

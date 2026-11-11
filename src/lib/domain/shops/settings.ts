import { getServiceClient } from "@/lib/db/server";
import {
  parseRow,
  Shop,
  ShopDiscountTierRow,
  ShopHourRow,
  ShopPricingRuleRow,
  ShopRow,
} from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import { toHHmm, type HoursBody, type PricingBody, type ProfileBody } from "./settingsSchemas";

// Every function here gets `shopId` from the session (requireShop), never from the request, and
// no function writes the shop's `status`: only an admin approves a shop.

export async function getProfile(shopId: string): Promise<Shop> {
  const { data, error } = await getServiceClient()
    .from("shops")
    .select("*")
    .eq("id", shopId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError("NOT_FOUND", 404);
  return Shop.parse(parseRow(ShopRow, data));
}

export async function updateProfile(shopId: string, body: ProfileBody): Promise<Shop> {
  const { data, error } = await getServiceClient()
    .from("shops")
    .update({
      name: body.name,
      phone: body.phone,
      address: body.address,
      lat: body.lat,
      lng: body.lng,
      accepts_delivery: body.acceptsDelivery,
      cutoff_minutes: body.cutoffMinutes,
      is_paused: body.isPaused,
    })
    .eq("id", shopId)
    .select()
    .maybeSingle();
  if (error) {
    console.error(`[profile] update failed for shop ${shopId} (db code ${error.code})`);
    throw new ApiError("INTERNAL", 500);
  }
  if (!data) throw new ApiError("NOT_FOUND", 404);
  return Shop.parse(parseRow(ShopRow, data));
}

// ---- opening hours -------------------------------------------------------------------------
export type HoursItem = { weekday: number; openTime: string; closeTime: string; isClosed: boolean };

/** What the shop has saved, Monday-first is the screen's business: here simply weekday 0..6. */
export async function getHours(shopId: string): Promise<HoursItem[]> {
  const { data, error } = await getServiceClient()
    .from("shop_hours")
    .select("*")
    .eq("shop_id", shopId)
    .order("weekday", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = parseRow(ShopHourRow, r);
    return {
      weekday: row.weekday,
      openTime: toHHmm(row.openTime),
      closeTime: toHHmm(row.closeTime),
      isClosed: row.isClosed,
    };
  });
}

/** Replaces all 7 days with one upsert statement (unique on shop + weekday), so it is all or nothing. */
export async function putHours(shopId: string, body: HoursBody): Promise<HoursItem[]> {
  const { error } = await getServiceClient()
    .from("shop_hours")
    .upsert(
      body.map((r) => ({
        shop_id: shopId,
        weekday: r.weekday,
        open_time: r.openTime,
        close_time: r.closeTime,
        is_closed: r.isClosed,
      })),
      { onConflict: "shop_id,weekday" },
    );
  if (error) {
    console.error(`[hours] save failed for shop ${shopId} (db code ${error.code})`);
    throw new ApiError("INTERNAL", 500);
  }
  return getHours(shopId);
}

// ---- pricing -------------------------------------------------------------------------------
export type PricingView = {
  rules: { color: string; paper: string; sides: string; pricePerPageSatang: number }[];
  tiers: { minPages: number; note: string | null }[];
};

export async function getPricing(shopId: string): Promise<PricingView> {
  const db = getServiceClient();
  const [rules, tiers] = await Promise.all([
    db.from("shop_pricing_rules").select("*").eq("shop_id", shopId),
    db
      .from("shop_discount_tiers")
      .select("*")
      .eq("shop_id", shopId)
      .order("min_pages", { ascending: true }),
  ]);
  for (const res of [rules, tiers]) if (res.error) throw res.error;
  return {
    rules: (rules.data ?? [])
      .map((r) => parseRow(ShopPricingRuleRow, r))
      .map((r) => ({
        color: r.color,
        paper: r.paper,
        sides: r.sides,
        pricePerPageSatang: r.pricePerPageSatang,
      }))
      .sort((a, b) =>
        `${a.color}/${a.paper}/${a.sides}`.localeCompare(`${b.color}/${b.paper}/${b.sides}`),
      ),
    tiers: (tiers.data ?? [])
      .map((r) => parseRow(ShopDiscountTierRow, r))
      .map((t) => ({ minPages: t.minPages, note: t.note })),
  };
}

/**
 * Replaces the price list and the discount tiers. Not one transaction (supabase-js has none):
 * the new rows are saved first (upsert), and only then are the rows that are no longer in the
 * list removed. If the removal fails the shop keeps some old rows and saving again fixes it.
 * Known gaps until a database function (RPC) replaces this: while it runs an estimate may see old
 * and new rows mixed, and two saves at the same moment (two browser tabs) can leave a mix or even
 * an empty list, which hides the shop from customers until it saves again.
 */
export async function putPricing(shopId: string, body: PricingBody): Promise<PricingView> {
  const db = getServiceClient();
  const fail = (what: string, code: string | undefined) => {
    console.error(`[pricing] ${what} failed for shop ${shopId} (db code ${code})`);
    return new ApiError("INTERNAL", 500);
  };

  if (body.rules.length > 0) {
    const saved = await db.from("shop_pricing_rules").upsert(
      body.rules.map((r) => ({
        shop_id: shopId,
        color: r.color,
        paper: r.paper,
        sides: r.sides,
        price_per_page_satang: r.pricePerPageSatang,
      })),
      { onConflict: "shop_id,color,paper,sides" },
    );
    if (saved.error) throw fail("saving rules", saved.error.code);
  }
  const keep = new Set(body.rules.map((r) => `${r.color}/${r.paper}/${r.sides}`));
  const oldRules = await db
    .from("shop_pricing_rules")
    .select("id, color, paper, sides")
    .eq("shop_id", shopId);
  if (oldRules.error) throw fail("reading rules", oldRules.error.code);
  const staleRules = (oldRules.data ?? [])
    .filter((r) => !keep.has(`${r.color}/${r.paper}/${r.sides}`))
    .map((r) => r.id as string);
  if (staleRules.length > 0) {
    const removed = await db
      .from("shop_pricing_rules")
      .delete()
      .eq("shop_id", shopId)
      .in("id", staleRules);
    if (removed.error) throw fail("removing old rules", removed.error.code);
  }

  if (body.tiers.length > 0) {
    const saved = await db.from("shop_discount_tiers").upsert(
      body.tiers.map((t) => ({ shop_id: shopId, min_pages: t.minPages, note: t.note })),
      { onConflict: "shop_id,min_pages" },
    );
    if (saved.error) throw fail("saving tiers", saved.error.code);
  }
  const keepPages = new Set(body.tiers.map((t) => t.minPages));
  const oldTiers = await db
    .from("shop_discount_tiers")
    .select("id, min_pages")
    .eq("shop_id", shopId);
  if (oldTiers.error) throw fail("reading tiers", oldTiers.error.code);
  const staleTiers = (oldTiers.data ?? [])
    .filter((t) => !keepPages.has(t.min_pages as number))
    .map((t) => t.id as string);
  if (staleTiers.length > 0) {
    const removed = await db
      .from("shop_discount_tiers")
      .delete()
      .eq("shop_id", shopId)
      .in("id", staleTiers);
    if (removed.error) throw fail("removing old tiers", removed.error.code);
  }
  return getPricing(shopId);
}

import { getServiceClient } from "@/lib/db/server";
import { parseRow, Shop, ShopMe, ShopRow } from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import type { RegisterBody } from "./settingsSchemas";

/** GET /api/shop/me: where this signed-in person stands (D23). Admins and strangers: `no_profile`. */
export async function getShopMe(authUserId: string): Promise<ShopMe> {
  const db = getServiceClient();
  const profile = await db
    .from("profiles")
    .select("role, shop_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data || profile.data.role !== "shop" || !profile.data.shop_id) {
    return ShopMe.parse({ state: "no_profile", shop: null });
  }

  const shop = await db.from("shops").select("*").eq("id", profile.data.shop_id).maybeSingle();
  if (shop.error) throw shop.error;
  if (!shop.data) return ShopMe.parse({ state: "no_profile", shop: null });
  const row = parseRow(ShopRow, shop.data);
  return ShopMe.parse({ state: row.status, shop: row });
}

/**
 * POST /api/shop/register (D23): makes a `pending` shop and the `shop` profile that links this
 * person to it. One person, one shop. No price list or opening hours are created: the shop sets
 * them itself and the customers see it only after approval and once it has prices.
 *
 * supabase-js has no transaction, so the two inserts are done in order and the shop row is
 * removed again if the profile cannot be saved (including two sign-ups at the same moment, which
 * the unique `auth_user_id` stops).
 */
export async function registerShop(authUserId: string, body: RegisterBody): Promise<Shop> {
  const db = getServiceClient();

  const existing = await db
    .from("profiles")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) throw new ApiError("ALREADY_REGISTERED", 409);

  const inserted = await db
    .from("shops")
    .insert({
      name: body.name,
      phone: body.phone,
      address: body.address,
      lat: body.lat,
      lng: body.lng,
      accepts_delivery: body.acceptsDelivery,
      status: "pending",
    })
    .select()
    .single();
  if (inserted.error || !inserted.data) {
    console.error(`[register] could not create the shop (db code ${inserted.error?.code})`);
    throw new ApiError("INTERNAL", 500);
  }
  const shop = parseRow(ShopRow, inserted.data);

  const profile = await db
    .from("profiles")
    .insert({ auth_user_id: authUserId, role: "shop", shop_id: shop.id });
  if (profile.error) {
    const duplicate = profile.error.code === "23505"; // another sign-up won the race
    console.error(`[register] could not link the profile (db code ${profile.error.code})`);
    const undo = await db.from("shops").delete().eq("id", shop.id);
    if (undo.error) console.error(`[register] could not remove the unlinked shop ${shop.id}`);
    throw duplicate ? new ApiError("ALREADY_REGISTERED", 409) : new ApiError("INTERNAL", 500);
  }
  return Shop.parse(shop);
}

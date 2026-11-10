import { getServiceClient } from "@/lib/db/server";
import type { Role, ShopStatus } from "@/lib/db/types";
import type { Access } from "./access";
import type { LineProfile } from "./line";

/** The two database lookups authentication needs. Kept thin: the decisions live in access.ts. */

/** The `profiles` row of a signed-in person, with their shop's status; null if they have none. */
export async function findAccess(authUserId: string): Promise<Access | null> {
  const { data, error } = await getServiceClient()
    .from("profiles")
    .select("role, shop_id, shops(status)")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    role: Role;
    shop_id: string | null;
    shops: { status: ShopStatus } | null;
  };
  return { role: row.role, shopId: row.shop_id, shopStatus: row.shops?.status ?? null };
}

/**
 * The customer row for a LINE user, created on first sight. Writes only when something changed,
 * because this runs on every API call.
 */
export async function upsertCustomer(profile: LineProfile): Promise<{ id: string }> {
  const db = getServiceClient();

  const { data: existing, error } = await db
    .from("customers")
    .select("id, display_name, picture_url")
    .eq("line_user_id", profile.lineUserId)
    .maybeSingle();
  if (error) throw error;
  if (
    existing &&
    existing.display_name === profile.displayName &&
    existing.picture_url === profile.pictureUrl
  ) {
    return { id: existing.id };
  }

  // One atomic statement, so two first requests arriving together cannot both insert
  const { data, error: upsertError } = await db
    .from("customers")
    .upsert(
      {
        line_user_id: profile.lineUserId,
        display_name: profile.displayName,
        picture_url: profile.pictureUrl,
      },
      { onConflict: "line_user_id" },
    )
    .select("id")
    .single();
  if (upsertError) throw upsertError;
  return { id: data.id };
}

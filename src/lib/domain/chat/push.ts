import { getServiceClient } from "@/lib/db/server";
import { ApiError } from "@/lib/errors";
import type { PushSubscribeBody } from "./schemas";

const MAX_USER_AGENT = 300;

const takenByAnotherShop = () =>
  new ApiError(
    "VALIDATION_ERROR",
    422,
    "อุปกรณ์นี้ผูกกับร้านอื่นอยู่ กรุณาปิดการแจ้งเตือนในร้านนั้นก่อน",
    { field: "endpoint" },
  );

/**
 * POST /api/shop/push/subscribe: saves the device (one row per `endpoint`) for the caller's shop.
 * The same device again updates its keys. A device that already belongs to ANOTHER shop is refused:
 * it is never moved to a different shop silently, so one shop cannot take over another's alerts.
 */
export async function subscribePush(
  shopId: string,
  authUserId: string,
  body: PushSubscribeBody,
  userAgent: string | null,
): Promise<{ ok: true }> {
  const db = getServiceClient();
  const values = {
    auth_user_id: authUserId,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    user_agent: userAgent ? userAgent.slice(0, MAX_USER_AGENT) : null,
  };

  const existing = await db
    .from("push_subscriptions")
    .select("id, shop_id")
    .eq("endpoint", body.endpoint)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data) {
    if (existing.data.shop_id !== shopId) throw takenByAnotherShop();
    const updated = await db
      .from("push_subscriptions")
      .update(values)
      .eq("endpoint", body.endpoint)
      .eq("shop_id", shopId);
    if (updated.error) throw failure(updated.error.code);
    return { ok: true };
  }

  const inserted = await db
    .from("push_subscriptions")
    .insert({ shop_id: shopId, endpoint: body.endpoint, ...values });
  if (inserted.error) {
    // Two shops saving the same device at the same moment: the unique endpoint stops the second.
    if (inserted.error.code === "23505") throw takenByAnotherShop();
    throw failure(inserted.error.code);
  }
  return { ok: true };
}

/** POST /api/shop/push/unsubscribe: removes the caller's own subscription only; always `ok`. */
export async function unsubscribePush(shopId: string, endpoint: string): Promise<{ ok: true }> {
  const { error } = await getServiceClient()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("shop_id", shopId);
  if (error) throw failure(error.code);
  return { ok: true };
}

function failure(code: string | undefined) {
  console.error(`[push] subscription change failed (db code ${code})`);
  return new ApiError("INTERNAL", 500);
}

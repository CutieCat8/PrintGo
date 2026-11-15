import "server-only";
import webpush from "web-push";
import { getServiceClient } from "@/lib/db/server";

/**
 * Web Push to a shop's devices (D17, CONTRACTS 7): the shop is told about a new order or a customer
 * message even when the dashboard tab is closed.
 *
 * Never throws: a failed push must not break creating an order or sending a message.
 * The payload carries no personal data (no file name, address, phone or message text).
 */
export type ShopNotifyEvent = "order_new" | "chat_message";

/** Push services keep a message this long when the device is offline. */
const TTL_SECONDS = 60 * 60;
/** createOrder awaits us, so one slow push service must not hold the customer's request. */
const SEND_TIMEOUT_MS = 5_000;

type Subscription = { endpoint: string; p256dh: string; auth: string };

/** What the service worker (public/sw.js) receives. Keep both files in sync. */
export type ShopPushPayload = { title: string; body: string; url: string; tag: string };

export function buildPayload(
  event: ShopNotifyEvent,
  ref: { orderId: string; orderNo: string },
): ShopPushPayload {
  const url = `/shop/orders/${encodeURIComponent(ref.orderId)}`;
  if (event === "order_new") {
    return {
      title: `ออเดอร์ใหม่ ${ref.orderNo}`,
      body: "มีลูกค้าสั่งปริ้น เปิดดูและยืนยันราคา",
      url,
      tag: `order-${ref.orderId}`,
    };
  }
  return {
    title: `ลูกค้าส่งข้อความ ${ref.orderNo}`,
    body: "เปิดแชทเพื่อตอบลูกค้า",
    url,
    tag: `chat-${ref.orderId}`,
  };
}

let vapidReady: boolean | undefined;

/** Reads the VAPID keys once. Missing keys = push is simply off (local dev, tests). */
function configureVapid(): boolean {
  if (vapidReady !== undefined) return vapidReady;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.warn("[notifyShop] VAPID keys are not set: Web Push is off");
    return (vapidReady = false);
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return (vapidReady = true);
  } catch {
    // Never log the key itself
    console.error("[notifyShop] VAPID settings are invalid: Web Push is off");
    return (vapidReady = false);
  }
}

/** Test helper: forget the cached VAPID state. */
export function resetVapidForTests(): void {
  vapidReady = undefined;
}

export async function notifyShop(
  shopId: string,
  event: ShopNotifyEvent,
  ref: { orderId: string; orderNo: string },
): Promise<void> {
  try {
    if (!configureVapid()) return;

    const db = getServiceClient();
    const { data, error } = await db
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("shop_id", shopId);
    if (error) {
      console.error(`[notifyShop] could not load subscriptions (db code ${error.code})`);
      return;
    }
    const subscriptions = (data ?? []) as Subscription[];
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify(buildPayload(event, ref));

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: TTL_SECONDS, timeout: SEND_TIMEOUT_MS, urgency: "high" },
          );
          await db
            .from("push_subscriptions")
            .update({ last_success_at: new Date().toISOString() })
            .eq("endpoint", sub.endpoint)
            .eq("shop_id", shopId);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // The device unsubscribed or the browser dropped it: stop sending to it
            await db
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint)
              .eq("shop_id", shopId);
            return;
          }
          // Status only: the error text can contain the endpoint URL, which is a bearer secret
          console.error(`[notifyShop] push failed for shop ${shopId} (status ${status ?? "none"})`);
        }
      }),
    );
  } catch (err) {
    console.error(
      `[notifyShop] unexpected error for shop ${shopId}: ${err instanceof Error ? err.name : "unknown"}`,
    );
  }
}

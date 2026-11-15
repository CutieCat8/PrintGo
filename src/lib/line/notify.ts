import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/db/server";
import { CustomerRow, OrderRow, OrderServiceRow, ShopRow, parseRow } from "@/lib/db/types";
import { pushMessages } from "./client";
import { buildNotifyMessage, type NotifyData } from "./flex/builders";

/**
 * Tells the order's customer in LINE that something changed (Z6, CONTRACTS 7).
 * Signature fixed by docs/CONTRACTS.md. Callers (transition, chat, payment) wrap it in try/catch:
 * a failed push is logged there and never undoes the status change.
 *
 * It throws when the push fails, on purpose: chat uses that to decide whether `push_sent_at` may be
 * set. Each status change calls it once (the SQL transition is atomic), so there is no extra
 * de-duplication table.
 */
export const NOTIFY_EVENTS = [
  "quote_ready",
  "order_rejected",
  "order_expired",
  "order_cancelled",
  "payment_verified",
  "payment_rejected",
  "printing",
  "ready",
  "courier_requested",
  "in_transit",
  "completed",
  "chat_message",
  "eta_changed",
] as const;

export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

/** Rows used only to fill the message; a missing optional row just leaves that line out. */
async function loadData(
  db: SupabaseClient,
  orderId: string,
  event: NotifyEvent,
  liffId: string,
): Promise<{ lineUserId: string; data: NotifyData } | null> {
  const orderRes = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (orderRes.error) throw orderRes.error;
  if (!orderRes.data) return null;
  const order = parseRow(OrderRow, orderRes.data);

  const [customerRes, shopRes] = await Promise.all([
    db.from("customers").select("*").eq("id", order.customerId).maybeSingle(),
    db.from("shops").select("*").eq("id", order.shopId).maybeSingle(),
  ]);
  if (customerRes.error) throw customerRes.error;
  if (shopRes.error) throw shopRes.error;
  if (!customerRes.data || !shopRes.data) return null;
  const customer = parseRow(CustomerRow, customerRes.data);
  const shop = parseRow(ShopRow, shopRes.data);

  let services: NotifyData["services"] = [];
  if (event === "quote_ready") {
    const res = await db.from("order_services").select("*").eq("order_id", orderId);
    if (res.error) throw res.error;
    services = (res.data ?? []).map((r) => {
      const s = parseRow(OrderServiceRow, r);
      return { name: s.name, quantity: s.quantity, unitPriceSatang: s.unitPriceSatang };
    });
  }

  let paymentRejectReason: string | null = null;
  if (event === "payment_rejected") {
    const res = await db
      .from("payments")
      .select("reject_reason")
      .eq("order_id", orderId)
      .eq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(1);
    if (res.error) throw res.error;
    paymentRejectReason = (res.data?.[0]?.reject_reason as string | null) ?? null;
  }

  let trackingUrl: string | null = null;
  if (event === "in_transit") {
    const res = await db
      .from("deliveries")
      .select("tracking_url")
      .eq("order_id", orderId)
      .maybeSingle();
    if (res.error) throw res.error;
    trackingUrl = (res.data?.tracking_url as string | null) ?? null;
  }

  let chatPreview: string | null = null;
  if (event === "chat_message") {
    const res = await db
      .from("messages")
      .select("body")
      .eq("order_id", orderId)
      .eq("sender", "shop")
      .order("created_at", { ascending: false })
      .limit(1);
    if (res.error) throw res.error;
    chatPreview = (res.data?.[0]?.body as string | null) ?? null;
  }

  return {
    lineUserId: customer.lineUserId,
    data: {
      order,
      shopName: shop.name,
      shopAddress: shop.address,
      services,
      paymentRejectReason,
      trackingUrl,
      chatPreview,
      liff: (path) => `https://liff.line.me/${liffId}${path}`,
      now: new Date(),
    },
  };
}

export async function notify(orderId: string, event: NotifyEvent): Promise<void> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId || !process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    // Local dev without a LINE channel: nothing to send to
    console.warn(`[notify] LINE is not configured: skipped ${event}`);
    return;
  }

  const loaded = await loadData(getServiceClient(), orderId, event, liffId);
  if (!loaded) {
    console.warn(`[notify] order ${orderId} or its customer/shop not found: skipped ${event}`);
    return;
  }
  await pushMessages(loaded.lineUserId, [buildNotifyMessage(event, loaded.data)]);
}

import { getServiceClient } from "@/lib/db/server";
import { OrderRow, parseRow } from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import { autoReceiveDue, expireIfDue } from "@/lib/domain/orders/expire";

/** One completed order's money for the shop: the print subtotal (platform fee not included). */
export type EarningItem = {
  orderId: string;
  orderNo: string;
  amountSatang: number;
  completedAt: string;
  /** pending = PrintGo has not transferred it yet; paid = transferred. */
  status: "pending" | "paid";
};

export type ShopEarnings = {
  /** Completed today (Bangkok time). */
  todayTotalSatang: number;
  todayCount: number;
  /** Earned but not yet transferred to the shop (all days). */
  pendingSatang: number;
  /** Already transferred to the shop (all days). */
  paidSatang: number;
  /** Today's orders plus everything still pending, newest first (at most 50). */
  items: EarningItem[];
};

const BANGKOK_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 24 * 3_600_000;
const MAX_ITEMS = 50;
/** A shop will not have more than this many orders in the demo; keeps one request bounded. */
const MAX_ROWS = 1000;

/** Midnight of `now` in Bangkok (UTC+7, no daylight saving) as a UTC instant. */
export function bangkokDayStart(now: Date): Date {
  const local = now.getTime() + BANGKOK_OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - BANGKOK_OFFSET_MS);
}

/**
 * GET /api/shop/earnings: what this shop earned. Money only counts once the order is `completed`
 * (the customer confirmed, or 10 minutes passed after the hand-over). PrintGo receives the customer's
 * payment first and transfers to the shop later (demo: the admin marks the transfer), so this is a
 * statement, not a balance the shop can withdraw by itself.
 */
export async function getShopEarnings(shopId: string, now: Date = new Date()): Promise<ShopEarnings> {
  const db = getServiceClient();

  // Hand-overs the customer never confirmed become completed first (lazy auto-receive).
  const waiting = await db
    .from("orders")
    .select("*")
    .eq("shop_id", shopId)
    .eq("status", "ready");
  if (waiting.error) throw new ApiError("INTERNAL", 500);
  for (const raw of waiting.data ?? []) {
    const row = parseRow(OrderRow, raw);
    if (autoReceiveDue(row, now)) await expireIfDue(row, now);
  }

  // Both lists are read for this shop only and joined here (no long `in (...)` URL, bounded size).
  const settlements = await db
    .from("settlements")
    .select("order_id, amount_satang, status")
    .eq("shop_id", shopId)
    .limit(MAX_ROWS);
  if (settlements.error) throw new ApiError("INTERNAL", 500);
  const rows = settlements.data ?? [];
  if (rows.length === 0) {
    return { todayTotalSatang: 0, todayCount: 0, pendingSatang: 0, paidSatang: 0, items: [] };
  }

  const orders = await db
    .from("orders")
    .select("id, order_no, status, completed_at")
    .eq("shop_id", shopId)
    .eq("status", "completed")
    .limit(MAX_ROWS);
  if (orders.error) throw new ApiError("INTERNAL", 500);
  const done = new Map(
    (orders.data ?? []).map((o) => [o.id as string, o as Record<string, unknown>]),
  );

  const dayStart = bangkokDayStart(now).getTime();
  const items: EarningItem[] = [];
  let todayTotalSatang = 0;
  let todayCount = 0;
  let pendingSatang = 0;
  let paidSatang = 0;

  for (const s of rows) {
    const order = done.get(s.order_id as string);
    if (!order || typeof order.completed_at !== "string") continue; // only completed orders count
    const amount = s.amount_satang as number;
    const status = s.status === "paid" ? "paid" : "pending";
    const completedAt = order.completed_at;
    const today = new Date(completedAt).getTime() >= dayStart;
    if (status === "paid") paidSatang += amount;
    else pendingSatang += amount;
    if (today) {
      todayTotalSatang += amount;
      todayCount += 1;
    }
    if (today || status === "pending") {
      items.push({
        orderId: order.id as string,
        orderNo: order.order_no as string,
        amountSatang: amount,
        completedAt,
        status,
      });
    }
  }
  items.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return {
    todayTotalSatang,
    todayCount,
    pendingSatang,
    paidSatang,
    items: items.slice(0, MAX_ITEMS),
  };
}

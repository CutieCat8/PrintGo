import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/db/server";
import { OrderRow, parseRow, ShopRow } from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import { loadDetailParts } from "./detail";
import { expireIfDue } from "./expire";
import { transition } from "./transition";
import {
  presentCustomerOrderDetail,
  presentOrder,
  type OrderDetailView,
  type OrderView,
} from "./view";

/** The customer's own order, or 404 (an order of someone else looks exactly like a missing one). */
async function readOwnOrder(
  db: SupabaseClient,
  customerId: string,
  orderId: string,
): Promise<OrderRow> {
  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError("NOT_FOUND", 404);
  return parseRow(OrderRow, data);
}

async function readShop(db: SupabaseClient, shopId: string): Promise<ShopRow> {
  const { data, error } = await db.from("shops").select("*").eq("id", shopId).maybeSingle();
  if (error || !data) throw error ?? new ApiError("INTERNAL", 500);
  return parseRow(ShopRow, data);
}

/** GET /api/liff/orders: my orders, newest first. Overdue ones are expired first (lazy expiry). */
export async function listCustomerOrders(customerId: string): Promise<OrderView[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("orders")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows: OrderRow[] = [];
  for (const raw of data ?? []) rows.push(await expireIfDue(parseRow(OrderRow, raw)));

  const shopIds = [...new Set(rows.map((r) => r.shopId))];
  const names = new Map<string, string>();
  if (shopIds.length > 0) {
    const shops = await db.from("shops").select("id, name").in("id", shopIds);
    if (shops.error) throw shops.error;
    for (const s of shops.data ?? []) names.set(s.id as string, s.name as string);
  }
  return rows.map((r) =>
    presentOrder(r, { shopName: names.get(r.shopId) ?? "", viewer: "customer" }),
  );
}

/** GET /api/liff/orders/:id: my order with files, services, payment, delivery and shop. */
export async function getCustomerOrderDetail(
  customerId: string,
  orderId: string,
): Promise<OrderDetailView> {
  const db = getServiceClient();
  const row = await expireIfDue(await readOwnOrder(db, customerId, orderId));
  const parts = await loadDetailParts(db, row);
  return presentCustomerOrderDetail(row, parts);
}

/**
 * POST /api/liff/orders/:id/cancel. Only before payment (D19): from `submitted` or
 * `awaiting_payment`; after payment `transition()` answers 409 and only an admin can cancel.
 */
export async function cancelCustomerOrder(customerId: string, orderId: string): Promise<OrderView> {
  const db = getServiceClient();
  const own = await expireIfDue(await readOwnOrder(db, customerId, orderId));
  const updated = await transition({
    orderId: own.id,
    from: ["submitted", "awaiting_payment"],
    to: "cancelled",
    actor: "customer",
  });
  const shop = await readShop(db, updated.shopId);
  return presentOrder(updated, { shopName: shop.name, viewer: "customer" });
}

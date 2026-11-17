import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/db/server";
import { OrderRow, parseRow, ShopRow } from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import { unreadCount, unreadCounts } from "@/lib/domain/chat/unread";
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
  const unread = await unreadCounts(
    db,
    rows.map((r) => r.id),
    "customer",
  );
  return rows.map((r) =>
    presentOrder(r, {
      shopName: names.get(r.shopId) ?? "",
      viewer: "customer",
      unreadMessageCount: unread.get(r.id) ?? 0,
    }),
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
  return presentCustomerOrderDetail(row, parts, {
    unreadMessageCount: await unreadCount(db, row.id, "customer"),
  });
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
  return presentOrder(updated, {
    shopName: shop.name,
    viewer: "customer",
    unreadMessageCount: await unreadCount(db, updated.id, "customer"),
  });
}

/**
 * POST /api/liff/orders/:id/receive: the customer confirms they got a pickup order. Only after the
 * shop handed it over (`handed_over_at`); before that the customer cannot close the order from
 * home. If the customer does not answer within 10 minutes the system confirms (expire.ts).
 */
export async function receiveCustomerOrder(
  customerId: string,
  orderId: string,
): Promise<OrderView> {
  const db = getServiceClient();
  const own = await expireIfDue(await readOwnOrder(db, customerId, orderId));
  let updated = own;
  if (own.status === "ready") {
    if (own.fulfillment !== "pickup" || own.handedOverAt === null) {
      throw new ApiError("ORDER_INVALID_TRANSITION", 409, undefined, {
        currentStatus: own.status,
      });
    }
    try {
      updated = await transition({
        orderId: own.id,
        from: "ready",
        to: "completed",
        actor: "customer",
      });
    } catch (err) {
      // The system confirmed it at the same moment: answer with the fresh row instead of an error.
      if (!(err instanceof ApiError) || err.code !== "ORDER_INVALID_TRANSITION") throw err;
      updated = await readOwnOrder(db, customerId, orderId);
      if (updated.status !== "completed") throw err;
    }
  } else if (
    own.fulfillment === "delivery" &&
    (own.status === "courier_requested" || own.status === "in_transit")
  ) {
    // Delivery: the customer confirms it arrived. No courier feed is connected yet, so an order
    // still at courier_requested first takes the system step to in_transit (CONTRACTS section 4).
    try {
      if (own.status === "courier_requested") {
        await transition({
          orderId: own.id,
          from: "courier_requested",
          to: "in_transit",
          actor: "system",
        });
      }
      updated = await transition({
        orderId: own.id,
        from: "in_transit",
        to: "completed",
        actor: "customer",
      });
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== "ORDER_INVALID_TRANSITION") throw err;
      updated = await readOwnOrder(db, customerId, orderId);
      if (updated.status !== "completed") throw err;
    }
  } else if (own.status !== "completed") {
    throw new ApiError("ORDER_INVALID_TRANSITION", 409, undefined, { currentStatus: own.status });
  }
  const shop = await readShop(db, updated.shopId);
  return presentOrder(updated, {
    shopName: shop.name,
    viewer: "customer",
    unreadMessageCount: await unreadCount(db, updated.id, "customer"),
  });
}

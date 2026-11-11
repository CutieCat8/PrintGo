import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/db/server";
import { OrderRow, parseRow, type OrderStatus } from "@/lib/db/types";
import { expireIfDue } from "@/lib/domain/orders/expire";
import { TERMINAL_STATUSES } from "@/lib/domain/orders/rules";
import type { ChatActor } from "./messages";
import { unreadCounts } from "./unread";

export type ChatListItem = {
  orderId: string;
  orderNo: string;
  shopName: string;
  status: OrderStatus;
  isClosed: boolean;
  lastMessage: { sender: string; body: string; createdAt: string } | null;
  unreadMessageCount: number;
};

const CHUNK = 100;

/**
 * GET /api/liff/chats and /api/shop/chats: the rooms of this person, newest message first.
 * A room is listed while its order is open, or after it ended if there are messages to read.
 * The number of queries does not grow with the number of orders (orders, messages, unread, shop
 * names: each one query per 100 orders), so there is no query per room.
 * Limit until a database view replaces it: a query returns at most 1000 rows, so with more than
 * that many messages across the person's orders some "last message" may be missing.
 */
export async function listChats(
  actor: ChatActor,
): Promise<{ totalUnread: number; chats: ChatListItem[] }> {
  const db = getServiceClient();

  const ordersQuery = db.from("orders").select("*");
  const { data, error } = await (
    actor.side === "customer"
      ? ordersQuery.eq("customer_id", actor.customerId)
      : ordersQuery.eq("shop_id", actor.shopId)
  ).order("created_at", { ascending: false });
  if (error) throw error;

  // Lazy expiry: an overdue order must already show as closed.
  const orders: OrderRow[] = [];
  for (const raw of data ?? []) orders.push(await expireIfDue(parseRow(OrderRow, raw)));
  if (orders.length === 0) return { totalUnread: 0, chats: [] };

  const ids = orders.map((o) => o.id);
  const lastByOrder = await lastMessages(db, ids);
  const unread = await unreadCounts(db, ids, actor.side);
  const names = await shopNames(db, [...new Set(orders.map((o) => o.shopId))]);

  const chats = orders
    .map((o): ChatListItem => {
      const isClosed = (TERMINAL_STATUSES as readonly string[]).includes(o.status);
      return {
        orderId: o.id,
        orderNo: o.orderNo,
        shopName: names.get(o.shopId) ?? "",
        status: o.status,
        isClosed,
        lastMessage: lastByOrder.get(o.id) ?? null,
        unreadMessageCount: unread.get(o.id) ?? 0,
      };
    })
    .filter((c) => !c.isClosed || c.lastMessage !== null)
    .map((c) => ({
      c,
      at: c.lastMessage?.createdAt ?? orders.find((o) => o.id === c.orderId)?.createdAt ?? "",
    }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .map(({ c }) => c);

  return { totalUnread: chats.reduce((sum, c) => sum + c.unreadMessageCount, 0), chats };
}

async function lastMessages(db: SupabaseClient, orderIds: string[]) {
  const last = new Map<string, { sender: string; body: string; createdAt: string }>();
  for (let i = 0; i < orderIds.length; i += CHUNK) {
    const { data, error } = await db
      .from("messages")
      .select("order_id, sender, body, created_at")
      .in("order_id", orderIds.slice(i, i + CHUNK))
      .order("created_at", { ascending: false });
    if (error) throw error;
    for (const m of data ?? []) {
      const id = m.order_id as string;
      if (!last.has(id)) {
        last.set(id, {
          sender: m.sender as string,
          body: m.body as string,
          createdAt: m.created_at as string,
        });
      }
    }
  }
  return last;
}

async function shopNames(db: SupabaseClient, shopIds: string[]) {
  const names = new Map<string, string>();
  for (let i = 0; i < shopIds.length; i += CHUNK) {
    const { data, error } = await db
      .from("shops")
      .select("id, name")
      .in("id", shopIds.slice(i, i + CHUNK));
    if (error) throw error;
    for (const s of data ?? []) names.set(s.id as string, s.name as string);
  }
  return names;
}

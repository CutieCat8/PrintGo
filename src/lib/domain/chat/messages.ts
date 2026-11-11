import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/db/server";
import { Message, MessageRow, OrderRow, parseRow } from "@/lib/db/types";
import { expireIfDue } from "@/lib/domain/orders/expire";
import { TERMINAL_STATUSES } from "@/lib/domain/orders/rules";
import { ApiError } from "@/lib/errors";
import { notify } from "@/lib/line/notify";
import { notifyShop } from "@/lib/push/notifyShop";
import { AfterParam, parseMessageBody } from "./schemas";
import { otherSide, type ChatSide } from "./unread";

/** Who is in the room: a customer (their own order) or a shop (an order of the shop). */
export type ChatActor = { side: "customer"; customerId: string } | { side: "shop"; shopId: string };

/** O: at most 20 messages per minute from one side in one order. */
export const MESSAGE_RATE_LIMIT = 20;
export const MESSAGE_RATE_WINDOW_SECONDS = 60;
export const MESSAGES_PAGE = 100;

/**
 * The order of this chat room, or 404: someone else's order looks exactly like a missing one, so
 * a room can never be read or written by an outsider. An overdue order is expired first (lazy
 * expiry), so its room is already closed.
 */
async function loadRoom(db: SupabaseClient, actor: ChatActor, orderId: string): Promise<OrderRow> {
  const query = db.from("orders").select("*").eq("id", orderId);
  const owned =
    actor.side === "customer"
      ? query.eq("customer_id", actor.customerId)
      : query.eq("shop_id", actor.shopId);
  const { data, error } = await owned.maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError("NOT_FOUND", 404);
  return expireIfDue(parseRow(OrderRow, data));
}

/**
 * GET .../messages?after=: both sides see every message of the room (customer, shop and system),
 * oldest first, at most 100. With `after`, only messages strictly newer than that time; without it,
 * the latest 100. Reading is still allowed after the room is closed.
 */
export async function listMessages(
  actor: ChatActor,
  orderId: string,
  after: string | null,
): Promise<Message[]> {
  const db = getServiceClient();
  await loadRoom(db, actor, orderId);

  let afterTime: string | null = null;
  if (after !== null) {
    const parsed = AfterParam.safeParse(after);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", 422, "เวลา after ไม่ถูกต้อง", { field: "after" });
    }
    afterTime = parsed.data;
  }

  let query = db.from("messages").select("*").eq("order_id", orderId);
  if (afterTime !== null) {
    const { data, error } = await query
      .gt("created_at", afterTime)
      .order("created_at", { ascending: true })
      .limit(MESSAGES_PAGE);
    if (error) throw error;
    return (data ?? []).map((r) => Message.parse(parseRow(MessageRow, r)));
  }
  query = query.order("created_at", { ascending: false }).limit(MESSAGES_PAGE);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => Message.parse(parseRow(MessageRow, r))).reverse();
}

/**
 * POST .../messages {body}. The sender is decided by who is logged in, never by the request.
 * Closed room (the order is completed, rejected, cancelled or expired) -> CHAT_CLOSED at once.
 * The other side is told only when this side has no earlier message that is still unread, so a
 * burst of messages makes one notification (CONTRACTS section 7).
 */
export async function sendMessage(
  actor: ChatActor,
  orderId: string,
  rawInput: unknown,
): Promise<Message> {
  const body = parseMessageBody(rawInput);
  const db = getServiceClient();
  const order = await loadRoom(db, actor, orderId);

  if ((TERMINAL_STATUSES as readonly string[]).includes(order.status)) {
    throw new ApiError("CHAT_CLOSED", 409);
  }

  const windowStart = new Date(Date.now() - MESSAGE_RATE_WINDOW_SECONDS * 1000).toISOString();
  const recent = await db
    .from("messages")
    .select("id")
    .eq("order_id", orderId)
    .eq("sender", actor.side)
    .gte("created_at", windowStart);
  if (recent.error) throw recent.error;
  if ((recent.data ?? []).length >= MESSAGE_RATE_LIMIT) throw new ApiError("RATE_LIMITED", 429);

  // Decide before inserting: is there already an unread message from this side?
  const earlier = await db
    .from("messages")
    .select("id")
    .eq("order_id", orderId)
    .eq("sender", actor.side)
    .is("read_at", null)
    .limit(1);
  if (earlier.error) throw earlier.error;
  const shouldNotify = (earlier.data ?? []).length === 0;

  const inserted = await db
    .from("messages")
    .insert({ order_id: orderId, sender: actor.side, body })
    .select()
    .single();
  if (inserted.error || !inserted.data) {
    console.error(
      `[chat] could not save a message of order ${orderId} (db code ${inserted.error?.code})`,
    );
    throw new ApiError("INTERNAL", 500);
  }
  const row = parseRow(MessageRow, inserted.data);

  if (shouldNotify) await notifyOtherSide(db, actor.side, order, row.id);
  return Message.parse(row);
}

/** Tell the other side once; a failure never undoes the message. `push_sent_at` marks it as sent. */
async function notifyOtherSide(
  db: SupabaseClient,
  side: ChatSide,
  order: OrderRow,
  messageId: string,
): Promise<void> {
  try {
    if (side === "shop") await notify(order.id, "chat_message");
    else
      await notifyShop(order.shopId, "chat_message", { orderId: order.id, orderNo: order.orderNo });
    await db
      .from("messages")
      .update({ push_sent_at: new Date().toISOString() })
      .eq("id", messageId);
  } catch (err) {
    console.error(
      `[chat] notify failed for order ${order.id}: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }
}

/**
 * POST .../messages/read: marks the OTHER side's unread messages of this order as read.
 * (A customer clears the shop's messages, a shop clears the customer's; system messages are never
 * unread.) Allowed in a closed room too.
 */
export async function markRead(
  actor: ChatActor,
  orderId: string,
): Promise<{ unreadMessageCount: 0 }> {
  const db = getServiceClient();
  await loadRoom(db, actor, orderId);
  const { error } = await db
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .eq("sender", otherSide(actor.side))
    .is("read_at", null);
  if (error) {
    console.error(
      `[chat] could not mark messages read for order ${orderId} (db code ${error.code})`,
    );
    throw new ApiError("INTERNAL", 500);
  }
  return { unreadMessageCount: 0 };
}

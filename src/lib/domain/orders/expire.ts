import { getServiceClient } from "@/lib/db/server";
import { OrderRow, parseRow } from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import { HANDOVER_CONFIRM_MINUTES } from "./handover";
import { transition } from "./transition";

export { HANDOVER_CONFIRM_MINUTES };

/** True when the shop handed a pickup order over and the customer did not answer in time. */
export function autoReceiveDue(order: OrderRow, now: Date = new Date()): boolean {
  return (
    order.status === "ready" &&
    order.fulfillment === "pickup" &&
    order.handedOverAt !== null &&
    new Date(order.handedOverAt).getTime() + HANDOVER_CONFIRM_MINUTES * 60_000 <= now.getTime()
  );
}

/**
 * Lazy expiry (D12): call before returning an order. If the shop did not answer in time
 * (`submitted`) or the customer did not pay in time (`awaiting_payment`), the order becomes
 * `expired` through `transition()` (which also tells the customer). A handed-over pickup order the
 * customer did not confirm within HANDOVER_CONFIRM_MINUTES becomes `completed` the same way.
 * If someone else moved the order at the same moment, the fresh row is returned instead.
 */
export async function expireIfDue(order: OrderRow, now: Date = new Date()): Promise<OrderRow> {
  const receive = autoReceiveDue(order, now);
  const due =
    receive ||
    (order.status === "submitted" && new Date(order.responseDeadline) < now) ||
    (order.status === "awaiting_payment" &&
      order.paymentDeadline !== null &&
      new Date(order.paymentDeadline) < now);
  if (!due) return order;

  try {
    return await transition({
      orderId: order.id,
      from: order.status,
      to: receive ? "completed" : "expired",
      actor: "system",
    });
  } catch (err) {
    if (!(err instanceof ApiError) || err.code !== "ORDER_INVALID_TRANSITION") throw err;
    const { data, error } = await getServiceClient()
      .from("orders")
      .select("*")
      .eq("id", order.id)
      .maybeSingle();
    if (error || !data) throw err;
    return parseRow(OrderRow, data);
  }
}

/** The sweep looks at 100 orders at a time and stops after 500 per run (the rest waits for the next run). */
export const SWEEP_PAGE = 100;
export const SWEEP_MAX_PER_RUN = 500;

export type SweepResult = {
  /** Orders that are expired now. */
  expired: number;
  /** Handed-over pickup orders the customer did not confirm in time: completed by the system. */
  received: number;
  /** Orders somebody else moved first (the shop confirmed, the customer paid or cancelled). */
  alreadyChanged: number;
  /** Orders that could not be processed; they are tried again next time. */
  failed: number;
};

/**
 * The cron sweep (POST/GET /api/cron/expire-orders): expires every order whose answer time
 * (`submitted`) or payment time (`awaiting_payment`) has run out, each one through `expireIfDue`,
 * so it also tells the customer. One order failing never stops the others. Safe to run again and
 * safe next to lazy expiry: both go through the same conditional update, so an order is expired
 * once and an order that was just confirmed or paid is never overwritten.
 */
export async function sweepExpiredOrders(now: Date = new Date()): Promise<SweepResult> {
  const db = getServiceClient();
  const cutoff = now.toISOString();
  const result: SweepResult = { expired: 0, received: 0, alreadyChanged: 0, failed: 0 };
  let seen = 0;

  for (const [status, column] of [
    ["submitted", "response_deadline"],
    ["awaiting_payment", "payment_deadline"],
  ] as const) {
    // Page by id. The first page has no lower bound (an empty string is not a valid uuid).
    let lastId: string | null = null;
    while (seen < SWEEP_MAX_PER_RUN) {
      let query = db.from("orders").select("*").eq("status", status).lt(column, cutoff);
      if (lastId !== null) query = query.gt("id", lastId);
      const { data, error } = await query
        .order("id", { ascending: true })
        .limit(Math.min(SWEEP_PAGE, SWEEP_MAX_PER_RUN - seen));
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1].id as string;

      for (const raw of rows) {
        seen++;
        const order = parseRow(OrderRow, raw);
        try {
          const after = await expireIfDue(order, now);
          if (after.status === "expired") result.expired++;
          else result.alreadyChanged++;
        } catch (err) {
          result.failed++;
          console.error(
            `[expire-orders] order ${order.id} failed: ${err instanceof Error ? err.message : "unknown"}`,
          );
        }
      }
      if (rows.length < SWEEP_PAGE) break;
    }
  }

  // Handed-over pickup orders nobody confirmed within HANDOVER_CONFIRM_MINUTES (settlements only
  // count completed orders, so they must not wait for someone to open the page).
  const waiting = await db.from("orders").select("*").eq("status", "ready").eq("fulfillment", "pickup");
  if (waiting.error) throw waiting.error;
  for (const raw of waiting.data ?? []) {
    const order = parseRow(OrderRow, raw);
    if (!autoReceiveDue(order, now)) continue;
    try {
      const after = await expireIfDue(order, now);
      if (after.status === "completed") result.received++;
      else result.alreadyChanged++;
    } catch (err) {
      result.failed++;
      console.error(
        `[expire-orders] order ${order.id} failed: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }
  return result;
}

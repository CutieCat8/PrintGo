import { getServiceClient } from "@/lib/db/server";
import { OrderRow, parseRow } from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import { transition } from "./transition";

/**
 * Lazy expiry (D12): call before returning an order. If the shop did not answer in time
 * (`submitted`) or the customer did not pay in time (`awaiting_payment`), the order becomes
 * `expired` through `transition()` (which also tells the customer). If someone else moved the
 * order at the same moment, the fresh row is returned instead.
 */
export async function expireIfDue(order: OrderRow, now: Date = new Date()): Promise<OrderRow> {
  const due =
    (order.status === "submitted" && new Date(order.responseDeadline) < now) ||
    (order.status === "awaiting_payment" &&
      order.paymentDeadline !== null &&
      new Date(order.paymentDeadline) < now);
  if (!due) return order;

  try {
    return await transition({
      orderId: order.id,
      from: order.status,
      to: "expired",
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

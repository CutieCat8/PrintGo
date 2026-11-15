import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/db/server";
import { OrderRow, PaymentRow, parseRow } from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import { notify } from "@/lib/line/notify";
import { expireIfDue } from "./expire";

/** Admin review uses the same lock order as financial transitions. No order status writes here. */
export async function reviewPayment(
  paymentId: string,
  action: "reject" | "refund",
  reason: string,
) {
  if (
    !z.uuid().safeParse(paymentId).success ||
    !["reject", "refund"].includes(action) ||
    !reason.trim() ||
    reason.trim().length > 500
  )
    throw new ApiError("VALIDATION_ERROR", 422);
  const db = getServiceClient();
  if (action === "refund") {
    const payment = await db.from("payments").select("*").eq("id", paymentId).maybeSingle();
    if (payment.error) throw new ApiError("INTERNAL", 500);
    if (!payment.data) throw new ApiError("NOT_FOUND", 404);
    const p = parseRow(PaymentRow, payment.data);
    const order = await db.from("orders").select("*").eq("id", p.orderId).maybeSingle();
    if (order.error || !order.data) throw new ApiError("INTERNAL", 500);
    const o = await expireIfDue(parseRow(OrderRow, order.data));
    if (o.status !== "expired") throw new ApiError("ORDER_INVALID_TRANSITION", 409);
  }
  const { data, error } = await db.rpc("review_order_payment", {
    p_payment_id: paymentId,
    p_action: action,
    p_reason: reason.trim(),
  });
  if (error) {
    const status =
      error.code === "PT409"
        ? 409
        : error.code === "PT404"
          ? 404
          : error.code === "PT422"
            ? 422
            : 500;
    throw new ApiError(
      status === 409
        ? "ORDER_INVALID_TRANSITION"
        : status === 404
          ? "NOT_FOUND"
          : status === 422
            ? "VALIDATION_ERROR"
            : "INTERNAL",
      status,
    );
  }
  const result = z.object({ changed: z.boolean(), orderId: z.uuid() }).safeParse(data);
  if (!result.success) throw new ApiError("INTERNAL", 500);
  if (action === "reject" && result.data.changed)
    await notify(result.data.orderId, "payment_rejected").catch(() => {});
  return { changed: result.data.changed };
}

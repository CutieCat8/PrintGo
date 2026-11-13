import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/db/server";
import { OrderRow, PaymentRow, parseRow, OrderStatus } from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import { finalizePayment, transition } from "@/lib/domain/orders/transition";
import { loadDetailParts } from "@/lib/domain/orders/detail";
import { presentAdminOrderDetail, presentOrder } from "@/lib/domain/orders/view";
import { reviewPayment } from "@/lib/domain/orders/review";

export const Reason = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
export const Cancellation = Reason.extend({
  refundSatang: z.number().int().positive().max(2147483647).optional(),
}).strict();
export const PaymentFilter = z.enum(["pending", "pending_review", "verified", "rejected"]);
export const OrderFilter = OrderStatus;
const conflict = () => new ApiError("ORDER_INVALID_TRANSITION", 409);

async function allRows<T>(
  page: (offset: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const result = await page(offset);
    if (result.error || !result.data) throw new ApiError("INTERNAL", 500);
    rows.push(...result.data);
    if (result.data.length < 100) return rows;
  }
}

export function createAdminOperations() {
  const db = getServiceClient();
  async function order(id: string) {
    const r = await db.from("orders").select("*").eq("id", id).maybeSingle();
    if (r.error) throw new ApiError("INTERNAL", 500);
    if (!r.data) throw new ApiError("NOT_FOUND", 404);
    return parseRow(OrderRow, r.data);
  }
  async function payment(id: string) {
    const r = await db.from("payments").select("*").eq("id", id).maybeSingle();
    if (r.error) throw new ApiError("INTERNAL", 500);
    if (!r.data) throw new ApiError("NOT_FOUND", 404);
    return parseRow(PaymentRow, r.data);
  }
  return {
    async payments(status = "pending_review") {
      const rows = await allRows((offset) =>
        db
          .from("payments")
          .select("*")
          .eq("status", status)
          .order("created_at")
          .order("id")
          .range(offset, offset + 99),
      );
      return {
        payments: await Promise.all(
          rows.map(async (raw) => {
            const p = parseRow(PaymentRow, raw);
            const o = await order(p.orderId);
            let slipUrl: string | null = null;
            if (p.slipPath) {
              const signed = await db.storage
                .from("payment-slips")
                .createSignedUrl(p.slipPath, 120);
              if (signed.error) throw new ApiError("INTERNAL", 500);
              slipUrl = signed.data.signedUrl;
            }
            return {
              id: p.id,
              orderId: o.id,
              orderNo: o.orderNo,
              orderStatus: o.status,
              amountSatang: p.amountSatang,
              expectedAmountSatang: o.totalSatang,
              status: p.status,
              rejectReason: p.rejectReason,
              createdAt: p.createdAt,
              paymentDeadline: o.paymentDeadline,
              slipUrl,
            };
          }),
        ),
      };
    },
    async approve(id: string) {
      const p = await payment(id);
      if (p.status !== "pending_review" && p.status !== "verified") throw conflict();
      return finalizePayment({ orderId: p.orderId, paymentId: p.id, verifiedBy: "admin" });
    },
    async reject(id: string, reason: string) {
      return reviewPayment(id, "reject", reason);
    },
    async refund(id: string, reason: string) {
      return reviewPayment(id, "refund", reason);
    },
    async orders(status?: string, q = "") {
      let query = db
        .from("orders")
        .select("*,shops!inner(name),payments(status)")
        .order("created_at", { ascending: false });
      if (status) query = query.eq("status", status);
      const rows = await allRows((offset) => query.order("id").range(offset, offset + 99));
      const needle = q.toLocaleLowerCase("th");
      return {
        orders: rows
          .filter((raw) => {
            const shop = raw.shops as unknown as { name: string };
            return !q || `${raw.order_no} ${shop.name}`.toLocaleLowerCase("th").includes(needle);
          })
          .map((raw) => {
            const row = parseRow(OrderRow, raw);
            const shop = raw.shops as unknown as { name: string };
            const payments = raw.payments as unknown as { status: string }[];
            return {
              ...presentOrder(row, {
                shopName: shop.name,
                viewer: "customer",
                unreadMessageCount: 0,
              }),
              pendingReview: payments.some((p) => p.status === "pending_review"),
            };
          }),
      };
    },
    async detail(id: string) {
      const row = await order(id);
      return presentAdminOrderDetail(row, await loadDetailParts(db, row));
    },
    async cancel(id: string, reason: string, refundSatang?: number) {
      return transition({
        orderId: id,
        from: ["paid", "printing", "ready", "courier_requested", "in_transit"],
        to: "cancelled",
        actor: "admin",
        patch: { rejectReason: reason },
        refundSatang,
      });
    },
    async complete(id: string, reason: string) {
      return transition({
        orderId: id,
        from: "ready",
        to: "completed",
        actor: "admin",
        patch: { rejectReason: reason },
      });
    },
  };
}

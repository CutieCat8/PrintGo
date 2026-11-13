import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/db/server";
import { ApiError } from "@/lib/errors";
import { RefundEntry, RefundList, type LedgerFilter } from "./ledger-types";
import { readLedgerPages, ledgerTotals } from "./ledger";
const selection = "*,orders!inner(order_no,status,total_satang,customers!inner(display_name))";
const raw = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  amount_satang: z.number().int().positive(),
  reason: z.string(),
  status: z.enum(["pending", "paid"]),
  paid_at: z.string().nullable(),
  created_at: z.string(),
  orders: z.object({
    order_no: z.string(),
    status: z.string(),
    total_satang: z.number().int().positive().nullable(),
    customers: z.object({ display_name: z.string() }),
  }),
});
function present(value: unknown) {
  const parsed = raw.safeParse(value);
  if (!parsed.success) throw new ApiError("INTERNAL", 500);
  const row = parsed.data;
  const entry = RefundEntry.parse({
    id: row.id,
    orderId: row.order_id,
    orderNo: row.orders.order_no,
    customerName: row.orders.customers.display_name,
    amountSatang: row.amount_satang,
    reason: row.reason,
    status: row.status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  });
  return { row, entry };
}
export function createRefundService(db: SupabaseClient = getServiceClient()) {
  async function read(id: string) {
    const r = await db.from("refunds").select(selection).eq("id", id).maybeSingle();
    if (r.error) throw new ApiError("INTERNAL", 500);
    if (!r.data) throw new ApiError("NOT_FOUND", 404);
    return present(r.data);
  }
  return {
    async list(status: LedgerFilter = "pending") {
      const rows = await readLedgerPages((after) => {
        let q = db.from("refunds").select(selection);
        if (status !== "all") q = q.eq("status", status);
        if (after) q = q.gt("id", after);
        return q.order("id").limit(100);
      });
      const refunds = rows.map((r) => present(r).entry);
      return RefundList.parse({ refunds, ...ledgerTotals(refunds) });
    },
    async markPaid(id: string) {
      const { row, entry } = await read(id);
      if (
        !["cancelled", "rejected", "expired"].includes(row.orders.status) ||
        row.orders.total_satang === null ||
        entry.amountSatang > row.orders.total_satang
      )
        throw new ApiError(
          "ORDER_INVALID_TRANSITION",
          409,
          "ออเดอร์หรือยอดคืนเงินไม่ถูกต้อง กรุณาตรวจสอบก่อนบันทึก",
        );
      if (entry.status === "paid") return { refund: entry, changed: false };
      const r = await db
        .from("refunds")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "pending")
        .eq("amount_satang", entry.amountSatang)
        .select(selection)
        .maybeSingle();
      if (r.error) throw new ApiError("INTERNAL", 500);
      if (r.data) return { refund: present(r.data).entry, changed: true };
      const latest = await read(id);
      if (latest.entry.status !== "paid") throw new ApiError("ORDER_INVALID_TRANSITION", 409);
      return { refund: latest.entry, changed: false };
    },
  };
}

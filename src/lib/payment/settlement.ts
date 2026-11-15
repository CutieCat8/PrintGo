import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/db/server";
import { ApiError } from "@/lib/errors";
import { SettlementEntry, SettlementList, type LedgerFilter } from "./ledger-types";
import { readLedgerPages, ledgerTotals } from "./ledger";

const selection =
  "*,orders!inner(order_no,status,shop_id,print_subtotal_satang),shops!inner(name,phone)";
const raw = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  shop_id: z.uuid(),
  amount_satang: z.number().int().positive(),
  status: z.enum(["pending", "paid"]),
  paid_at: z.string().nullable(),
  created_at: z.string(),
  proof_path: z.string().nullable(),
  orders: z.object({
    order_no: z.string(),
    status: z.string(),
    shop_id: z.uuid(),
    print_subtotal_satang: z.number().int().positive().nullable(),
  }),
  shops: z.object({ name: z.string(), phone: z.string() }),
});
function present(value: unknown) {
  const parsed = raw.safeParse(value);
  if (!parsed.success) throw new ApiError("INTERNAL", 500);
  const row = parsed.data;
  if (
    row.orders.status !== "completed" ||
    row.shop_id !== row.orders.shop_id ||
    row.amount_satang !== row.orders.print_subtotal_satang
  )
    throw new ApiError("ORDER_INVALID_TRANSITION", 409, "รายการนี้ยังไม่พร้อมบันทึกการโอนให้ร้าน");
  return {
    row,
    entry: SettlementEntry.parse({
      id: row.id,
      orderId: row.order_id,
      orderNo: row.orders.order_no,
      shopId: row.shop_id,
      amountSatang: row.amount_satang,
      status: row.status,
      paidAt: row.paid_at,
      createdAt: row.created_at,
      proofPath: row.proof_path,
    }),
  };
}
export function createSettlementService(db: SupabaseClient = getServiceClient()) {
  async function read(id: string) {
    const r = await db.from("settlements").select(selection).eq("id", id).maybeSingle();
    if (r.error) throw new ApiError("INTERNAL", 500);
    if (!r.data) throw new ApiError("NOT_FOUND", 404);
    return present(r.data);
  }
  return {
    async list(status: LedgerFilter = "pending") {
      const rows = await readLedgerPages((after) => {
        let q = db.from("settlements").select(selection).eq("orders.status", "completed");
        if (status !== "all") q = q.eq("status", status);
        if (after) q = q.gt("id", after);
        return q.order("id").limit(100);
      });
      const groups = new Map<
        string,
        { shopId: string; name: string; phone: string; settlements: SettlementEntry[] }
      >();
      const entries = rows.map((value) => {
        const { row, entry } = present(value);
        let group = groups.get(entry.shopId);
        if (!group) {
          group = {
            shopId: entry.shopId,
            name: row.shops.name,
            phone: row.shops.phone,
            settlements: [],
          };
          groups.set(entry.shopId, group);
        }
        group.settlements.push(entry);
        return entry;
      });
      return SettlementList.parse({
        ...ledgerTotals(entries),
        shops: [...groups.values()].map((g) => ({ ...g, ...ledgerTotals(g.settlements) })),
      });
    },
    async markPaid(id: string, proofPath?: string) {
      const current = await read(id);
      if (current.entry.status === "paid") return { settlement: current.entry, changed: false };
      // completed is terminal in transition(). Its eligibility cannot be reversed by another action.
      // A conditional single-row update chooses one winner and keeps its timestamp/proof on replay.
      const r = await db
        .from("settlements")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          ...(proofPath === undefined ? {} : { proof_path: proofPath }),
        })
        .eq("id", id)
        .eq("status", "pending")
        .eq("shop_id", current.entry.shopId)
        .eq("amount_satang", current.entry.amountSatang)
        .select(selection)
        .maybeSingle();
      if (r.error) throw new ApiError("INTERNAL", 500);
      if (r.data) return { settlement: present(r.data).entry, changed: true };
      const latest = await read(id);
      if (latest.entry.status !== "paid") throw new ApiError("ORDER_INVALID_TRANSITION", 409);
      return { settlement: latest.entry, changed: false };
    },
  };
}

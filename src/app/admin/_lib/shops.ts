import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/db/server";
import { ApiError } from "@/lib/errors";
import { AdminShop, type AdminShopList } from "./types";

const selection =
  "id,name,phone,address,status,created_at,shop_pricing_rules(id),shop_hours(weekday)";
const rawShop = z.object({
  id: z.uuid(),
  name: z.string(),
  phone: z.string(),
  address: z.string(),
  status: z.enum(["pending", "active", "suspended"]),
  created_at: z.string(),
  shop_pricing_rules: z.array(z.object({ id: z.uuid() })),
  shop_hours: z.array(z.object({ weekday: z.number().int().min(0).max(6) })),
});
export function presentAdminShop(value: unknown): AdminShop {
  const result = rawShop.safeParse(value);
  if (!result.success) throw new ApiError("INTERNAL", 500);
  const row = result.data;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    status: row.status,
    createdAt: row.created_at,
    hasPricing: row.shop_pricing_rules.length > 0,
    hasHours: new Set(row.shop_hours.map((h) => h.weekday)).size === 7,
  };
}

export function createAdminShopsService(db: SupabaseClient = getServiceClient()) {
  async function read(id: string): Promise<AdminShop> {
    const { data, error } = await db.from("shops").select(selection).eq("id", id).maybeSingle();
    if (error) throw new ApiError("INTERNAL", 500);
    if (!data) throw new ApiError("NOT_FOUND", 404);
    return presentAdminShop(data);
  }
  return {
    async list(): Promise<AdminShopList> {
      // Stable pages avoid PostgREST's default row limit, no per-shop N+1 queries.
      const shops: AdminShop[] = [];
      for (let offset = 0; ; offset += 200) {
        const { data, error } = await db
          .from("shops")
          .select(selection)
          .order("id", { ascending: true })
          .range(offset, offset + 199);
        if (error || !data) throw new ApiError("INTERNAL", 500);
        shops.push(...data.map(presentAdminShop));
        if (data.length < 200) break;
      }
      const { count, error } = await db
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_review");
      if (error || count === null || count === undefined) throw new ApiError("INTERNAL", 500);
      const priority = { pending: 0, active: 1, suspended: 2 };
      shops.sort(
        (a, b) =>
          priority[a.status] - priority[b.status] ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.name.localeCompare(b.name, "th") ||
          a.id.localeCompare(b.id),
      );
      return {
        shops,
        pendingShopCount: shops.filter((s) => s.status === "pending").length,
        pendingPaymentCount: count,
      };
    },
    async change(id: string, action: "approve" | "suspend"): Promise<AdminShop> {
      const shop = await read(id);
      const target = action === "approve" ? "active" : "suspended";
      if (shop.status === target) return shop; // replay is harmless
      if (action === "approve" && shop.status !== "pending")
        throw new ApiError(
          "VALIDATION_ERROR",
          422,
          "อนุมัติได้เฉพาะร้านที่รออนุมัติ กรุณาตรวจสอบสถานะล่าสุด",
        );
      const { data, error } = await db
        .from("shops")
        .update({ status: target })
        .eq("id", id)
        .eq("status", shop.status)
        .select("id")
        .maybeSingle();
      if (error) throw new ApiError("INTERNAL", 500);
      const latest = await read(id);
      if (!data && latest.status !== target)
        throw new ApiError("VALIDATION_ERROR", 422, "สถานะร้านเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่");
      return latest;
    },
  };
}

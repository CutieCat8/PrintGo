import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DeliveryRow,
  OrderFileRow,
  OrderServiceRow,
  parseRow,
  PaymentRow,
  ShopRow,
  type OrderRow,
} from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import type { DetailParts } from "./view";

/** Loads everything an `OrderDetail` shows besides the order row itself. */
export async function loadDetailParts(db: SupabaseClient, row: OrderRow): Promise<DetailParts> {
  const shopRes = await db.from("shops").select("*").eq("id", row.shopId).maybeSingle();
  if (shopRes.error || !shopRes.data) throw shopRes.error ?? new ApiError("INTERNAL", 500);
  const shop = parseRow(ShopRow, shopRes.data);

  const [files, services, payments, delivery] = await Promise.all([
    db.from("order_files").select("*").eq("order_id", row.id).is("deleted_at", null),
    db.from("order_services").select("*").eq("order_id", row.id),
    db
      .from("payments")
      .select("*")
      .eq("order_id", row.id)
      .order("created_at", { ascending: false })
      .limit(1),
    db.from("deliveries").select("*").eq("order_id", row.id).maybeSingle(),
  ]);
  for (const res of [files, services, payments, delivery]) if (res.error) throw res.error;

  return {
    shop: { id: shop.id, name: shop.name, address: shop.address, phone: shop.phone },
    files: (files.data ?? []).map((r) => parseRow(OrderFileRow, r)),
    services: (services.data ?? []).map((r) => parseRow(OrderServiceRow, r)),
    payment: payments.data?.[0] ? parseRow(PaymentRow, payments.data[0]) : null,
    delivery: delivery.data ? parseRow(DeliveryRow, delivery.data) : null,
  };
}

import { getServiceClient } from "@/lib/db/server";
import { parseRow, ShopService, ShopServiceRow } from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import {
  MAX_SERVICES_PER_SHOP,
  type ServiceCreateBody,
  type ServiceUpdateBody,
} from "./settingsSchemas";

// The shop's extra services (D22). `shopId` is the session's shop; another shop's service is a 404.

const present = (row: unknown) =>
  ShopService.parse(parseRow(ShopServiceRow, row as Record<string, unknown>));

/** All of the shop's services, active and inactive, in the order the shop set. */
export async function listServices(shopId: string): Promise<ShopService[]> {
  const { data, error } = await getServiceClient()
    .from("shop_services")
    .select("*")
    .eq("shop_id", shopId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(present);
}

export async function createService(shopId: string, body: ServiceCreateBody): Promise<ShopService> {
  const db = getServiceClient();
  const existing = await db.from("shop_services").select("id, sort_order").eq("shop_id", shopId);
  if (existing.error) throw existing.error;
  const count = (existing.data ?? []).length;
  const nextOrder = Math.max(-1, ...(existing.data ?? []).map((r) => r.sort_order as number)) + 1;
  if (count >= MAX_SERVICES_PER_SHOP) {
    throw new ApiError(
      "VALIDATION_ERROR",
      422,
      `เพิ่มบริการได้ไม่เกิน ${MAX_SERVICES_PER_SHOP} รายการ`,
    );
  }

  const { data, error } = await db
    .from("shop_services")
    .insert({
      shop_id: shopId,
      name: body.name,
      price_satang: body.priceSatang,
      unit: body.unit,
      is_active: true,
      sort_order: nextOrder, // appended at the end, never equal to an existing one
    })
    .select()
    .single();
  if (error || !data) {
    console.error(`[services] create failed for shop ${shopId} (db code ${error?.code})`);
    throw new ApiError("INTERNAL", 500);
  }
  return present(data);
}

export async function updateService(
  shopId: string,
  serviceId: string,
  body: ServiceUpdateBody,
): Promise<ShopService> {
  const { data, error } = await getServiceClient()
    .from("shop_services")
    .update({
      name: body.name,
      price_satang: body.priceSatang,
      unit: body.unit,
      is_active: body.isActive,
      sort_order: body.sortOrder,
    })
    .eq("id", serviceId)
    .eq("shop_id", shopId)
    .select()
    .maybeSingle();
  if (error) {
    console.error(`[services] update failed for shop ${shopId} (db code ${error.code})`);
    throw new ApiError("INTERNAL", 500);
  }
  if (!data) throw new ApiError("NOT_FOUND", 404);
  return present(data);
}

/** A real delete is fine: orders keep their own snapshot of the service. */
export async function deleteService(shopId: string, serviceId: string): Promise<{ ok: true }> {
  const { data, error } = await getServiceClient()
    .from("shop_services")
    .delete()
    .eq("id", serviceId)
    .eq("shop_id", shopId)
    .select("id");
  if (error) {
    console.error(`[services] delete failed for shop ${shopId} (db code ${error.code})`);
    throw new ApiError("INTERNAL", 500);
  }
  if ((data ?? []).length === 0) throw new ApiError("NOT_FOUND", 404);
  return { ok: true };
}

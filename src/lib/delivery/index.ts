import "server-only";
import { fromDb, toDb } from "@/lib/db/case";
import { getServiceClient } from "@/lib/db/server";
import type { Delivery, DeliveryStatus } from "@/lib/db/types";
import { getGrabProvider } from "./grab";
import { manualProvider } from "./manual";
import type { DeliveryProvider, LatLng } from "./types";

export type { LatLng } from "./types";

/**
 * Z7. Signatures are fixed by docs/CONTRACTS.md section 7. The state change after an admin update
 * Manual updates use the order transition boundary. Grab's existing webhook path is separate.
 */

/** `DELIVERY_PROVIDER` picks the provider; `grab` needs its credentials, otherwise it throws. */
export function getDeliveryProvider(): DeliveryProvider {
  const name = process.env.DELIVERY_PROVIDER || "manual";
  if (name === "manual") return manualProvider;
  if (name === "grab") return getGrabProvider();
  throw new Error(`DELIVERY_PROVIDER "${name}" is not supported`);
}

const DELIVERY_COLUMNS = "id, provider, status, fee_satang, tracking_url, note, updated_at";

async function shopLocation(
  shopId: string,
): Promise<LatLng & { address: string; name: string; phone: string }> {
  const { data, error } = await getServiceClient()
    .from("shops")
    .select("lat, lng, address, name, phone")
    .eq("id", shopId)
    .single();
  if (error) throw error;
  return data;
}

export async function quoteDelivery(
  shopId: string,
  dropoff: LatLng,
): Promise<{ feeSatang: number; estimated: boolean }> {
  const pickup = await shopLocation(shopId);
  const { feeSatang, estimated } = await getDeliveryProvider().getQuote({ pickup, dropoff });
  return { feeSatang, estimated };
}

/** Called by `transition` when an order enters `courier_requested`. Safe to call twice. */
export async function createDeliveryForOrder(orderId: string): Promise<Delivery> {
  const db = getServiceClient();
  const existing = await db
    .from("deliveries")
    .select(DELIVERY_COLUMNS)
    .eq("order_id", orderId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return fromDb(existing.data) as Delivery;

  const { data: order, error } = await db
    .from("orders")
    .select(
      "shop_id, delivery_address, delivery_lat, delivery_lng, delivery_recipient_name, delivery_recipient_phone",
    )
    .eq("id", orderId)
    .single();
  if (error) throw error;
  if (order.delivery_lat === null || order.delivery_lng === null) {
    throw new Error(`Order ${orderId} has no delivery destination`);
  }

  const provider = getDeliveryProvider();
  const result = await provider.create({
    orderId,
    pickup: await shopLocation(order.shop_id),
    dropoff: {
      lat: order.delivery_lat,
      lng: order.delivery_lng,
      address: order.delivery_address,
      name: order.delivery_recipient_name,
      phone: order.delivery_recipient_phone,
    },
  });

  const inserted = await db
    .from("deliveries")
    .insert(
      toDb({
        orderId,
        provider: provider.name,
        providerRef: result.providerRef,
        status: result.status,
      }),
    )
    .select(DELIVERY_COLUMNS)
    .single();
  if (inserted.error) throw inserted.error;
  return fromDb(inserted.data) as Delivery;
}

/** Called by the admin page after the admin has booked the rider by hand. */
export async function applyDeliveryUpdate(
  orderId: string,
  update: { status: DeliveryStatus; feeSatang?: number; trackingUrl?: string; note?: string },
): Promise<Delivery> {
  const current = await getServiceClient()
    .from("deliveries")
    .select("provider")
    .eq("order_id", orderId)
    .maybeSingle();
  if (current.error) throw current.error;
  if (current.data?.provider === "manual") {
    const { transitionManualDelivery } = await import("@/lib/domain/orders/transition");
    return transitionManualDelivery(orderId, update);
  }
  const { data, error } = await getServiceClient()
    .from("deliveries")
    .update(toDb(update))
    .eq("order_id", orderId)
    .select(DELIVERY_COLUMNS)
    .single();
  if (error) throw error;
  return fromDb(data) as Delivery;
}

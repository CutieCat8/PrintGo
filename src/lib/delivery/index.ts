import type { Delivery, DeliveryStatus } from "@/lib/db/types";

/**
 * STUBS. Task Z7 replaces the bodies (ManualProvider, later Grab); signatures are fixed by
 * docs/CONTRACTS.md section 7. They exist now so that the state machine (P2), the estimate (P5)
 * and the admin delivery page (A7) can call them today.
 */
export type LatLng = { lat: number; lng: number };

/** Flat base fee only; Z7 adds the per-km part (O5: sample numbers, not real Grab prices). */
export async function quoteDelivery(
  _shopId: string,
  _dropoff: LatLng,
): Promise<{ feeSatang: number; estimated: boolean }> {
  return { feeSatang: Number(process.env.DELIVERY_BASE_SATANG ?? 4000), estimated: true };
}

/** Called by `transition` when an order enters `courier_requested`. */
export async function createDeliveryForOrder(orderId: string): Promise<Delivery> {
  console.info(`[delivery stub] create delivery for order ${orderId}`);
  return stubDelivery("pending_admin");
}

/** Called by the admin page after the admin has booked the rider by hand. */
export async function applyDeliveryUpdate(
  orderId: string,
  update: { status: DeliveryStatus; feeSatang?: number; trackingUrl?: string; note?: string },
): Promise<Delivery> {
  console.info(`[delivery stub] ${update.status} for order ${orderId}`);
  return stubDelivery(update.status, update);
}

function stubDelivery(
  status: DeliveryStatus,
  extra: { feeSatang?: number; trackingUrl?: string; note?: string } = {},
): Delivery {
  return {
    id: crypto.randomUUID(),
    provider: "manual",
    status,
    feeSatang: extra.feeSatang ?? null,
    trackingUrl: extra.trackingUrl ?? null,
    note: extra.note ?? null,
    updatedAt: new Date().toISOString(),
  };
}

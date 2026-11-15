import { z } from "zod";
import { Delivery, OrderStatus } from "@/lib/db/types";
const amount = z.number().int().nonnegative().safe();
export const DeliveryQueue = z.object({
  deliveries: z.array(
    z.object({
      id: z.uuid(),
      orderNo: z.string(),
      status: OrderStatus,
      shop: z.object({ name: z.string(), address: z.string(), phone: z.string() }),
      address: z.string().nullable(),
      recipientName: z.string().nullable(),
      recipientPhone: z.string().nullable(),
      lat: z.number().min(-90).max(90).nullable(),
      lng: z.number().min(-180).max(180).nullable(),
      estimatedFeeSatang: amount,
      delivery: Delivery,
    }),
  ),
});
export type DeliveryQueue = z.infer<typeof DeliveryQueue>;
export const AdminOverview = z.object({
  ordersToday: amount,
  completedToday: amount,
  platformFeeTodaySatang: amount,
  platformFeeTotalSatang: amount,
});
export function mapUrl(lat: number | null, lng: number | null) {
  if (
    lat === null ||
    lng === null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    return null;
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: `${lat},${lng}` })}`;
}

import { z } from "zod";
import { ShopStatus } from "@/lib/db/types";

// Admin response shapes are local to Arm (CONTRACTS 6.4).
export const AdminShop = z.object({
  id: z.uuid(),
  name: z.string(),
  phone: z.string(),
  address: z.string(),
  status: ShopStatus,
  createdAt: z.string(),
  hasPricing: z.boolean(),
  hasHours: z.boolean(),
});
export type AdminShop = z.infer<typeof AdminShop>;
export const AdminShopList = z.object({
  shops: z.array(AdminShop),
  pendingShopCount: z.number().int().nonnegative(),
  pendingPaymentCount: z.number().int().nonnegative(),
});
export type AdminShopList = z.infer<typeof AdminShopList>;

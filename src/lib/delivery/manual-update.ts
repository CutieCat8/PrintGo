import { z } from "zod";

export const ManualDeliveryUpdate = z
  .object({
    status: z.enum(["booked", "in_transit", "delivered", "failed"]),
    feeSatang: z.number().int().min(0).max(2147483647).optional(),
    trackingUrl: z
      .string()
      .trim()
      .max(2000)
      .url()
      .refine((s) => {
        if (!URL.canParse(s)) return false;
        const u = new URL(s);
        return u.protocol === "https:" && !u.username && !u.password;
      })
      .optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type ManualDeliveryUpdate = z.infer<typeof ManualDeliveryUpdate>;

/** No amount is copied into the customer's confirmed price by this operation. */
export function manualOrderTarget(status: ManualDeliveryUpdate["status"]) {
  return status === "in_transit" ? "in_transit" : status === "delivered" ? "completed" : null;
}

import { z } from "zod";

export const LedgerStatus = z.enum(["pending", "paid"]);
export const LedgerFilter = z.enum(["pending", "paid", "all"]);
export type LedgerFilter = z.infer<typeof LedgerFilter>;
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const SettlementEntry = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  orderNo: z.string(),
  shopId: z.uuid(),
  amountSatang: money,
  status: LedgerStatus,
  paidAt: z.string().nullable(),
  createdAt: z.string(),
  proofPath: z.string().nullable(),
});
export type SettlementEntry = z.infer<typeof SettlementEntry>;
export const SettlementGroup = z.object({
  shopId: z.uuid(),
  name: z.string(),
  phone: z.string(),
  pendingSatang: money,
  paidSatang: money,
  settlements: z.array(SettlementEntry),
});
export const SettlementList = z.object({
  shops: z.array(SettlementGroup),
  pendingSatang: money,
  paidSatang: money,
});
export const RefundEntry = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  orderNo: z.string(),
  customerName: z.string(),
  amountSatang: money,
  reason: z.string(),
  status: LedgerStatus,
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});
export type RefundEntry = z.infer<typeof RefundEntry>;
export const RefundList = z.object({
  refunds: z.array(RefundEntry),
  pendingSatang: money,
  paidSatang: money,
});
const proofPath = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) =>
      !/[\\:?#\u0000-\u001f\u007f]/.test(value) &&
      value.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
    "พาธหลักฐานไม่ถูกต้อง",
  );
export const MarkSettlementPaid = z.object({ proofPath: proofPath.optional() }).strict();

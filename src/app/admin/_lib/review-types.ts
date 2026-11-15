import { z } from "zod";
import { Order, OrderDetail, OrderStatus, PaymentStatus } from "@/lib/db/types";
export const ReviewPayment = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  orderNo: z.string(),
  orderStatus: OrderStatus,
  amountSatang: z.number().int().positive(),
  expectedAmountSatang: z.number().int().positive().nullable(),
  status: PaymentStatus,
  rejectReason: z.string().nullable(),
  createdAt: z.string(),
  paymentDeadline: z.string().nullable(),
  slipUrl: z.string().nullable(),
});
export type ReviewPayment = z.infer<typeof ReviewPayment>;
export const ReviewPayments = z.object({ payments: z.array(ReviewPayment) });
export const AdminOrders = z.object({
  orders: z.array(Order.extend({ pendingReview: z.boolean() })),
});
export { OrderDetail };

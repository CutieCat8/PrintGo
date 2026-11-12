import { z } from "zod";
import { ApiError } from "@/lib/errors";
export type PaymentRouteContext = { params: Promise<{ orderId: string }> };
export async function paymentOrderId(ctx: PaymentRouteContext): Promise<string> {
  const parsed = z.uuid().safeParse((await ctx.params).orderId);
  if (!parsed.success) throw new ApiError("NOT_FOUND", 404);
  return parsed.data;
}
export async function paymentBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", 422);
  }
}

import { z } from "zod";
import { requireCustomer } from "@/lib/auth";
import { cancelCustomerOrder } from "@/lib/domain/orders/customer";
import { ApiError, handle } from "@/lib/errors";

/** POST /api/liff/orders/:id/cancel: only before payment (D19). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { customerId } = await requireCustomer(req);
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) throw new ApiError("NOT_FOUND", 404);
  return Response.json(await cancelCustomerOrder(customerId, id.data));
});

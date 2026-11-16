import { z } from "zod";
import { requireCustomer } from "@/lib/auth";
import { receiveCustomerOrder } from "@/lib/domain/orders/customer";
import { ApiError, handle } from "@/lib/errors";

/** POST /api/liff/orders/:id/receive: the customer confirms a pickup order was handed over. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { customerId } = await requireCustomer(req);
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) throw new ApiError("NOT_FOUND", 404);
  return Response.json(await receiveCustomerOrder(customerId, id.data));
});

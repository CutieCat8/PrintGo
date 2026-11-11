import { z } from "zod";
import { requireCustomer } from "@/lib/auth";
import { getCustomerOrderDetail } from "@/lib/domain/orders/customer";
import { ApiError, handle } from "@/lib/errors";

/** GET /api/liff/orders/:id: OrderDetail. Someone else's order is a 404. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { customerId } = await requireCustomer(req);
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) throw new ApiError("NOT_FOUND", 404);
  return Response.json(await getCustomerOrderDetail(customerId, id.data));
});

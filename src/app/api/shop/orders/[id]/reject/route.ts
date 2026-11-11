import { requireShop } from "@/lib/auth";
import { orderIdFrom, readJsonBody, type OrderRouteContext } from "@/lib/domain/orders/http";
import { rejectOrder } from "@/lib/domain/orders/shop";
import { handle } from "@/lib/errors";

/** POST /api/shop/orders/:id/reject {reason}. */
export const POST = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { shopId } = await requireShop(req);
  const orderId = await orderIdFrom(ctx);
  return Response.json(await rejectOrder(shopId, orderId, await readJsonBody(req)));
});

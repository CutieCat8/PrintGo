import { requireShop } from "@/lib/auth";
import { orderIdFrom, readJsonBody, type OrderRouteContext } from "@/lib/domain/orders/http";
import { confirmOrder } from "@/lib/domain/orders/shop";
import { handle } from "@/lib/errors";

/** POST /api/shop/orders/:id/confirm: quote the order (price and ready time). */
export const POST = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { shopId } = await requireShop(req);
  const orderId = await orderIdFrom(ctx);
  return Response.json(await confirmOrder(shopId, orderId, await readJsonBody(req)));
});

import { requireShop } from "@/lib/auth";
import { orderIdFrom, type OrderRouteContext } from "@/lib/domain/orders/http";
import { markReady } from "@/lib/domain/orders/shop";
import { handle } from "@/lib/errors";

/** POST /api/shop/orders/:id/mark-ready: printing -> ready (a delivery order then goes on to the courier step). */
export const POST = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { shopId } = await requireShop(req);
  return Response.json(await markReady(shopId, await orderIdFrom(ctx)));
});

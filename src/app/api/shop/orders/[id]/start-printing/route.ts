import { requireShop } from "@/lib/auth";
import { orderIdFrom, type OrderRouteContext } from "@/lib/domain/orders/http";
import { startPrinting } from "@/lib/domain/orders/shop";
import { handle } from "@/lib/errors";

/** POST /api/shop/orders/:id/start-printing: paid -> printing. */
export const POST = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { shopId } = await requireShop(req);
  return Response.json(await startPrinting(shopId, await orderIdFrom(ctx)));
});

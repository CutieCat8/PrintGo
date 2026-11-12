import { requireShop } from "@/lib/auth";
import { orderIdFrom, type OrderRouteContext } from "@/lib/domain/orders/http";
import { getShopOrderDetail } from "@/lib/domain/orders/shop";
import { handle } from "@/lib/errors";

/** GET /api/shop/orders/:id: OrderDetail without the pickup code and the recipient's name/phone. */
export const GET = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { shopId } = await requireShop(req);
  return Response.json(await getShopOrderDetail(shopId, await orderIdFrom(ctx)));
});

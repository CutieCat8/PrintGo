import { requireShop } from "@/lib/auth";
import { orderIdFrom, type OrderRouteContext } from "@/lib/domain/orders/http";
import { handOverPickup } from "@/lib/domain/orders/shop";
import { handle } from "@/lib/errors";

/** POST /api/shop/orders/:id/handover: the shop hands a pickup order over; the customer then confirms. */
export const POST = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { shopId } = await requireShop(req);
  const orderId = await orderIdFrom(ctx);
  return Response.json(await handOverPickup(shopId, orderId));
});

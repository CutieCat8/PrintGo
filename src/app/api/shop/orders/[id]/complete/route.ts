import { requireShop } from "@/lib/auth";
import { orderIdFrom, readJsonBody, type OrderRouteContext } from "@/lib/domain/orders/http";
import { completePickup } from "@/lib/domain/orders/shop";
import { handle } from "@/lib/errors";

/** POST /api/shop/orders/:id/complete {pickupCode}: hand over a pickup order. */
export const POST = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { shopId } = await requireShop(req);
  const orderId = await orderIdFrom(ctx);
  return Response.json(await completePickup(shopId, orderId, await readJsonBody(req)));
});

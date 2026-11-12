import { requireShop } from "@/lib/auth";
import { orderIdFrom, readJsonBody, type OrderRouteContext } from "@/lib/domain/orders/http";
import { changeEta } from "@/lib/domain/orders/shop";
import { handle } from "@/lib/errors";

/** POST /api/shop/orders/:id/eta: change the ready time of a paid or printing order (D19). */
export const POST = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { shopId } = await requireShop(req);
  const orderId = await orderIdFrom(ctx);
  return Response.json(await changeEta(shopId, orderId, await readJsonBody(req)));
});

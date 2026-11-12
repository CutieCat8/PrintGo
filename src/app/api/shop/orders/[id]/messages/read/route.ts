import { requireShop } from "@/lib/auth";
import { markRead } from "@/lib/domain/chat/messages";
import { idFrom, type OrderRouteContext } from "@/lib/domain/orders/http";
import { handle } from "@/lib/errors";

/** POST /api/shop/orders/:id/messages/read: marks the customer's messages as read. */
export const POST = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { shopId } = await requireShop(req);
  return Response.json(await markRead({ side: "shop", shopId }, await idFrom(ctx)));
});

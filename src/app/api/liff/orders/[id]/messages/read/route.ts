import { requireCustomer } from "@/lib/auth";
import { markRead } from "@/lib/domain/chat/messages";
import { idFrom, type OrderRouteContext } from "@/lib/domain/orders/http";
import { handle } from "@/lib/errors";

/** POST /api/liff/orders/:id/messages/read: marks the shop's messages as read. */
export const POST = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { customerId } = await requireCustomer(req);
  return Response.json(await markRead({ side: "customer", customerId }, await idFrom(ctx)));
});

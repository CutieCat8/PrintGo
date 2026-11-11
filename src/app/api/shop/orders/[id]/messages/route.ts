import { requireShop } from "@/lib/auth";
import { listMessages, sendMessage } from "@/lib/domain/chat/messages";
import { idFrom, readJsonBody, type OrderRouteContext } from "@/lib/domain/orders/http";
import { handle } from "@/lib/errors";

/** GET /api/shop/orders/:id/messages?after=: the room of one of my orders, oldest first (max 100). */
export const GET = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { shopId } = await requireShop(req);
  const orderId = await idFrom(ctx);
  const after = new URL(req.url).searchParams.get("after");
  return Response.json(await listMessages({ side: "shop", shopId }, orderId, after));
});

/** POST /api/shop/orders/:id/messages {body}: the sender is always the logged-in shop. */
export const POST = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { shopId } = await requireShop(req);
  const orderId = await idFrom(ctx);
  return Response.json(
    await sendMessage({ side: "shop", shopId }, orderId, await readJsonBody(req)),
  );
});

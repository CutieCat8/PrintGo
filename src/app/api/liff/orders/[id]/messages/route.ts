import { requireCustomer } from "@/lib/auth";
import { listMessages, sendMessage } from "@/lib/domain/chat/messages";
import { idFrom, readJsonBody, type OrderRouteContext } from "@/lib/domain/orders/http";
import { handle } from "@/lib/errors";

/** GET /api/liff/orders/:id/messages?after=: the room of my order, oldest first (max 100). */
export const GET = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { customerId } = await requireCustomer(req);
  const orderId = await idFrom(ctx);
  const after = new URL(req.url).searchParams.get("after");
  return Response.json(await listMessages({ side: "customer", customerId }, orderId, after));
});

/** POST /api/liff/orders/:id/messages {body}: the sender is always the logged-in customer. */
export const POST = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { customerId } = await requireCustomer(req);
  const orderId = await idFrom(ctx);
  return Response.json(
    await sendMessage({ side: "customer", customerId }, orderId, await readJsonBody(req)),
  );
});

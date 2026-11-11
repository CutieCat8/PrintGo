import { requireShop } from "@/lib/auth";
import { unsubscribePush } from "@/lib/domain/chat/push";
import { PushUnsubscribeBody } from "@/lib/domain/chat/schemas";
import { readJsonBody } from "@/lib/domain/orders/http";
import { handle } from "@/lib/errors";

/** POST /api/shop/push/unsubscribe: removes only this shop's own subscription. */
export const POST = handle(async (req: Request) => {
  const { shopId } = await requireShop(req, { allowPending: true });
  const body = PushUnsubscribeBody.parse(await readJsonBody(req));
  return Response.json(await unsubscribePush(shopId, body.endpoint));
});

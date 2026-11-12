import { requireShop } from "@/lib/auth";
import { subscribePush } from "@/lib/domain/chat/push";
import { PushSubscribeBody } from "@/lib/domain/chat/schemas";
import { readJsonBody } from "@/lib/domain/orders/http";
import { handle } from "@/lib/errors";

/** POST /api/shop/push/subscribe: a pending shop may subscribe too (CONTRACTS 6.2). */
export const POST = handle(async (req: Request) => {
  const { shopId, authUserId } = await requireShop(req, { allowPending: true });
  const body = PushSubscribeBody.parse(await readJsonBody(req));
  return Response.json(
    await subscribePush(shopId, authUserId, body, req.headers.get("user-agent")),
  );
});

import { requireShop } from "@/lib/auth";
import { listChats } from "@/lib/domain/chat/chats";
import { handle } from "@/lib/errors";

/** GET /api/shop/chats: the chat rooms of my orders with unread counts. */
export const GET = handle(async (req: Request) => {
  const { shopId } = await requireShop(req);
  return Response.json(await listChats({ side: "shop", shopId }));
});

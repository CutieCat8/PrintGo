import { requireCustomer } from "@/lib/auth";
import { listChats } from "@/lib/domain/chat/chats";
import { handle } from "@/lib/errors";

/** GET /api/liff/chats: my chat rooms with unread counts. */
export const GET = handle(async (req: Request) => {
  const { customerId } = await requireCustomer(req);
  return Response.json(await listChats({ side: "customer", customerId }));
});

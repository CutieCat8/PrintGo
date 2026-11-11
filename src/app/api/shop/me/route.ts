import { requireAuthUser } from "@/lib/auth";
import { getShopMe } from "@/lib/domain/shops/register";
import { handle } from "@/lib/errors";

/** GET /api/shop/me (CONTRACTS 6.2): signed in with Supabase, no shop needed yet. */
export const GET = handle(async (req: Request) => {
  const { authUserId } = await requireAuthUser(req);
  return Response.json(await getShopMe(authUserId));
});

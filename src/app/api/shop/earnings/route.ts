import { requireShop } from "@/lib/auth";
import { getShopEarnings } from "@/lib/domain/shops/earnings";
import { handle } from "@/lib/errors";

/** GET /api/shop/earnings: today's earnings and what is still to be transferred to this shop. */
export const GET = handle(async (req: Request) => {
  const { shopId } = await requireShop(req);
  return Response.json(await getShopEarnings(shopId));
});

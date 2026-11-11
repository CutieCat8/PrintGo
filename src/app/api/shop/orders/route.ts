import { requireShop } from "@/lib/auth";
import { listShopOrders } from "@/lib/domain/orders/shop";
import { handle } from "@/lib/errors";

/** GET /api/shop/orders?status=a,b (CONTRACTS 6.2): the shop's own orders. */
export const GET = handle(async (req: Request) => {
  const { shopId } = await requireShop(req);
  return Response.json(await listShopOrders(shopId, new URL(req.url).searchParams.get("status")));
});

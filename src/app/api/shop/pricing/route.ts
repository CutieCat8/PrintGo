import { requireShop } from "@/lib/auth";
import { readJsonBody } from "@/lib/domain/orders/http";
import { getPricing, putPricing } from "@/lib/domain/shops/settings";
import { PricingBody } from "@/lib/domain/shops/settingsSchemas";
import { handle } from "@/lib/errors";

/** GET /api/shop/pricing: price list and volume-discount tiers (empty until set). */
export const GET = handle(async (req: Request) => {
  const { shopId } = await requireShop(req, { allowPending: true });
  return Response.json(await getPricing(shopId));
});

/** PUT /api/shop/pricing: replaces the whole list. Customers see the result at once. */
export const PUT = handle(async (req: Request) => {
  const { shopId } = await requireShop(req, { allowPending: true });
  const body = PricingBody.parse(await readJsonBody(req));
  return Response.json(await putPricing(shopId, body));
});

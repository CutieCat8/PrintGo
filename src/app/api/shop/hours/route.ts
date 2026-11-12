import { requireShop } from "@/lib/auth";
import { readJsonBody } from "@/lib/domain/orders/http";
import { getHours, putHours } from "@/lib/domain/shops/settings";
import { HoursBody } from "@/lib/domain/shops/settingsSchemas";
import { handle } from "@/lib/errors";

/** GET /api/shop/hours: what the shop saved (empty until it sets them). */
export const GET = handle(async (req: Request) => {
  const { shopId } = await requireShop(req, { allowPending: true });
  return Response.json(await getHours(shopId));
});

/** PUT /api/shop/hours: all 7 days, replaced in one statement. */
export const PUT = handle(async (req: Request) => {
  const { shopId } = await requireShop(req, { allowPending: true });
  const body = HoursBody.parse(await readJsonBody(req));
  return Response.json(await putHours(shopId, body));
});

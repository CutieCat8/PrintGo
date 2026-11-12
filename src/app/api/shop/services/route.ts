import { requireShop } from "@/lib/auth";
import { readJsonBody } from "@/lib/domain/orders/http";
import { createService, listServices } from "@/lib/domain/shops/services";
import { ServiceCreateBody } from "@/lib/domain/shops/settingsSchemas";
import { handle } from "@/lib/errors";

/** GET /api/shop/services: all of the shop's services, active or not (D22). */
export const GET = handle(async (req: Request) => {
  const { shopId } = await requireShop(req, { allowPending: true });
  return Response.json(await listServices(shopId));
});

/** POST /api/shop/services: at most 20 per shop. */
export const POST = handle(async (req: Request) => {
  const { shopId } = await requireShop(req, { allowPending: true });
  const body = ServiceCreateBody.parse(await readJsonBody(req));
  return Response.json(await createService(shopId, body));
});

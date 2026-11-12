import { requireShop } from "@/lib/auth";
import { idFrom, readJsonBody, type OrderRouteContext } from "@/lib/domain/orders/http";
import { deleteService, updateService } from "@/lib/domain/shops/services";
import { ServiceUpdateBody } from "@/lib/domain/shops/settingsSchemas";
import { handle } from "@/lib/errors";

/** PUT /api/shop/services/:id: another shop's service is a 404. */
export const PUT = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { shopId } = await requireShop(req, { allowPending: true });
  const serviceId = await idFrom(ctx);
  const body = ServiceUpdateBody.parse(await readJsonBody(req));
  return Response.json(await updateService(shopId, serviceId, body));
});

/** DELETE /api/shop/services/:id: a real delete (orders keep a snapshot). */
export const DELETE = handle(async (req: Request, ctx: OrderRouteContext) => {
  const { shopId } = await requireShop(req, { allowPending: true });
  return Response.json(await deleteService(shopId, await idFrom(ctx)));
});

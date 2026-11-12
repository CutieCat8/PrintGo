import { requireAuthUser } from "@/lib/auth";
import { readJsonBody } from "@/lib/domain/orders/http";
import { registerShop } from "@/lib/domain/shops/register";
import { RegisterBody } from "@/lib/domain/shops/settingsSchemas";
import { handle } from "@/lib/errors";

/** POST /api/shop/register (D23): any signed-in person can open a `pending` shop, once. */
export const POST = handle(async (req: Request) => {
  const { authUserId } = await requireAuthUser(req);
  const body = RegisterBody.parse(await readJsonBody(req));
  return Response.json(await registerShop(authUserId, body));
});

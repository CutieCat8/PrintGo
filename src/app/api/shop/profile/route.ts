import { requireShop } from "@/lib/auth";
import { readJsonBody } from "@/lib/domain/orders/http";
import { getProfile, updateProfile } from "@/lib/domain/shops/settings";
import { ProfileBody } from "@/lib/domain/shops/settingsSchemas";
import { handle } from "@/lib/errors";

// A shop that waits for approval may set itself up (CONTRACTS 6.2), hence allowPending.

/** GET /api/shop/profile */
export const GET = handle(async (req: Request) => {
  const { shopId } = await requireShop(req, { allowPending: true });
  return Response.json(await getProfile(shopId));
});

/** PUT /api/shop/profile: never changes the approval status. */
export const PUT = handle(async (req: Request) => {
  const { shopId } = await requireShop(req, { allowPending: true });
  const body = ProfileBody.parse(await readJsonBody(req));
  return Response.json(await updateProfile(shopId, body));
});

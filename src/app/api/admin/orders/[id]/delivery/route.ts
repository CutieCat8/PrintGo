import { requireAdmin } from "@/lib/auth";
import { ApiError, handle } from "@/lib/errors";
import { applyDeliveryUpdate } from "@/lib/delivery";
import { getServiceClient } from "@/lib/db/server";
import { ManualDeliveryUpdate } from "@/lib/delivery/manual-update";
import {
  adminJson,
  adminShopId,
  assertAdminMutationOrigin,
  type AdminShopContext,
} from "@/app/admin/_lib/routes";
export const POST = handle(async (req: Request, ctx: AdminShopContext) => {
  await requireAdmin(req);
  assertAdminMutationOrigin(req);
  const id = await adminShopId(ctx);
  const input = ManualDeliveryUpdate.safeParse(await req.json().catch(() => null));
  if (!input.success) throw new ApiError("VALIDATION_ERROR", 422);
  const current = await getServiceClient()
    .from("deliveries")
    .select("provider")
    .eq("order_id", id)
    .maybeSingle();
  if (current.error) throw new ApiError("INTERNAL", 500);
  if (!current.data) throw new ApiError("NOT_FOUND", 404);
  if (current.data.provider !== "manual") throw new ApiError("ORDER_INVALID_TRANSITION", 409);
  return adminJson({ delivery: await applyDeliveryUpdate(id, input.data) });
});

import { requireAdmin } from "@/lib/auth";
import { ApiError, handle } from "@/lib/errors";
import { createAdminOperations, Cancellation } from "@/app/admin/_lib/operations";
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
  const parsed = Cancellation.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", 422);
  return adminJson(
    await createAdminOperations().cancel(id, parsed.data.reason, parsed.data.refundSatang),
  );
});

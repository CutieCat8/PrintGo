import { requireAdmin } from "@/lib/auth";
import { ApiError, handle } from "@/lib/errors";
import { createAdminOperations, Reason } from "@/app/admin/_lib/operations";
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
  const parsed = Reason.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", 422);
  return adminJson(await createAdminOperations().refund(id, parsed.data.reason));
});

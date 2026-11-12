import { requireAdmin } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { createAdminShopsService } from "@/app/admin/_lib/shops";
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
  return adminJson({ shop: await createAdminShopsService().change(id, "suspend") });
});

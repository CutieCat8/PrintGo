import { requireAdmin } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { createAdminOperations } from "@/app/admin/_lib/operations";
import { adminJson, adminShopId, type AdminShopContext } from "@/app/admin/_lib/routes";
export const GET = handle(async (req: Request, ctx: AdminShopContext) => {
  await requireAdmin(req);
  return adminJson(await createAdminOperations().detail(await adminShopId(ctx)));
});

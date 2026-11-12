import { requireAdmin } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { createAdminShopsService } from "@/app/admin/_lib/shops";
import { adminJson } from "@/app/admin/_lib/routes";
export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  return adminJson(await createAdminShopsService().list());
});

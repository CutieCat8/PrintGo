import { requireAdmin } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { loadOverview } from "@/app/admin/_lib/deliveries";
import { adminJson } from "@/app/admin/_lib/routes";
export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  return adminJson(await loadOverview());
});

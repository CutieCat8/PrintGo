import { requireAdmin } from "@/lib/auth";
import { ApiError, handle } from "@/lib/errors";
import { createAdminOperations, OrderFilter } from "@/app/admin/_lib/operations";
import { adminJson } from "@/app/admin/_lib/routes";
export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const q = url.searchParams.get("q") ?? "";
  if ((status && !OrderFilter.safeParse(status).success) || q.length > 100)
    throw new ApiError("VALIDATION_ERROR", 422);
  return adminJson(await createAdminOperations().orders(status, q));
});

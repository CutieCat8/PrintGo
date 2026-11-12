import { requireAdmin } from "@/lib/auth";
import { ApiError, handle } from "@/lib/errors";
import { createAdminOperations, PaymentFilter } from "@/app/admin/_lib/operations";
import { adminJson } from "@/app/admin/_lib/routes";
export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const url = new URL(req.url);
  const parsed = PaymentFilter.safeParse(url.searchParams.get("status") ?? "pending_review");
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", 422);
  return adminJson(await createAdminOperations().payments(parsed.data));
});

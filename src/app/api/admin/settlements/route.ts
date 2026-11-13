import { requireAdmin } from "@/lib/auth";
import { ApiError, handle } from "@/lib/errors";
import { createSettlementService } from "@/lib/payment/settlement";
import { LedgerFilter } from "@/lib/payment/ledger-types";
import { adminJson } from "@/app/admin/_lib/routes";
export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  const filter = LedgerFilter.safeParse(new URL(req.url).searchParams.get("status") || "pending");
  if (!filter.success) throw new ApiError("VALIDATION_ERROR", 422);
  return adminJson(await createSettlementService().list(filter.data));
});

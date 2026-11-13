import { requireAdmin } from "@/lib/auth";
import { ApiError, handle } from "@/lib/errors";
import { createSettlementService } from "@/lib/payment/settlement";
import { MarkSettlementPaid } from "@/lib/payment/ledger-types";
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
  const text = await req.text();
  let value: unknown = {};
  try {
    if (text.trim()) value = JSON.parse(text);
  } catch {
    throw new ApiError("VALIDATION_ERROR", 422);
  }
  const parsed = MarkSettlementPaid.safeParse(value);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", 422);
  return adminJson(await createSettlementService().markPaid(id, parsed.data.proofPath));
});

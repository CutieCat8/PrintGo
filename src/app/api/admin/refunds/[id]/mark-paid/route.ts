import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ApiError, handle } from "@/lib/errors";
import { createRefundService } from "@/lib/payment/refund";
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
  const parsed = z.object({}).strict().safeParse(value);
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", 422);
  return adminJson(await createRefundService().markPaid(id));
});

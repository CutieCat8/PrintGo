import "server-only";
import { ApiError } from "@/lib/errors";
import { isPromptPayId } from "../promptpay";
import { manualReview } from "./manual";
import { verifyWithSlipOk } from "./slipok";
import { parseTimestamp, slipImageType, validateSlipInput } from "./validation";
import type { SlipContext, SlipResult, VerifySlipArgs } from "./types";

export type { SlipContext } from "./types";
export { mapSlipPersistenceError } from "./duplicates";

export async function verifySlip(
  args: VerifySlipArgs,
  context: SlipContext = {},
): Promise<SlipResult> {
  validateSlipInput(args);
  const imageType = slipImageType(args.slipBytes);
  if (!imageType) throw new ApiError("VALIDATION_ERROR", 422, "กรุณาส่งรูปสลิป JPEG หรือ PNG");
  const apiKey = process.env.SLIPOK_API_KEY?.trim();
  const branchId = process.env.SLIPOK_BRANCH_ID?.trim();
  const orderCreatedAt = parseTimestamp(context.orderCreatedAt);
  if (
    !apiKey ||
    !branchId ||
    !/^[0-9]+$/.test(branchId) ||
    !isPromptPayId(process.env.PLATFORM_PROMPTPAY_ID ?? "") ||
    orderCreatedAt === null ||
    orderCreatedAt > Date.now() ||
    context.branchReceiverConfirmed !== true
  )
    return manualReview();
  return verifyWithSlipOk(args, { apiKey, branchId, orderCreatedAt, imageType });
}

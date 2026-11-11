import "server-only";
import { ApiError } from "@/lib/errors";
import { createPromptPayCharge, isPromptPayId } from "./promptpay";
import type { PaymentProvider } from "./types";
import { verifySlip } from "./slip";
import type { SlipContext } from "./slip";

/** Reads env when used, so importing this module never requires credentials. */
export function getPaymentProvider(context: SlipContext = {}): PaymentProvider {
  const slipContext = { ...context };
  return {
    async createCharge({ orderId, amountSatang }) {
      if (typeof orderId !== "string" || orderId.trim().length === 0) {
        throw new ApiError("VALIDATION_ERROR", 422, "กรุณาระบุออเดอร์ที่ต้องการชำระ");
      }
      const promptPayId = process.env.PLATFORM_PROMPTPAY_ID ?? "";
      if (!isPromptPayId(promptPayId)) {
        // Never include the configured ID in errors or logs.
        throw new ApiError("INTERNAL", 500, "ระบบยังไม่พร้อมรับชำระเงิน กรุณาติดต่อผู้ดูแล");
      }
      return createPromptPayCharge(promptPayId, amountSatang);
    },
    verifySlip(args) {
      return verifySlip(args, slipContext);
    },
  };
}

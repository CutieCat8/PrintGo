import "server-only";
import { ApiError } from "@/lib/errors";
import { createPromptPayCharge, isPromptPayId } from "./promptpay";
import type { PaymentProvider } from "./types";

/** Reads env when used, so importing this module never requires credentials. */
export function getPaymentProvider(): PaymentProvider {
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
    async verifySlip(_args) {
      // A1 stub only. A2 supplies SlipOK/manual verification; never auto-verify.
      return { result: "review", reason: "ระบบตรวจสลิปยังไม่พร้อม กรุณารอเจ้าหน้าที่ตรวจสอบ" };
    },
  };
}

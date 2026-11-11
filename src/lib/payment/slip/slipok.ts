import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/errors";
import { manualReview } from "./manual";
import { parseAmountSatang, parseTimestamp } from "./validation";
import type { SlipResult, VerifySlipArgs } from "./types";

// SlipOK API v1.8: https://slipok.com/check-slip/ (checked 2026-11-11).
const verifiedResponse = z.object({
  code: z.never().optional(),
  success: z.literal(true),
  data: z.object({
    success: z.literal(true),
    transRef: z
      .string()
      .min(1)
      .max(25)
      .refine((value) => value.trim() === value),
    amount: z.union([z.string().max(32), z.number().finite()]),
    transTimestamp: z.string(),
    countryCode: z.literal("TH"),
    paidLocalCurrency: z.literal("764").optional(),
  }),
});

type SlipOkConfig = {
  apiKey: string;
  branchId: string;
  orderCreatedAt: number;
  imageType: "image/png" | "image/jpeg";
};

/** Config/context are checked by the selector; never log requests, images or responses. */
export async function verifyWithSlipOk(
  args: VerifySlipArgs,
  config: SlipOkConfig,
): Promise<SlipResult> {
  try {
    const form = new FormData();
    form.set(
      "files",
      new Blob([new Uint8Array(args.slipBytes)], { type: config.imageType }),
      config.imageType === "image/png" ? "slip.png" : "slip.jpg",
    );
    // Authorized by the user: provider checks the branch's configured receiver
    // and retains slip data. Never infer recipient identity from masked digits.
    form.set("log", "true");
    // Do not send a floating-point baht amount. Compare the returned decimal locally.
    const response = await fetch(`https://api.slipok.com/api/line/apikey/${config.branchId}`, {
      method: "POST",
      headers: { "x-authorization": config.apiKey },
      body: form,
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
      cache: "no-store",
    });
    const body: unknown = await response.json();
    if (response.status === 400) {
      const error = z.object({ code: z.number().int() }).safeParse(body);
      if (!error.success) return manualReview();
      if (error.data.code === 1012) throw new ApiError("PAYMENT_DUPLICATE_SLIP", 409);
      if (error.data.code === 1013)
        return { result: "rejected", reason: "ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องชำระ" };
      if (error.data.code === 1014)
        return { result: "rejected", reason: "บัญชีผู้รับเงินไม่ตรงกับบัญชี PrintGo" };
      if ([1005, 1006, 1007, 1008, 1011].includes(error.data.code))
        return { result: "rejected", reason: "ไม่สามารถยืนยันสลิปนี้ได้ กรุณาตรวจสอบรูปสลิป" };
      return manualReview(); // Includes provider/bank delays, quota, configuration errors.
    }
    if (response.status !== 200) return manualReview();
    const parsed = verifiedResponse.safeParse(body);
    if (!parsed.success) return manualReview();
    const { data } = parsed.data;
    const amount = parseAmountSatang(data.amount);
    const transferredAt = parseTimestamp(data.transTimestamp);
    if (amount === null || transferredAt === null) return manualReview();
    if (amount !== args.expectedAmountSatang)
      return { result: "rejected", reason: "ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องชำระ" };
    if (transferredAt < config.orderCreatedAt)
      return { result: "rejected", reason: "สลิปนี้โอนก่อนสร้างออเดอร์ กรุณาตรวจสอบสลิป" };
    if (transferredAt > Date.now()) return manualReview();
    return { result: "verified", slipRef: data.transRef };
  } catch (error) {
    if (error instanceof ApiError && error.code === "PAYMENT_DUPLICATE_SLIP") throw error;
    return manualReview(); // Timeout, network, malformed JSON, unknown errors: never verified.
  }
}

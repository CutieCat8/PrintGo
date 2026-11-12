import { z } from "zod";
import { ApiError } from "@/lib/errors";
import type { VerifySlipArgs } from "./types";

export function validateSlipInput(args: VerifySlipArgs): void {
  if (!Number.isSafeInteger(args.expectedAmountSatang) || args.expectedAmountSatang <= 0) {
    throw new ApiError("VALIDATION_ERROR", 422, "ยอดชำระต้องเป็นจำนวนเต็มสตางค์ที่มากกว่าศูนย์");
  }
  if (
    !(args.slipBytes instanceof Uint8Array) ||
    args.slipBytes.byteLength === 0 ||
    args.slipBytes.byteLength > 5 * 1024 * 1024
  ) {
    throw new ApiError("VALIDATION_ERROR", 422, "กรุณาส่งรูปสลิปขนาดไม่เกิน 5 MB");
  }
}

/** Parse external decimal baht without multiplying a floating-point number. */
export function parseAmountSatang(value: string | number): number | null {
  const text = String(value);
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(text);
  if (!match || match[0].length !== text.length) return null;
  const satang = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (satang > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(satang);
}

const timestamp = z.string().datetime({ offset: true });

export function parseTimestamp(value: string | undefined): number | null {
  const parsed = timestamp.safeParse(value);
  if (!parsed.success) return null;
  const ms = Date.parse(parsed.data);
  return Number.isFinite(ms) ? ms : null;
}

export function slipImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  return null;
}

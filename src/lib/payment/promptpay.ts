import "server-only";
import generatePayload from "promptpay-qr";
import { toDataURL } from "qrcode";
import { ApiError } from "@/lib/errors";

/** CRC-16/CCITT-FALSE: polynomial 0x1021, initial 0xffff, no reflection/xor. */
export function crc16(value: string): string {
  let crc = 0xffff;
  for (const char of value) {
    crc ^= char.charCodeAt(0) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function isPromptPayId(value: string): boolean {
  return (value.length === 10 || value.length === 13) && /^(?:0[0-9]{9}|[0-9]{13})$/.test(value);
}

/** No floating-point baht value is passed to promptpay-qr's amount.toFixed(). */
export function createPromptPayPayload(promptPayId: string, amountSatang: number): string {
  if (!isPromptPayId(promptPayId)) {
    throw new ApiError(
      "VALIDATION_ERROR",
      422,
      "เลขพร้อมเพย์ต้องเป็นเบอร์โทร 10 หลักหรือเลขประจำตัว 13 หลัก",
    );
  }
  if (!Number.isSafeInteger(amountSatang) || amountSatang <= 0) {
    throw new ApiError("VALIDATION_ERROR", 422, "ยอดชำระต้องเป็นจำนวนเต็มสตางค์ที่มากกว่าศูนย์");
  }

  const satang = BigInt(amountSatang);
  const hundred = BigInt(100);
  const amount = `${satang / hundred}.${String(satang % hundred).padStart(2, "0")}`;
  // EMV transaction amount (tag 54) permits at most 13 characters.
  if (amount.length > 13) {
    throw new ApiError("VALIDATION_ERROR", 422, "ยอดชำระเกินขนาดที่ QR รองรับ");
  }
  // The library supplies the account TLV structure. Drop its old CRC, set the
  // point-of-initiation method to dynamic (12), then append amount TLV and CRC.
  const base = generatePayload(promptPayId, {});
  const body = base.slice(0, 6) + "010212" + base.slice(12, -8);
  const checksumInput = `${body}54${String(amount.length).padStart(2, "0")}${amount}6304`;
  return checksumInput + crc16(checksumInput);
}

export async function createPromptPayCharge(promptPayId: string, amountSatang: number) {
  const promptpayPayload = createPromptPayPayload(promptPayId, amountSatang);
  const qrDataUrl = await toDataURL(promptpayPayload, {
    type: "image/png",
    errorCorrectionLevel: "M",
    margin: 4,
    width: 384,
  });
  return { promptpayPayload, qrDataUrl };
}

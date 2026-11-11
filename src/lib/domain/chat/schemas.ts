import { z } from "zod";
import { ApiError } from "@/lib/errors";

export const MAX_MESSAGE_LENGTH = 1000;

/**
 * Cleans what a person typed, without changing its meaning: line breaks become "\n", and control
 * characters, text direction overrides and broken emoji halves are dropped (a NUL byte would be
 * refused by Postgres). Nothing else is touched, in
 * particular "<script>" stays as typed: the text is stored raw and shown as text (React escapes it).
 */
export function cleanMessageBody(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
      // Text direction overrides can make a message read differently from how it was typed.
      .replace(/[\u202a-\u202e\u2066-\u2069]/g, "")
      // A lone half of an emoji cannot be stored: drop it instead of failing with a 500.
      .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "")
      .trim()
  );
}

/** The body of POST .../messages: 1-1000 characters after cleaning (counted as characters, not bytes). */
export function parseMessageBody(input: unknown): string {
  const raw =
    typeof input === "object" && input !== null && "body" in input
      ? (input as { body: unknown }).body
      : undefined;
  if (typeof raw !== "string") {
    throw new ApiError("VALIDATION_ERROR", 422, "ต้องระบุข้อความ", { field: "body" });
  }
  const body = cleanMessageBody(raw);
  if (body === "") {
    throw new ApiError("VALIDATION_ERROR", 422, "ข้อความต้องไม่ว่าง", { field: "body" });
  }
  if (Array.from(body).length > MAX_MESSAGE_LENGTH) {
    throw new ApiError("VALIDATION_ERROR", 422, `ข้อความยาวเกิน ${MAX_MESSAGE_LENGTH} ตัวอักษร`, {
      field: "body",
    });
  }
  return body;
}

/** `?after=<iso time>`: only messages newer than this. */
export const AfterParam = z.iso.datetime({ offset: true, message: "เวลา after ไม่ถูกต้อง" });

// ---- Web Push subscription of a shop's device (PushSubscription.toJSON()) ---------------------
const base64 = /^[A-Za-z0-9_\-+/]+={0,2}$/;

export const PushSubscribeBody = z.object({
  endpoint: z
    .string("ต้องระบุ endpoint")
    .max(2000, "endpoint ยาวเกินไป")
    .refine((v) => v.startsWith("https://") && URL.canParse(v), "endpoint ต้องเป็นลิงก์ https"),
  keys: z.object(
    {
      p256dh: z
        .string("ต้องระบุ p256dh")
        .min(20, "p256dh ไม่ถูกต้อง")
        .max(200, "p256dh ไม่ถูกต้อง")
        .regex(base64, "p256dh ไม่ถูกต้อง"),
      auth: z
        .string("ต้องระบุ auth")
        .min(8, "auth ไม่ถูกต้อง")
        .max(100, "auth ไม่ถูกต้อง")
        .regex(base64, "auth ไม่ถูกต้อง"),
    },
    "ต้องระบุ keys",
  ),
});
export type PushSubscribeBody = z.infer<typeof PushSubscribeBody>;

export const PushUnsubscribeBody = z.object({
  endpoint: z
    .string("ต้องระบุ endpoint")
    .min(1, "ต้องระบุ endpoint")
    .max(2000, "endpoint ยาวเกินไป"),
});

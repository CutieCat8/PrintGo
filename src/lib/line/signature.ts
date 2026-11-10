import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Checks the `x-line-signature` header of a webhook (docs: "Verify webhook signature").
 * The signature is the base64 HMAC-SHA256 of the raw request body with the channel secret as key.
 * `rawBody` must be the text exactly as received: parsing and re-serialising the JSON first
 * changes bytes and the check would fail.
 */
export function verifyLineSignature(
  channelSecret: string,
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b); // constant time, so timing leaks nothing
}

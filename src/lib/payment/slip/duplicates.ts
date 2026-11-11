import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/errors";

/** A3 calls this on a failed payment write; the database unique constraint wins races. */
export function mapSlipPersistenceError(error: unknown): ApiError {
  const parsed = z
    .object({ code: z.string(), constraint: z.string().optional(), message: z.string().optional() })
    .safeParse(error);
  if (
    parsed.success &&
    parsed.data.code === "23505" &&
    (parsed.data.constraint === "payments_slip_ref_key" ||
      /unique constraint "payments_slip_ref_key"/.test(parsed.data.message ?? ""))
  ) {
    return new ApiError("PAYMENT_DUPLICATE_SLIP", 409);
  }
  // Do not surface DB messages or assume every unique violation is a reused slip.
  return new ApiError("INTERNAL", 500);
}

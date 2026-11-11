import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/errors";

/**
 * Cron routes need `Authorization: Bearer ${CRON_SECRET}` (CONTRACTS 6.5). If CRON_SECRET is not
 * set the route stays closed (401), never open. The comparison does not leak where it differs.
 */
export function requireCronSecret(req: Request): void {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!secret || !match) throw new ApiError("UNAUTHENTICATED", 401);

  const digest = (s: string) => createHash("sha256").update(s).digest();
  if (!timingSafeEqual(digest(match[1]), digest(secret)))
    throw new ApiError("UNAUTHENTICATED", 401);
}

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/errors";

/** D25: at most 5 tries per order in 10 minutes, then RATE_LIMITED. */
export const PICKUP_MAX_ATTEMPTS = 5;
export const PICKUP_WINDOW_MINUTES = 10;

/**
 * There is no table for attempts yet, so each try is one row in `webhook_events` (id
 * `pickup:{orderId}:{uuid}`, source `pickup_attempt`, created_at = when). TEMPORARY: the Tech Lead
 * should replace it with a table of its own. Rows of an order older than a day are removed on the
 * next attempt for that order.
 */
const SOURCE = "pickup_attempt";
const idPrefix = (orderId: string) => `pickup:${orderId}:`;

/** Ignores spaces (anywhere), so "48 21" and "4821 " both read as 4821. */
export function normalizePickupCode(raw: string): string {
  return raw.replace(/\s+/g, "");
}

function sameCode(given: string, actual: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(actual));
}

/**
 * Counts this try first, then checks the limit, then compares. Counting before comparing means a
 * burst of parallel guesses is counted together instead of all slipping under the limit.
 * Returns true only when the code is right. The code is never logged or returned.
 */
export async function checkPickupCode(
  db: SupabaseClient,
  orderId: string,
  given: string,
  actual: string,
  now: Date = new Date(),
): Promise<boolean> {
  const windowStart = new Date(now.getTime() - PICKUP_WINDOW_MINUTES * 60_000).toISOString();

  const attemptId = `${idPrefix(orderId)}${randomUUID()}`;
  const insert = await db.from("webhook_events").insert({ id: attemptId, source: SOURCE });
  if (insert.error) throw new ApiError("INTERNAL", 500);

  const recent = await db
    .from("webhook_events")
    .select("id")
    .eq("source", SOURCE)
    .like("id", `${idPrefix(orderId)}%`)
    .gte("created_at", windowStart);
  if (recent.error) throw new ApiError("INTERNAL", 500);
  if ((recent.data ?? []).length > PICKUP_MAX_ATTEMPTS) {
    // A blocked try is not counted, so pressing the button again while locked does not extend the lock.
    await db.from("webhook_events").delete().eq("id", attemptId);
    throw new ApiError("RATE_LIMITED", 429);
  }

  // Housekeeping, best effort: old tries of this order are no longer needed.
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  await db
    .from("webhook_events")
    .delete()
    .eq("source", SOURCE)
    .like("id", `${idPrefix(orderId)}%`)
    .lt("created_at", dayAgo);

  return sameCode(normalizePickupCode(given), actual);
}

/**
 * Removes pickup tries older than a day, whatever the order (they only matter for 10 minutes).
 * Run by the expire cron so tries of finished orders do not stay in `webhook_events` forever.
 * Only rows with source `pickup_attempt` are touched. Returns how many were removed.
 */
export async function cleanupPickupAttempts(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<number> {
  const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const { data, error } = await db
    .from("webhook_events")
    .delete()
    .eq("source", SOURCE)
    .lt("created_at", dayAgo)
    .select("id");
  if (error) {
    console.error(`[pickup] could not remove old tries (db code ${error.code})`);
    throw new ApiError("INTERNAL", 500);
  }
  return (data ?? []).length;
}

import { getServiceClient } from "@/lib/db/server";
import { requireCronSecret } from "@/lib/domain/cron";
import { sweepExpiredOrders } from "@/lib/domain/orders/expire";
import { cleanupPickupAttempts } from "@/lib/domain/orders/pickupAttempts";
import { handle } from "@/lib/errors";

/**
 * /api/cron/expire-orders (CONTRACTS 6.5): needs the CRON_SECRET bearer token. Safe to repeat.
 * POST is the contract; GET does the same because Vercel Cron calls routes with GET.
 * Expiring orders is the main job; old pickup tries are tidied up afterwards (best effort).
 */
const run = handle(async (req: Request) => {
  requireCronSecret(req);
  const now = new Date();
  const orders = await sweepExpiredOrders(now);

  let pickupAttemptsDeleted = 0;
  try {
    pickupAttemptsDeleted = await cleanupPickupAttempts(getServiceClient(), now);
  } catch {
    console.error("[expire-orders] could not remove old pickup tries");
  }
  return Response.json({ ...orders, pickupAttemptsDeleted });
});

/** A run can take a while (up to 500 orders, each one told by LINE): allow the longest Hobby limit. */
export const maxDuration = 60;

export const POST = run;
export const GET = run;

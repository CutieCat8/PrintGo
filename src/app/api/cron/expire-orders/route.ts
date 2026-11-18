import { requireCronSecret } from "@/lib/domain/cron";
import { sweepExpiredOrders } from "@/lib/domain/orders/expire";
import { handle } from "@/lib/errors";

/**
 * /api/cron/expire-orders (CONTRACTS 6.5): needs the CRON_SECRET bearer token. Safe to repeat.
 * POST is the contract; GET does the same because Vercel Cron calls routes with GET.
 * Expires unanswered/unpaid orders and completes handed-over pickup orders nobody confirmed.
 */
const run = handle(async (req: Request) => {
  requireCronSecret(req);
  return Response.json(await sweepExpiredOrders(new Date()));
});

/** A run can take a while (up to 500 orders, each one told by LINE): allow the longest Hobby limit. */
export const maxDuration = 60;

export const POST = run;
export const GET = run;

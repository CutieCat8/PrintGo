import { requireCronSecret } from "@/lib/domain/cron";
import { cleanupFiles } from "@/lib/domain/files/cleanup";
import { handle } from "@/lib/errors";

/**
 * /api/cron/cleanup-files (CONTRACTS 6.5): needs the CRON_SECRET bearer token. Safe to repeat.
 * POST is the contract; GET does the same because Vercel Cron calls routes with GET.
 */
const run = handle(async (req: Request) => {
  requireCronSecret(req);
  return Response.json(await cleanupFiles(new Date()));
});

export const POST = run;
export const GET = run;

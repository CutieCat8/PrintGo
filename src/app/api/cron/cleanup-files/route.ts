import { requireCronSecret } from "@/lib/domain/cron";
import { cleanupFiles } from "@/lib/domain/files/cleanup";
import { handle } from "@/lib/errors";

/** POST /api/cron/cleanup-files (CONTRACTS 6.5): needs the CRON_SECRET bearer token. Safe to repeat. */
export const POST = handle(async (req: Request) => {
  requireCronSecret(req);
  return Response.json(await cleanupFiles(new Date()));
});

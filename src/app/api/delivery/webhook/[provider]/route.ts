import { handleGrabWebhook } from "@/lib/delivery/grabWebhook";
import { ApiError, handle } from "@/lib/errors";

type Ctx = { params: Promise<{ provider: string }> };

/** `manual` has no webhook (the admin enters updates by hand); only `grab` is wired. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { provider } = await ctx.params;
  if (provider === "grab") return handleGrabWebhook(req);
  throw new ApiError("NOT_FOUND", 404);
});

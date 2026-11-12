import { z } from "zod";
import { ApiError } from "@/lib/errors";
export type AdminShopContext = { params: Promise<{ id: string }> };
export async function adminShopId(ctx: AdminShopContext): Promise<string> {
  const parsed = z.uuid().safeParse((await ctx.params).id);
  if (!parsed.success) throw new ApiError("NOT_FOUND", 404);
  return parsed.data;
}
/** Cookie-authenticated mutations must not accept cross-origin browser submissions. */
export function assertAdminMutationOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) throw new ApiError("FORBIDDEN", 403);
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new ApiError("FORBIDDEN", 403);
}
export function adminJson(value: unknown) {
  return Response.json(value, { headers: { "Cache-Control": "private, no-store" } });
}

import { z } from "zod";
import { ApiError } from "@/lib/errors";

/** The JSON body of a request, or 422 when it is missing or not JSON. */
export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", 422);
  }
}

/** The `:id` of a route, or 404 when it is not a uuid (it cannot be anyone's order). */
export async function orderIdFrom(ctx: { params: Promise<{ id: string }> }): Promise<string> {
  const parsed = z.uuid().safeParse((await ctx.params).id);
  if (!parsed.success) throw new ApiError("NOT_FOUND", 404);
  return parsed.data;
}

export type OrderRouteContext = { params: Promise<{ id: string }> };

/** The same check for any route whose only param is `:id`. */
export const idFrom = orderIdFrom;

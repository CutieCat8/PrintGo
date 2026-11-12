import { requireCustomer } from "@/lib/auth";
import { estimateForCustomer } from "@/lib/domain/orders/quote";
import { EstimateBody } from "@/lib/domain/orders/schemas";
import { ApiError, handle } from "@/lib/errors";

/** POST /api/liff/estimate (CONTRACTS 6.1). Prices come from the shop's list, never from the request. */
export const POST = handle(async (req: Request) => {
  await requireCustomer(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", 422);
  }
  return Response.json(await estimateForCustomer(EstimateBody.parse(body)));
});

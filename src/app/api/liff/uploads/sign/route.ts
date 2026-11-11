import { requireCustomer } from "@/lib/auth";
import { signUploads, UploadSignInput } from "@/lib/domain/files/sign";
import { ApiError, handle } from "@/lib/errors";

/** POST /api/liff/uploads/sign (CONTRACTS 6.1): signed upload URLs into the customer's pending folder. */
export const POST = handle(async (req: Request) => {
  const { customerId } = await requireCustomer(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", 422);
  }
  const input = UploadSignInput.parse(body);
  return Response.json(await signUploads(customerId, input));
});

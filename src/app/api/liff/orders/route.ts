import { requireCustomer } from "@/lib/auth";
import { createOrder } from "@/lib/domain/orders/create";
import { listCustomerOrders } from "@/lib/domain/orders/customer";
import { CreateOrderBody } from "@/lib/domain/orders/schemas";
import { ApiError, handle } from "@/lib/errors";

/** GET /api/liff/orders: my orders, newest first. */
export const GET = handle(async (req: Request) => {
  const { customerId } = await requireCustomer(req);
  return Response.json(await listCustomerOrders(customerId));
});

/** POST /api/liff/orders: create an order (status `submitted`). */
export const POST = handle(async (req: Request) => {
  const { customerId } = await requireCustomer(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", 422);
  }
  return Response.json(await createOrder(customerId, CreateOrderBody.parse(body)));
});

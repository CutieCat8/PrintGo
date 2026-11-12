import { requireCustomer } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { getPaymentService } from "@/lib/payment/service";
import { paymentOrderId, type PaymentRouteContext } from "@/lib/payment/routes";
export const POST = handle(async (req: Request, ctx: PaymentRouteContext) => {
  const { customerId } = await requireCustomer(req);
  const id = await paymentOrderId(ctx);
  return Response.json(await getPaymentService().charge(customerId, id));
});

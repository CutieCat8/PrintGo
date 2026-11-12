import { requireCustomer } from "@/lib/auth";
import { handle } from "@/lib/errors";
import { getPaymentService, SlipSignInput } from "@/lib/payment/service";
import { paymentOrderId, paymentBody, type PaymentRouteContext } from "@/lib/payment/routes";
export const POST = handle(async (req: Request, ctx: PaymentRouteContext) => {
  const { customerId } = await requireCustomer(req);
  const id = await paymentOrderId(ctx);
  const input = SlipSignInput.parse(await paymentBody(req));
  return Response.json(await getPaymentService().sign(customerId, id, input.mime));
});

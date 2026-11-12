import type { PaymentProvider } from "../types";

export type VerifySlipArgs = Parameters<PaymentProvider["verifySlip"]>[0];
export type SlipResult = Awaited<ReturnType<PaymentProvider["verifySlip"]>>;

/** Server-side context from the order, never from the customer request body. */
export type SlipContext = {
  orderCreatedAt?: string;
  /** True only after Sea confirms the SlipOK branch receiver is PrintGo's account. */
  branchReceiverConfirmed?: boolean;
};

/** Shared payment contract: docs/CONTRACTS.md section 7. */
export interface PaymentProvider {
  createCharge(args: {
    orderId: string;
    amountSatang: number;
  }): Promise<{ promptpayPayload: string; qrDataUrl: string }>;
  verifySlip(args: {
    slipBytes: Uint8Array;
    expectedAmountSatang: number;
  }): Promise<{ result: "verified" | "rejected" | "review"; slipRef?: string; reason?: string }>;
}

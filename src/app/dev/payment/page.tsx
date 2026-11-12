import { notFound } from "next/navigation";
import { PaymentDemo } from "@/components/payment/PaymentDemo";
import { createPromptPayCharge } from "@/lib/payment/promptpay";

export const instant = false;

/** Explicitly authorized development-only story, reviewed with Yuri/Sea. */
export default async function PaymentPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  // Fictional account only; never use PLATFORM_PROMPTPAY_ID on this page.
  const { qrDataUrl } = await createPromptPayCharge("0000000000", 123);
  return <PaymentDemo qrDataUrl={qrDataUrl} />;
}

"use client";

import { Button, Card } from "@/components/ui";
import { PaymentPanel } from "@/components/payment/PaymentPanel";

/** Customer-page adapter: deadline and total come from the fetched order, never the form. */
export function PaymentSection({
  orderId,
  amountSatang,
  deadline,
  onPaid,
}: {
  orderId: string;
  amountSatang: number;
  deadline: string | null;
  onPaid: () => void;
}) {
  if (!deadline || !Number.isFinite(Date.parse(deadline))) {
    return (
      <Card>
        <p role="alert">ไม่พบกำหนดเวลาชำระเงิน กรุณาโหลดออเดอร์ใหม่ก่อนชำระ</p>
        <Button variant="secondary" onClick={onPaid}>
          โหลดออเดอร์ใหม่
        </Button>
      </Card>
    );
  }
  return (
    <PaymentPanel
      orderId={orderId}
      amountSatang={amountSatang}
      deadline={deadline}
      onVerified={onPaid}
    />
  );
}

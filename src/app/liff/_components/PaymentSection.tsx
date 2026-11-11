"use client";

import useSWR from "swr";
import { Button, Card, ErrorState, Money, Skeleton } from "@/components/ui";
import { USE_MOCK, api, errorMessage, isApiClientError } from "@/lib/client/api";
import { mockDev } from "@/lib/client/mock/server";

/**
 * Stand-in for Arm's <PaymentPanel /> (A-tasks) until it is merged: shows the PromptPay QR from
 * POST /api/payments/orders/:id/charge. Slip upload belongs to PaymentPanel.
 * In mock mode a "จำลองชำระเงิน" button moves the order to paid.
 */
export function PaymentSection({
  orderId,
  amountSatang,
  onPaid,
}: {
  orderId: string;
  amountSatang: number;
  onPaid: () => void;
}) {
  const charge = useSWR(["charge", orderId], () => api.createCharge(orderId), {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });

  if (charge.isLoading) return <Skeleton className="h-64" />;

  if (charge.error) {
    const notReady = isApiClientError(charge.error) && charge.error.status === 404;
    return notReady ? (
      <Card className="bg-warning-50">
        <p className="font-semibold text-warning-ink">ระบบชำระเงินกำลังเปิดใช้งาน</p>
        <p className="mt-1 text-sm text-warning-ink">
          ยอดที่ต้องชำระ <Money satang={amountSatang} /> · กรุณาลองใหม่อีกครั้งภายหลัง
        </p>
      </Card>
    ) : (
      <ErrorState description={errorMessage(charge.error)} onRetry={() => charge.mutate()} />
    );
  }

  const c = charge.data!;
  return (
    <Card className="flex flex-col items-center gap-2 text-center">
      <p className="font-semibold text-brand">สแกนจ่ายด้วยพร้อมเพย์</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL from the API */}
      <img
        src={c.qrDataUrl}
        alt="QR พร้อมเพย์สำหรับชำระเงิน"
        className="size-56 rounded-control bg-white p-2"
      />
      <p className="text-2xl font-bold">
        <Money satang={c.amountSatang} />
      </p>
      <p className="text-sm text-ink-muted">
        โอนแล้วอัปโหลดสลิปเพื่อยืนยัน (หน้าส่งสลิปกำลังจะเปิดใช้งาน)
      </p>
      {USE_MOCK && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            mockDev.pay(orderId);
            onPaid();
          }}
        >
          จำลองชำระเงิน (โหมดทดสอบ)
        </Button>
      )}
    </Card>
  );
}

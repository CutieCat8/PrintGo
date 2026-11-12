"use client";
import { useMemo, useRef, useState } from "react";
import { SWRConfig } from "swr";
import { PaymentPanel } from "./PaymentPanel";
import { PaymentTransportContext, type PaymentTransport } from "./transport";
import { Button } from "@/components/ui";

/** Local-only story: all accounts, orders and outcomes are fictional. No network/storage. */
export function PaymentDemo({ qrDataUrl }: { qrDataUrl: string }) {
  const [mode, setMode] = useState<"verified" | "pending_review" | "rejected">("pending_review");
  const [version, setVersion] = useState(0);
  const [done, setDone] = useState(false);
  const status = useRef("pending");
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 15 * 60_000).toISOString());
  const transport = useMemo<PaymentTransport>(
    () => ({
      async charge() {
        return {
          paymentId: "00000000-0000-4000-8000-000000000001",
          amountSatang: 123,
          promptpayPayload: "fictional-demo",
          qrDataUrl,
          expiresAt: deadline,
        };
      },
      async sign() {
        return {
          path: "fictional-slip",
          token: "fictional-token",
          uploadUrl: "https://example.invalid",
        };
      },
      async upload(_url, _file, progress) {
        progress(0.3);
        await new Promise((resolve) => setTimeout(resolve, 300));
        progress(1);
      },
      async submit() {
        status.current = mode;
        return {
          status: mode,
          reason: mode === "rejected" ? "ตัวอย่างสมมติ: ยอดเงินในสลิปไม่ตรง" : undefined,
        };
      },
      async order() {
        return {
          status: status.current === "verified" ? "paid" : "awaiting_payment",
          payment: { status: status.current },
        };
      },
    }),
    [mode, deadline, qrDataUrl],
  );
  return (
    <main className="mx-auto max-w-sm space-y-4 p-3 text-ink">
      <h1 className="text-xl font-bold">ทดสอบ PaymentPanel</h1>
      <p className="text-sm">
        ตัวอย่างสมมติทั้งหมด ไม่ต้องโอนเงินจริง รูปที่เลือกไม่ถูกส่งออกจากเครื่อง
      </p>
      <label className="block">
        จำลองผลตรวจสลิป
        <select
          className="block w-full rounded border p-2"
          value={mode}
          onChange={(event) => setMode(event.target.value as typeof mode)}
        >
          <option value="pending_review">รอเจ้าหน้าที่ตรวจ</option>
          <option value="verified">สลิปผ่าน</option>
          <option value="rejected">สลิปไม่ผ่าน</option>
        </select>
      </label>
      <Button
        variant="secondary"
        onClick={() => {
          status.current = "pending";
          setDeadline(new Date(Date.now() + 15 * 60_000).toISOString());
          setDone(false);
          setVersion((v) => v + 1);
        }}
      >
        เริ่มตัวอย่างใหม่
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          status.current = "verified";
        }}
      >
        จำลองแอดมินอนุมัติ (รอโพล 4 วินาที)
      </Button>
      {done && <p role="status">onVerified ถูกเรียกแล้ว</p>}
      <SWRConfig key={version} value={{ provider: () => new Map() }}>
        <PaymentTransportContext.Provider value={transport}>
          <PaymentPanel
            orderId={`fictional-order-${version}`}
            amountSatang={123}
            deadline={deadline}
            onVerified={() => setDone(true)}
          />
        </PaymentTransportContext.Provider>
      </SWRConfig>
    </main>
  );
}

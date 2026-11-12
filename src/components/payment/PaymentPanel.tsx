"use client";
import { useContext, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Button, Card, Money } from "@/components/ui";
import { errorMessage } from "@/lib/client/api";
import { PaymentTransportContext } from "./transport";
import { countdown, PAID_STATUSES, secondsLeft, slipFileProblem } from "./helpers";

export type PaymentPanelProps = {
  orderId: string;
  amountSatang: number;
  deadline: string;
  onVerified: () => void;
};

export function PaymentPanel(props: PaymentPanelProps) {
  return <Panel key={props.orderId} {...props} />;
}
function Panel({ orderId, amountSatang, deadline, onVerified }: PaymentPanelProps) {
  const transport = useContext(PaymentTransportContext);
  const charge = useSWR(["payment-charge", orderId], () => transport.charge(orderId), {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const order = useSWR(["payment-order", orderId], () => transport.order(orderId), {
    refreshInterval: 4000,
    shouldRetryOnError: false,
    onSuccess: () => setResult(null),
  });
  const controller = useRef<AbortController | null>(null);
  const notified = useRef(false);
  const working = useRef(false);
  const alive = useRef(true);
  const waiting = result === "pending_review" || order.data?.payment?.status === "pending_review";
  const verified = result === "verified" || PAID_STATUSES.has(order.data?.status ?? "");
  const rejected = result === "rejected" || order.data?.payment?.status === "rejected";
  const closed = ["expired", "cancelled", "rejected"].includes(order.data?.status ?? "");
  const remaining = secondsLeft(charge.data?.expiresAt ?? deadline, now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  useEffect(() => {
    if (verified && !notified.current) {
      notified.current = true;
      onVerified();
    }
  }, [verified, onVerified]);

  async function send() {
    if (!file || working.current || waiting || verified || closed || remaining === 0) return;
    working.current = true;
    setBusy(true);
    setMessage(null);
    setProgress(0);
    const abort = new AbortController();
    controller.current = abort;
    try {
      // Refresh charge after a prior rejection so its pending attempt exists.
      await charge.mutate();
      const signed = await transport.sign(orderId, file.type);
      if (!alive.current) return;
      await transport.upload(
        signed.uploadUrl,
        file,
        (f) => {
          if (alive.current) setProgress(Math.round(f * 100));
        },
        abort.signal,
      );
      if (!alive.current) return;
      const response = await transport.submit(orderId, signed.path);
      if (!alive.current) return;
      setResult(response.status);
      setMessage(response.reason ?? null);
      void order.mutate();
    } catch (error) {
      if (alive.current && !abort.signal.aborted) {
        setMessage(errorMessage(error));
        // Server may have accepted the slip despite a lost response. Poll before retry.
        void order.mutate();
      }
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Card className="min-w-0 space-y-4" aria-label="ชำระเงิน">
      <h2 className="text-lg font-semibold text-brand">ชำระเงินด้วยพร้อมเพย์</h2>
      <p className="text-2xl font-bold">
        <Money satang={charge.data?.amountSatang ?? amountSatang} />
      </p>
      {verified ? (
        <p role="status" className="text-success">
          ✓ ชำระเงินสำเร็จ
        </p>
      ) : (
        <>
          {charge.error ? (
            <div role="alert">
              <p>{errorMessage(charge.error)}</p>
              <Button variant="secondary" onClick={() => void charge.mutate()}>
                โหลด QR ใหม่
              </Button>
            </div>
          ) : charge.data && !closed && remaining > 0 && !waiting ? (
            <div className="flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local PNG data URL returned by payment API */}
              <img
                src={charge.data.qrDataUrl}
                alt="QR พร้อมเพย์สำหรับยอดออเดอร์นี้"
                className="h-auto w-56 max-w-full rounded-control bg-white p-2"
              />
              <a
                href={charge.data.qrDataUrl}
                download="printgo-payment.png"
                className="text-sm text-brand underline"
              >
                บันทึกรูป QR
              </a>
            </div>
          ) : charge.isLoading ? (
            <p role="status">กำลังเตรียม QR…</p>
          ) : null}
          {!waiting && !closed && (
            <p>
              เหลือเวลาชำระ <span className="tabular-nums">{countdown(remaining)}</span>
            </p>
          )}
          {waiting ? (
            <p role="status">กำลังตรวจสอบสลิป กรุณารอเจ้าหน้าที่ ไม่ต้องโอนซ้ำ</p>
          ) : closed || remaining === 0 ? (
            <p role="status">ออเดอร์นี้ไม่สามารถรับชำระเพิ่มได้ กรุณาตรวจสอบสถานะออเดอร์</p>
          ) : (
            <>
              <p className="text-sm text-ink-muted">1. สแกนจ่าย → 2. แคปสลิป → 3. อัปโหลดที่นี่</p>
              {rejected && (
                <p role="alert">
                  {order.data?.payment?.rejectReason ??
                    message ??
                    "สลิปไม่ผ่าน กรุณาตรวจสอบแล้วส่งใหม่"}
                </p>
              )}
              <label className="block text-sm font-medium">
                เลือกรูปสลิป (JPEG/PNG ไม่เกิน 5 MB)
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  disabled={busy || !charge.data || !!charge.error || !!order.error}
                  className="mt-2 block w-full min-w-0 text-sm"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    event.target.value = "";
                    if (!selected) return;
                    const problem = slipFileProblem(selected);
                    setMessage(problem);
                    if (!problem) {
                      setFile(selected);
                      setPreview(URL.createObjectURL(selected));
                    } else {
                      setFile(null);
                      setPreview(null);
                    }
                  }}
                />
              </label>
              {file && (
                <div className="space-y-2">
                  {preview && (
                    // eslint-disable-next-line @next/next/no-img-element -- user-selected object URL, revoked on replacement/unmount
                    <img
                      src={preview}
                      alt="ตัวอย่างรูปสลิปที่เลือก"
                      className="max-h-56 max-w-full rounded-control object-contain"
                    />
                  )}
                  <p className="break-all text-sm">{file.name}</p>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setFile(null);
                      setPreview(null);
                    }}
                  >
                    ลบรูปและเลือกใหม่
                  </Button>
                </div>
              )}
              {busy && (
                <progress
                  aria-label="ความคืบหน้าอัปโหลดสลิป"
                  max={100}
                  value={progress}
                  className="w-full"
                />
              )}
              <Button
                fullWidth
                loading={busy}
                disabled={
                  !file || !charge.data || !!charge.error || !!order.error || order.isLoading
                }
                onClick={() => void send()}
              >
                ส่งสลิปเพื่อตรวจสอบ
              </Button>
            </>
          )}
          {message && !rejected && <p role="alert">{message}</p>}
          {order.error && (
            <div role="alert">
              <p>ตรวจสถานะไม่สำเร็จ กรุณาลองใหม่ก่อนส่งสลิป</p>
              <Button variant="secondary" onClick={() => void order.mutate()}>
                ตรวจสถานะอีกครั้ง
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

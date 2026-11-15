"use client";
import { useRef, useState } from "react";
import useSWR from "swr";
import { useNow } from "@/lib/client/hooks";
import Link from "next/link";
import { Button, Card, ErrorState, Modal, Money, Skeleton } from "@/components/ui";
import { errorMessage } from "@/lib/client/http";
import { formatDayTime } from "@/lib/client/format";
import { adminRead, adminAction } from "../_lib/api";
import { ReviewPayments as Schema, type ReviewPayment } from "../_lib/review-types";

export function ReviewPayments() {
  const now = useNow(1000).getTime();
  const resource = useSWR(
    "admin-payments",
    async () => Schema.parse(await adminRead("payments?status=pending_review")),
    { refreshInterval: 30000, shouldRetryOnError: false },
  );
  const [selection, setSelection] = useState<{
    payment: ReviewPayment;
    action: "approve" | "reject" | "refund";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function confirm() {
    if (!selection || lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await adminAction(
        `payments/${selection.payment.id}/${selection.action}`,
        selection.action === "approve" ? undefined : { reason },
      );
      setNotice(
        selection.action === "refund"
          ? "สร้างรายการรอโอนคืนแล้ว"
          : selection.action === "approve"
            ? "อนุมัติการชำระเงินแล้ว"
            : "ปฏิเสธสลิปแล้ว",
      );
      setSelection(null);
      await resource.mutate();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (resource.error)
    return (
      <ErrorState
        description={errorMessage(resource.error)}
        onRetry={() => void resource.mutate()}
      />
    );
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-brand">สลิปรอตรวจ</h1>
      {notice && <p role="status">{notice}</p>}
      {!resource.data ? (
        <Skeleton className="h-64" />
      ) : !resource.data.payments.length ? (
        <p>ไม่มีสลิปรอตรวจ</p>
      ) : (
        resource.data.payments.map((p) => {
          const expired =
            p.orderStatus === "expired" ||
            (p.orderStatus === "awaiting_payment" &&
              (!p.paymentDeadline || Date.parse(p.paymentDeadline) <= now));
          const approvable = p.orderStatus === "awaiting_payment" && !expired;
          return (
            <Card key={p.id} className="space-y-3">
              <Link className="text-brand underline" href={`/admin/orders/${p.orderId}`}>
                {p.orderNo}
              </Link>
              <p>
                ยอดสลิป <Money satang={p.amountSatang} /> · ยอดออเดอร์{" "}
                {p.expectedAmountSatang === null ? (
                  "ยังไม่กำหนด"
                ) : (
                  <Money satang={p.expectedAmountSatang} />
                )}
              </p>
              <p>ส่งเมื่อ {formatDayTime(p.createdAt)}</p>
              {p.slipUrl ? (
                <a href={p.slipUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private Storage URL */}
                  <img
                    src={p.slipUrl}
                    alt={`สลิปออเดอร์ ${p.orderNo}`}
                    className="max-h-96 w-full object-contain"
                  />
                </a>
              ) : (
                <p role="alert">ไม่พบภาพสลิป</p>
              )}
              {expired && (
                <p role="alert" className="text-danger-ink">
                  ออเดอร์หมดเวลาชำระแล้ว ตรวจการรับเงินจริงก่อนสร้างรายการคืนเงิน
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {approvable && (
                  <Button
                    onClick={() => {
                      setSelection({ payment: p, action: "approve" });
                      setReason("");
                      setFailure(null);
                    }}
                  >
                    อนุมัติ
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelection({ payment: p, action: "reject" });
                    setReason("");
                    setFailure(null);
                  }}
                >
                  ปฏิเสธ
                </Button>
                {expired && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelection({ payment: p, action: "refund" });
                      setReason("");
                      setFailure(null);
                    }}
                  >
                    สร้างรายการคืนเงิน
                  </Button>
                )}
              </div>
            </Card>
          );
        })
      )}
      <Modal
        open={!!selection}
        onClose={() => setSelection(null)}
        dismissible={!busy}
        title={
          selection?.action === "approve"
            ? "ยืนยันอนุมัติสลิป"
            : selection?.action === "refund"
              ? "ยืนยันรับเงินจริงและสร้างรายการคืนเงิน"
              : "ปฏิเสธสลิป"
        }
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setSelection(null)}>
              กลับ
            </Button>
            <Button
              disabled={busy || (selection?.action !== "approve" && !reason.trim())}
              onClick={() => void confirm()}
            >
              ยืนยัน
            </Button>
          </>
        }
      >
        {selection?.action === "approve" ? (
          <p>ตรวจยอด ผู้รับ และการรับเงินจริงให้ถูกต้องก่อนอนุมัติ</p>
        ) : (
          <label>
            เหตุผล
            <textarea
              maxLength={500}
              className="block w-full rounded-control border border-line p-2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {failure && <p role="alert">{failure}</p>}
      </Modal>
    </section>
  );
}

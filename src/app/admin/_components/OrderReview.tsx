"use client";
import { useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Button, Card, ErrorState, Modal, Money, Skeleton } from "@/components/ui";
import { orderStatusLabel } from "@/components/ui/status";
import { errorMessage } from "@/lib/client/http";
import { formatDayTime, fileSettingsText } from "@/lib/client/format";
import { adminRead, adminAction } from "../_lib/api";
import { parseRefundAmount } from "../_lib/refund-amount";
import { OrderDetail } from "../_lib/review-types";

const paymentLabels = {
  pending: "รอส่งสลิป",
  pending_review: "รอตรวจสลิป",
  verified: "ตรวจสอบแล้ว",
  rejected: "สลิปไม่ผ่าน",
};
const deliveryLabels = {
  pending_admin: "รอแอดมินเรียกรถ",
  booked: "เรียกรถแล้ว",
  in_transit: "กำลังจัดส่ง",
  delivered: "ส่งถึงแล้ว",
  failed: "จัดส่งไม่สำเร็จ",
  cancelled: "ยกเลิกการจัดส่ง",
};

export function OrderReview({ id }: { id: string }) {
  const resource = useSWR(
    ["admin-order", id],
    async () => OrderDetail.parse(await adminRead(`orders/${id}`)),
    { refreshInterval: 10000, shouldRetryOnError: false },
  );
  const [action, setAction] = useState<"cancel" | "complete" | null>(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  async function confirm() {
    if (!action || lock.current) return;
    const refundSatang = parseRefundAmount(amount, resource.data?.totalSatang ?? 0);
    if (action === "cancel" && refundSatang === null) {
      setError("ยอดคืนต้องมากกว่า 0 มีทศนิยมไม่เกินสองตำแหน่ง และไม่เกินยอดชำระ");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await adminAction(`orders/${id}/${action}`, {
        reason,
        ...(action === "cancel" && refundSatang !== undefined ? { refundSatang } : {}),
      });
      setAction(null);
      setNotice(action === "cancel" ? "ยกเลิกและสร้างรายการรอโอนคืนแล้ว" : "ปิดงานแล้ว");
      await resource.mutate();
    } catch (e) {
      setError(errorMessage(e));
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
  const o = resource.data;
  if (!o) return <Skeleton className="h-64" />;
  return (
    <section className="space-y-4">
      <Link href="/admin/orders" className="text-brand underline">
        กลับรายการออเดอร์
      </Link>
      <h1 className="text-2xl font-bold text-brand">
        {o.orderNo} · {orderStatusLabel(o.status, o.fulfillment)}
      </h1>
      {notice && <p role="status">{notice}</p>}
      <Card className="space-y-2">
        <h2 className="font-semibold">{o.shop.name}</h2>
        <p>
          {o.shop.address} · {o.shop.phone}
        </p>
        <p>สร้างเมื่อ {formatDayTime(o.createdAt)}</p>
        <p>อัปเดตเมื่อ {formatDayTime(o.updatedAt)}</p>
        <p>การรับงาน {o.fulfillment === "pickup" ? "รับเองที่ร้าน" : "ส่งถึงที่"}</p>
        {o.customerNote && <p>หมายเหตุลูกค้า {o.customerNote}</p>}
        {o.rejectReason && <p>เหตุผลดำเนินการ {o.rejectReason}</p>}
        {o.pickupCode && <p>รหัสรับงาน {o.pickupCode}</p>}
        {o.estimatedReadyAt && <p>เวลาเสร็จประมาณ {formatDayTime(o.estimatedReadyAt)}</p>}
        {o.readyInMinutes && <p>เวลาเตรียมงาน {o.readyInMinutes} นาทีหลังชำระ</p>}
        {o.readyNote && <p>{o.readyNote}</p>}
        <p>กำหนดตอบ {formatDayTime(o.responseDeadline)}</p>
        {o.paymentDeadline && <p>กำหนดชำระ {formatDayTime(o.paymentDeadline)}</p>}
      </Card>
      <Card className="space-y-2">
        <h2 className="font-semibold">ยอดเงิน</h2>
        <p>
          ค่าปริ้นและบริการ{" "}
          {o.printSubtotalSatang === null ? (
            "รอกำหนดราคา"
          ) : (
            <Money satang={o.printSubtotalSatang} />
          )}
        </p>
        <p>
          ค่าบริการแพลตฟอร์ม{" "}
          {o.platformFeeSatang === null ? "รอกำหนดราคา" : <Money satang={o.platformFeeSatang} />}
        </p>
        <p>
          ค่าส่ง <Money satang={o.deliveryFeeSatang} />
        </p>
        <p>ยอดรวม {o.totalSatang === null ? "รอกำหนดราคา" : <Money satang={o.totalSatang} />}</p>
        {o.payment && (
          <>
            <p>
              สถานะสลิป {paymentLabels[o.payment.status]} ·{" "}
              <Money satang={o.payment.amountSatang} />
            </p>
            {o.payment.rejectReason && <p>{o.payment.rejectReason}</p>}
            <Link href="/admin/payments" className="text-brand underline">
              เปิดคิวตรวจสลิป
            </Link>
          </>
        )}
      </Card>
      <Card>
        <h2 className="font-semibold">ไฟล์และบริการ</h2>
        {o.files.map((f) => (
          <p key={f.id}>
            {f.originalName} · {fileSettingsText(f)}
          </p>
        ))}
        {o.services.map((s) => (
          <p key={s.id}>
            {s.name} · {s.quantity} รายการ
          </p>
        ))}
      </Card>
      {o.fulfillment === "delivery" && (
        <Card>
          <h2 className="font-semibold">ผู้รับและการจัดส่ง</h2>
          <p>
            {o.deliveryRecipientName} · {o.deliveryRecipientPhone}
          </p>
          <p>{o.deliveryAddress}</p>
          {o.delivery && (
            <>
              <p>สถานะ {deliveryLabels[o.delivery.status]}</p>
              {o.delivery.trackingUrl && (
                <a
                  href={o.delivery.trackingUrl}
                  rel="noreferrer"
                  target="_blank"
                  className="underline"
                >
                  ติดตามการจัดส่ง
                </a>
              )}
            </>
          )}
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        {["paid", "printing", "ready", "courier_requested", "in_transit"].includes(o.status) && (
          <Button
            variant="secondary"
            onClick={() => {
              setAction("cancel");
              setReason("");
              setAmount("");
              setError(null);
            }}
          >
            ยกเลิกและคืนเงิน
          </Button>
        )}
        {o.status === "ready" && o.fulfillment === "pickup" && (
          <Button
            onClick={() => {
              setAction("complete");
              setReason("");
              setError(null);
            }}
          >
            ปิดงานเป็นเสร็จสิ้น
          </Button>
        )}
      </div>
      <Modal
        open={!!action}
        dismissible={!busy}
        onClose={() => setAction(null)}
        title={
          action === "cancel" ? "ยืนยันยกเลิกและสร้างรายการคืนเงิน" : "ยืนยันปิดงานเป็นเสร็จสิ้น"
        }
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setAction(null)}>
              กลับ
            </Button>
            <Button disabled={busy || !reason.trim()} onClick={() => void confirm()}>
              ยืนยัน
            </Button>
          </>
        }
      >
        <label>
          เหตุผล
          <textarea
            maxLength={500}
            className="block w-full rounded-control border border-line p-2"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {action === "cancel" && (
          <label>
            ยอดคืนบางส่วน (บาท) เว้นว่างเพื่อคืนเต็ม
            <input
              inputMode="decimal"
              className="block min-h-11 w-full rounded-control border border-line p-2"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        )}
        {error && <p role="alert">{error}</p>}
      </Modal>
    </section>
  );
}

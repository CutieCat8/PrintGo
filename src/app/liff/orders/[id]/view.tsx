"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Card,
  ErrorState,
  Modal,
  Money,
  PageShell,
  SkeletonCard,
  StatusBadge,
  Timeline,
  buttonClasses,
  useToast,
} from "@/components/ui";
import { ChatRoom } from "@/components/ui/ChatRoom";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import {
  UNIT_LABEL,
  etaText,
  fileSettingsText,
  formatCountdown,
  formatDayTime,
} from "@/lib/client/format";
import { isTerminal, useNow, useOrder } from "@/lib/client/hooks";
import { customerCanCancel, customerMoney, orderSteps } from "@/lib/client/orders";
import type { OrderDetail } from "@/lib/db/types";
import { LiffBottomNav } from "../../_components/LiffBottomNav";
import { PaymentSection } from "../../_components/PaymentSection";

export function CustomerOrderPage() {
  const { id } = useParams<{ id: string }>();
  const order = useOrder(id, "customer");
  const o = order.data;

  return (
    <PageShell
      title={o ? `ออเดอร์ ${o.orderNo}` : "ออเดอร์"}
      backHref="/liff/orders"
      bottomNav={<LiffBottomNav />}
    >
      {order.isLoading ? (
        <div className="flex flex-col gap-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : order.error && !o ? (
        <ErrorState
          title={
            isApiClientError(order.error) && order.error.status === 404 ? "ไม่พบออเดอร์" : undefined
          }
          description={errorMessage(order.error)}
          onRetry={() => order.mutate()}
        />
      ) : o ? (
        <OrderBody order={o} refresh={() => order.mutate()} />
      ) : null}
    </PageShell>
  );
}

function OrderBody({ order: o, refresh }: { order: OrderDetail; refresh: () => void }) {
  const now = useNow();
  const eta = etaText(o, now);
  const money = customerMoney(o);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-brand">{o.shop.name}</p>
            <p className="text-sm text-ink-muted">สั่งเมื่อ {formatDayTime(o.createdAt, now)}</p>
          </div>
          <StatusBadge status={o.status} fulfillment={o.fulfillment} />
        </div>
        {eta && !isTerminal(o.status) && (
          <p className="mt-3 rounded-control bg-brand-50 px-3 py-2 font-semibold text-brand">
            ⏱ {eta}
            {o.readyNote && <span className="block text-sm font-normal">{o.readyNote}</span>}
          </p>
        )}
      </Card>

      <StatusAction order={o} now={now} refresh={refresh} />

      <Card>
        <h2 className="mb-3 font-semibold text-brand">ความคืบหน้า</h2>
        <Timeline steps={orderSteps(o)} />
      </Card>

      <ChatRoom orderId={o.id} side="customer" closed={isTerminal(o.status)} />

      <Card>
        <h2 className="font-semibold text-brand">รายละเอียด</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {o.files.map((f) => (
            <li key={f.id} className="text-sm">
              <p className="truncate font-medium">📄 {f.originalName}</p>
              <p className="text-ink-muted">{fileSettingsText(f)}</p>
            </li>
          ))}
        </ul>
        {o.services.length > 0 && (
          <>
            <h3 className="mt-3 text-sm font-semibold">บริการเสริม</h3>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {o.services.map((s) => {
                const file = s.fileId ? o.files.find((f) => f.id === s.fileId) : null;
                return (
                  <li key={s.id} className="flex justify-between gap-2">
                    <span>
                      {s.name} × {s.quantity} {UNIT_LABEL[s.unit]}
                      {file && <span className="text-ink-muted"> · {file.originalName}</span>}
                    </span>
                    {s.unitPriceSatang === null && !o.printSubtotalSatang ? (
                      <span className="text-ink-muted">ราคาตามตกลง</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {o.customerNote && (
          <p className="mt-3 text-sm">
            <span className="text-ink-muted">หมายเหตุ: </span>
            {o.customerNote}
          </p>
        )}
        <p className="mt-3 text-sm">
          <span className="text-ink-muted">วิธีรับ: </span>
          {o.fulfillment === "pickup" ? "รับเองที่ร้าน" : `ส่งถึงที่ · ${o.deliveryAddress ?? ""}`}
        </p>
        <p className="mt-1 text-sm">
          <span className="text-ink-muted">ร้าน: </span>
          {o.shop.address} ·{" "}
          <a href={`tel:${o.shop.phone}`} className="text-brand underline">
            {o.shop.phone}
          </a>
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold text-brand">ค่าใช้จ่าย</h2>
        {money ? (
          <dl className="mt-2 flex flex-col gap-1.5">
            {money.lines.map((l) =>
              l.satang === null ? null : (
                <div key={l.label} className="flex justify-between gap-2">
                  <dt>
                    {l.label}
                    {l.note && <span className="ml-1 text-xs text-ink-muted">({l.note})</span>}
                  </dt>
                  <dd>
                    <Money satang={l.satang} />
                  </dd>
                </div>
              ),
            )}
            {money.total !== null && (
              <div className="mt-1 flex justify-between border-t border-line pt-2 text-lg font-semibold">
                <dt>{money.estimate ? "รวม (ประมาณ)" : "รวม"}</dt>
                <dd>
                  <Money satang={money.total} />
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">ร้านจะแจ้งราคาให้เร็ว ๆ นี้</p>
        )}
      </Card>
    </div>
  );
}

function StatusAction({
  order: o,
  now,
  refresh,
}: {
  order: OrderDetail;
  now: Date;
  refresh: () => void;
}) {
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      await api.cancelMyOrder(o.id);
      toast("ยกเลิกออเดอร์แล้ว", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
      setConfirmCancel(false);
      refresh();
    }
  }

  const cancelModal = (
    <Modal
      open={confirmCancel}
      onClose={() => setConfirmCancel(false)}
      dismissible={!busy}
      title="ยกเลิกออเดอร์นี้?"
      description="ยกเลิกแล้วย้อนกลับไม่ได้ ถ้าต้องการปริ้นต้องสั่งใหม่"
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={() => setConfirmCancel(false)}>
            ไม่ยกเลิก
          </Button>
          <Button variant="danger" loading={busy} onClick={cancel}>
            ยืนยันยกเลิก
          </Button>
        </>
      }
    />
  );

  // A slip waiting for review counts as paid for the customer: no cancel (D19)
  const slipInReview = o.payment?.status === "pending_review";
  const canCancel = customerCanCancel(o.status) && !slipInReview;
  const showPayment = paying || slipInReview || o.payment?.status === "rejected";

  if (o.status === "submitted") {
    const left = o.responseDeadline ? new Date(o.responseDeadline).getTime() - now.getTime() : null;
    return (
      <Card className="bg-warning-50">
        <p className="font-semibold text-warning-ink">รอร้านยืนยันราคาและเวลาเสร็จ</p>
        {left !== null && left > 0 && (
          <p className="mt-1 text-sm text-warning-ink">
            ร้านจะตอบภายใน{" "}
            <span className="font-semibold tabular-nums">{formatCountdown(left)}</span> นาที
          </p>
        )}
        {o.requiresManualPrice && (
          <p className="mt-1 text-sm text-warning-ink">ออเดอร์นี้ร้านจะแจ้งราคาให้เร็ว ๆ นี้</p>
        )}
        {canCancel && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setConfirmCancel(true)}>
            ยกเลิกออเดอร์
          </Button>
        )}
        {cancelModal}
      </Card>
    );
  }

  if (o.status === "awaiting_payment") {
    const left = o.paymentDeadline ? new Date(o.paymentDeadline).getTime() - now.getTime() : null;
    return (
      <div className="flex flex-col gap-3">
        <Card className="ring-2 ring-accent-ink">
          <p className="font-semibold text-brand">ร้านยืนยันแล้ว กรุณาชำระเงิน</p>
          {o.totalSatang !== null && (
            <p className="mt-1 text-2xl font-bold">
              <Money satang={o.totalSatang} />
            </p>
          )}
          {left !== null && (
            <p className="mt-1 text-sm text-ink-muted">
              ชำระภายใน{" "}
              <span className={left < 5 * 60_000 ? "font-semibold text-danger" : "font-semibold"}>
                {formatCountdown(left)}
              </span>{" "}
              นาที
            </p>
          )}
          <p className="mt-2 rounded-control bg-warning-50 p-2 text-sm text-warning-ink">
            ชำระเงินแล้วยกเลิกเองไม่ได้ หากต้องการเปลี่ยนแปลงให้คุยกับร้านทางแชท
          </p>
          {slipInReview && (
            <p className="mt-2 rounded-control bg-info-50 p-2 text-sm text-info-ink">
              ได้รับสลิปแล้ว กำลังตรวจสอบการชำระเงิน
            </p>
          )}
          {!showPayment && canCancel && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
                ไม่เอา ยกเลิก
              </Button>
              <Button onClick={() => setPaying(true)}>ตกลง ชำระเงิน</Button>
            </div>
          )}
        </Card>
        {showPayment && o.totalSatang !== null && (
          <PaymentSection
            orderId={o.id}
            amountSatang={o.totalSatang}
            deadline={o.paymentDeadline}
            onPaid={refresh}
          />
        )}
        {cancelModal}
      </div>
    );
  }

  if (o.status === "ready" && o.fulfillment === "pickup" && o.pickupCode) {
    return (
      <Card className="text-center ring-2 ring-success-ink">
        <p className="font-semibold text-success-ink">งานพร้อมรับที่ร้านแล้ว</p>
        <p className="mt-2 text-sm text-ink-muted">บอกรหัสนี้กับร้านตอนรับงาน</p>
        <p
          className="my-2 text-5xl font-bold tracking-[0.3em] text-brand tabular-nums"
          aria-label={`รหัสรับงาน ${o.pickupCode.split("").join(" ")}`}
        >
          {o.pickupCode}
        </p>
        <p className="text-sm">{o.shop.address}</p>
      </Card>
    );
  }

  if ((o.status === "courier_requested" || o.status === "in_transit") && o.delivery) {
    return (
      <Card>
        <p className="font-semibold text-brand">
          {o.status === "in_transit" ? "ไรเดอร์กำลังนำส่ง" : "กำลังหาไรเดอร์"}
        </p>
        {o.delivery.note && <p className="mt-1 text-sm text-ink-muted">{o.delivery.note}</p>}
        {o.delivery.trackingUrl && (
          <a
            href={o.delivery.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-2" })}
          >
            ติดตามไรเดอร์
          </a>
        )}
      </Card>
    );
  }

  if (o.status === "rejected" || o.status === "expired" || o.status === "cancelled") {
    return (
      <Card className="bg-canvas">
        <p className="font-semibold">
          {o.status === "rejected"
            ? "ร้านไม่รับออเดอร์นี้"
            : o.status === "expired"
              ? "ออเดอร์หมดเวลา"
              : "ยกเลิกออเดอร์แล้ว"}
        </p>
        {o.rejectReason && <p className="mt-1 text-sm">เหตุผล: {o.rejectReason}</p>}
        {o.status !== "cancelled" && (
          <Link href="/liff/new" className={buttonClasses({ size: "sm", className: "mt-3" })}>
            สั่งใหม่กับร้านอื่น
          </Link>
        )}
      </Card>
    );
  }

  return null;
}

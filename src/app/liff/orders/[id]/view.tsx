"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Button,
  Card,
  ErrorState,
  Icon,
  Modal,
  Money,
  PageShell,
  SkeletonCard,
  StatusBadge,
  Timeline,
  buttonClasses,
  cx,
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
  formatTime,
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
      title={o ? `${o.orderNo} · ${o.shop.name}` : "ออเดอร์"}
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
  const money = customerMoney(o);

  return (
    <div className="-mt-3 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <StatusBadge status={o.status} fulfillment={o.fulfillment} />
        <span>สั่งเมื่อ {formatDayTime(o.createdAt, now)}</span>
      </div>

      <StatusHero order={o} now={now} refresh={refresh} />

      {!isTerminal(o.status) && o.status !== "submitted" && (
        <Card>
          <h2 className="mb-3 font-display text-lg font-bold italic">ความคืบหน้า</h2>
          <Timeline steps={orderSteps(o)} />
        </Card>
      )}

      {money && (
        <Card>
          <h2 className="mb-2 font-display text-lg font-bold italic">
            {money.estimate ? "ราคาประมาณ" : "ค่าใช้จ่าย"}
          </h2>
          <dl className="flex flex-col gap-1.5">
            {money.lines.map((l) =>
              l.satang === null ? null : (
                <div key={l.label} className="flex justify-between gap-2">
                  <dt className={cx(l.note && "text-ink-muted")}>
                    {l.label}
                    {l.note && <span className="ml-1 text-xs">({l.note})</span>}
                  </dt>
                  <dd className="tabular-nums">
                    <Money satang={l.satang} />
                  </dd>
                </div>
              ),
            )}
            {money.total !== null && (
              <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
                <dt className="font-display text-lg font-bold italic">
                  {money.estimate ? "รวมประมาณ" : "ยอดที่ต้องชำระ"}
                </dt>
                <dd className="font-display text-xl font-bold italic">
                  <Money satang={money.total} />
                </dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      <details className="group rounded-card bg-surface ring-1 ring-line">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold">
          รายละเอียดออเดอร์
          <Icon name="down" className="size-5 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-line px-5 py-4 text-sm">
          <ul className="flex flex-col gap-2">
            {o.files.map((f) => (
              <li key={f.id}>
                <p className="flex items-center gap-1.5 truncate font-medium">
                  <Icon name="file" className="size-4 shrink-0 text-ink-muted" />
                  {f.originalName}
                </p>
                <p className="text-ink-muted">{fileSettingsText(f)}</p>
              </li>
            ))}
          </ul>
          {o.services.length > 0 && (
            <p className="mt-3">
              <span className="text-ink-muted">บริการเสริม: </span>
              {o.services.map((s) => `${s.name} × ${s.quantity} ${UNIT_LABEL[s.unit]}`).join(", ")}
            </p>
          )}
          {o.customerNote && (
            <p className="mt-2">
              <span className="text-ink-muted">หมายเหตุ: </span>
              {o.customerNote}
            </p>
          )}
          <p className="mt-2">
            <span className="text-ink-muted">วิธีรับ: </span>
            {o.fulfillment === "pickup"
              ? "รับเองที่ร้าน"
              : `ส่งถึงที่ · ${o.deliveryAddress ?? ""}`}
          </p>
          <p className="mt-1">
            <span className="text-ink-muted">ร้าน: </span>
            {o.shop.address} ·{" "}
            <a href={`tel:${o.shop.phone}`} className="font-medium text-brand underline">
              {o.shop.phone}
            </a>
          </p>
        </div>
      </details>

      <div id="chat" className="scroll-mt-20">
        <ChatRoom orderId={o.id} side="customer" closed={isTerminal(o.status)} />
      </div>
    </div>
  );
}

function goChat() {
  document.getElementById("chat")?.scrollIntoView({ behavior: "smooth" });
}

/** Big status card at the top: what is happening now and what to do (Figma C9–C13, C16). */
function StatusHero({
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
  // A slip waiting for review counts as paid for the customer: no cancel (D19)
  const slipInReview = o.payment?.status === "pending_review";
  const canCancel = customerCanCancel(o.status) && !slipInReview;
  const eta = etaText(o, now);

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

  // C9: waiting for the shop to price it
  if (o.status === "submitted") {
    const left = o.responseDeadline ? new Date(o.responseDeadline).getTime() - now.getTime() : 0;
    return (
      <div className="flex flex-col items-center rounded-card bg-surface px-5 py-7 text-center ring-1 ring-line">
        <span className="relative flex size-16 items-center justify-center rounded-full bg-race text-white">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />
          <Icon name="store" className="relative size-7" />
        </span>
        <p className="mt-4 font-display text-xl font-bold italic">ส่งให้{o.shop.name}แล้ว</p>
        <p className="mt-1 text-sm text-ink-muted">
          ร้านกำลังตรวจไฟล์และกรอกราคา/เวลาเสร็จ เราจะแจ้งใน LINE ทันทีที่พร้อม
        </p>
        <div className="mt-5 rounded-2xl bg-canvas px-8 py-3">
          <p className="text-xs text-ink-muted">ร้านต้องตอบภายใน</p>
          <p className="font-display text-4xl font-bold tabular-nums italic">
            {formatCountdown(left)}
          </p>
        </div>
        {o.requiresManualPrice && (
          <p className="mt-3 text-sm text-warning-ink">ออเดอร์นี้ร้านจะแจ้งราคาให้</p>
        )}
        <div className="mt-6 grid w-full gap-2">
          <Button variant="secondary" fullWidth onClick={goChat}>
            <Icon name="chat" className="size-5" />
            คุยกับร้าน
          </Button>
          {canCancel && (
            <Button variant="ghost" fullWidth onClick={() => setConfirmCancel(true)}>
              ยกเลิกออเดอร์
            </Button>
          )}
        </div>
        {cancelModal}
      </div>
    );
  }

  // C10 → C11: quote received, pay
  if (o.status === "awaiting_payment") {
    const left = o.paymentDeadline ? new Date(o.paymentDeadline).getTime() - now.getTime() : null;
    return (
      <div className="flex flex-col gap-3">
        {left !== null && (
          <div className="flex items-center justify-between rounded-card bg-race px-5 py-4 text-white">
            <span className="text-sm text-white/80">ชำระภายใน</span>
            <span
              className={cx(
                "font-display text-3xl font-bold tabular-nums italic",
                left < 5 * 60_000 && "text-accent",
              )}
            >
              {formatCountdown(left)}
            </span>
          </div>
        )}
        {eta && (
          <Card>
            <p className="text-sm text-ink-muted">เวลาเสร็จโดยประมาณ</p>
            <p className="font-display text-xl font-bold italic">
              {eta.replace("เสร็จประมาณ ", "")}
            </p>
            {o.readyNote && <p className="text-sm text-ink-muted">หมายเหตุร้าน: {o.readyNote}</p>}
          </Card>
        )}
        {slipInReview && (
          <p className="rounded-card bg-info-50 px-4 py-3 text-sm text-info-ink">
            ได้รับสลิปแล้ว กำลังตรวจสอบการชำระเงิน
          </p>
        )}
        <p className="flex gap-2 text-sm text-ink-muted">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          ชำระเงินแล้วยกเลิกเองไม่ได้ หากต้องการเปลี่ยนแปลงให้คุยกับร้านก่อน
        </p>
        {paying && o.totalSatang !== null ? (
          <PaymentSection orderId={o.id} amountSatang={o.totalSatang} onPaid={refresh} />
        ) : (
          !slipInReview && (
            <div className="grid gap-2">
              <Button size="lg" fullWidth arrow onClick={() => setPaying(true)}>
                ชำระเงิน {o.totalSatang !== null && <Money satang={o.totalSatang} />}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={goChat}>
                  คุยกับร้านก่อน
                </Button>
                {canCancel && (
                  <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
                    ไม่เอา ยกเลิก
                  </Button>
                )}
              </div>
            </div>
          )
        )}
        {cancelModal}
      </div>
    );
  }

  // C16: stopped
  if (o.status === "rejected" || o.status === "expired" || o.status === "cancelled") {
    const title =
      o.status === "rejected"
        ? "ร้านปฏิเสธออเดอร์"
        : o.status === "expired"
          ? "ออเดอร์หมดอายุ"
          : "ยกเลิกออเดอร์แล้ว";
    const detail =
      o.status === "expired"
        ? "ร้านไม่ตอบภายใน 15 นาที หรือไม่ได้ชำระภายในเวลา · ไม่มีการเรียกเก็บเงิน"
        : o.payment?.status === "verified"
          ? "ออเดอร์นี้ชำระแล้ว ระบบสร้างรายการคืนเงิน แอดมินจะโอนคืนให้"
          : "ไม่มีการเรียกเก็บเงิน";
    return (
      <Card className="border-l-4 border-l-danger">
        <p className="flex items-center gap-2 font-display text-xl font-bold italic">
          <Icon name="x" className="size-6 text-danger" strokeWidth={2.4} />
          {title}
        </p>
        {o.rejectReason && <p className="mt-2 text-sm">เหตุผล: &quot;{o.rejectReason}&quot;</p>}
        <p className="mt-1 text-sm text-ink-muted">{detail}</p>
        <Link href="/liff/new" className={buttonClasses({ fullWidth: true, className: "mt-4" })}>
          สั่งใหม่ที่ร้านอื่น
        </Link>
      </Card>
    );
  }

  // C12 / C13: paid → printing → ready → done
  const code = o.status === "ready" && o.fulfillment === "pickup" ? o.pickupCode : null;
  return (
    <div className="flex flex-col gap-3">
      {o.readyNote && !isTerminal(o.status) && (
        <p className="rounded-card bg-warning-50 px-4 py-3 text-sm text-warning-ink">
          ร้านแจ้ง: &quot;{o.readyNote}&quot;
        </p>
      )}
      {o.status === "completed" ? (
        <Hero tone="done" label="เสร็จสิ้น" value="ขอบคุณที่ใช้ PrintGo" />
      ) : o.status === "ready" && o.fulfillment === "pickup" ? (
        <Hero tone="go" label="พร้อมรับที่ร้านแล้ว" value={o.shop.name} />
      ) : o.status === "courier_requested" || o.status === "in_transit" || o.status === "ready" ? (
        <Hero
          tone="go"
          label={
            o.status === "in_transit" ? "ไรเดอร์กำลังไปส่ง" : "ปริ้นเสร็จแล้ว · กำลังหาไรเดอร์"
          }
          value={o.delivery?.note ?? "ติดตามได้ที่ปุ่มด้านล่าง"}
        />
      ) : (
        <Hero
          tone="run"
          label="เสร็จประมาณ"
          value={
            o.estimatedReadyAt
              ? `${formatTime(o.estimatedReadyAt)} น.`
              : (eta?.replace("เสร็จประมาณ ", "") ?? "รอร้านแจ้ง")
          }
        />
      )}

      {code && (
        <div className="rounded-card bg-surface px-5 py-5 text-center ring-2 ring-accent-ink">
          <p className="text-sm text-ink-muted">รหัสรับงาน (บอกร้านตอนมารับ)</p>
          <p
            className="mt-1 font-display text-5xl font-bold tracking-[0.35em] text-ink italic tabular-nums"
            aria-label={`รหัสรับงาน ${code.split("").join(" ")}`}
          >
            {code}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={goChat}>
          <Icon name="chat" className="size-5" />
          แชทกับร้าน
        </Button>
        {o.delivery?.trackingUrl ? (
          <a
            href={o.delivery.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "secondary" })}
          >
            <Icon name="truck" className="size-5" />
            ติดตามไรเดอร์
          </a>
        ) : (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.shop.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "secondary" })}
          >
            <Icon name="pin" className="size-5" />
            ที่อยู่ร้าน
          </a>
        )}
      </div>
    </div>
  );
}

function Hero({
  tone,
  label,
  value,
}: {
  tone: "run" | "go" | "done";
  label: string;
  value: ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-card px-5 py-4",
        tone === "run" && "bg-race text-white",
        tone === "go" && "bg-zoom text-white shadow-glow",
        tone === "done" && "bg-success-50 text-success-ink",
      )}
    >
      <p className={cx("text-sm", tone !== "done" && "text-white/80")}>{label}</p>
      <p className="font-display text-3xl leading-tight font-bold italic">{value}</p>
    </div>
  );
}

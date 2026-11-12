"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, Icon, Money, Skeleton, StatusBadge, cx } from "@/components/ui";
import { errorMessage } from "@/lib/client/api";
import { etaText, formatCountdown, formatTime } from "@/lib/client/format";
import { useNow, useShopMe, useShopOrders } from "@/lib/client/hooks";
import type { Order, OrderStatus } from "@/lib/db/types";

const COLUMNS: { key: string; title: string; statuses: OrderStatus[]; hot?: boolean }[] = [
  { key: "new", title: "ออเดอร์ใหม่", statuses: ["submitted"], hot: true },
  { key: "pay", title: "รอลูกค้าจ่าย", statuses: ["awaiting_payment"] },
  { key: "todo", title: "ต้องปริ้น", statuses: ["paid"] },
  { key: "printing", title: "กำลังปริ้น", statuses: ["printing"] },
  {
    key: "handover",
    title: "พร้อมรับ/ส่ง",
    statuses: ["ready", "courier_requested", "in_transit"],
  },
];
const DONE: OrderStatus[] = ["completed", "rejected", "cancelled", "expired"];

/** New orders by answer deadline; work by ready time; the rest newest first. */
function sortColumn(list: Order[]): Order[] {
  return [...list].sort((a, b) => {
    if (a.status === "submitted" && b.status === "submitted") {
      return (a.responseDeadline ?? "").localeCompare(b.responseDeadline ?? "");
    }
    if (a.estimatedReadyAt || b.estimatedReadyAt) {
      return (a.estimatedReadyAt ?? "9").localeCompare(b.estimatedReadyAt ?? "9");
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** S3: the queue as a board, one column per status (polled every few seconds). */
export default function ShopQueuePage() {
  const me = useShopMe();
  const active = me.data?.state === "active";
  const orders = useShopOrders(undefined, active);
  const now = useNow();
  const [showDone, setShowDone] = useState(false);

  if (!active) {
    return (
      <EmptyState
        icon={<Icon name="clock" className="size-7" />}
        title="คิวงานจะเปิดเมื่อแอดมินอนุมัติร้าน"
        description="ระหว่างนี้ตั้งเวลาเปิด-ปิด ราคา และบริการเสริมไว้ได้เลย"
      />
    );
  }
  if (orders.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((c) => (
          <Skeleton key={c.key} className="h-72" />
        ))}
      </div>
    );
  }
  if (orders.error && !orders.data) {
    return <ErrorState description={errorMessage(orders.error)} onRetry={() => orders.mutate()} />;
  }

  const list = orders.data ?? [];
  const done = list
    .filter((o) => DONE.includes(o.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 30);

  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
        <div className="grid min-w-[1050px] grid-cols-5 gap-3">
          {COLUMNS.map((col) => {
            const items = sortColumn(list.filter((o) => col.statuses.includes(o.status)));
            return (
              <section
                key={col.key}
                aria-labelledby={`col-${col.key}`}
                className={cx(
                  "flex min-h-[60dvh] flex-col rounded-card p-2.5",
                  col.hot && items.length ? "bg-accent-50 ring-1 ring-accent/30" : "bg-line/50",
                )}
              >
                <h2
                  id={`col-${col.key}`}
                  className="mb-2.5 flex items-center gap-2 px-1.5 pt-1 font-display text-base font-bold italic"
                >
                  {col.hot && items.length > 0 && (
                    <span className="relative flex size-2.5">
                      <span className="absolute inset-0 animate-ping rounded-full bg-accent" />
                      <span className="relative size-2.5 rounded-full bg-accent-ink" />
                    </span>
                  )}
                  {col.title}
                  <span className="ml-auto rounded-full bg-surface px-2 text-sm font-semibold text-ink-muted not-italic tabular-nums">
                    {items.length}
                  </span>
                </h2>
                <ul className="flex flex-col gap-2">
                  {items.map((o) => (
                    <QueueCard key={o.id} order={o} now={now} />
                  ))}
                </ul>
                {items.length === 0 && (
                  <p className="px-2 py-6 text-center text-sm text-ink-subtle">ว่าง</p>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <section>
        <button
          type="button"
          aria-expanded={showDone}
          onClick={() => setShowDone((v) => !v)}
          className="flex items-center gap-2 font-semibold text-ink-muted hover:text-ink"
        >
          <Icon name="down" className={cx("size-5 transition", showDone && "rotate-180")} />
          จบแล้ว ({done.length})
        </button>
        {showDone && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {done.map((o) => (
              <QueueCard key={o.id} order={o} now={now} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function QueueCard({ order: o, now }: { order: Order; now: Date }) {
  const isNew = o.status === "submitted";
  const working = o.status === "paid" || o.status === "printing";
  const left = o.responseDeadline ? new Date(o.responseDeadline).getTime() - now.getTime() : null;
  const payLeft = o.paymentDeadline ? new Date(o.paymentDeadline).getTime() - now.getTime() : null;
  const overdue =
    working &&
    o.estimatedReadyAt !== null &&
    new Date(o.estimatedReadyAt).getTime() < now.getTime();

  let line: { text: string; tone: "hot" | "late" | "plain" } = {
    text: `สั่ง ${formatTime(o.createdAt)}`,
    tone: "plain",
  };
  if (isNew && left !== null) {
    line = {
      text: left > 0 ? `ตอบภายใน ${formatCountdown(left)}` : "เลยเวลาตอบ",
      tone: left < 3 * 60_000 ? "late" : "hot",
    };
  } else if (o.status === "awaiting_payment" && payLeft !== null) {
    line = { text: `เหลือ ${formatCountdown(payLeft)}`, tone: "plain" };
  } else if (working) {
    const eta = etaText(o, now)?.replace("เสร็จประมาณ ", "เสร็จก่อน ");
    line = { text: (overdue ? "เลยเวลา · " : "") + (eta ?? ""), tone: overdue ? "late" : "plain" };
  } else if (o.status === "ready") {
    line = {
      text: o.fulfillment === "pickup" ? "รอลูกค้ามารับ" : "รอไรเดอร์",
      tone: "plain",
    };
  }

  return (
    <li className="animate-rise">
      <Link
        href={`/shop/orders/${o.id}`}
        className={cx(
          "block rounded-xl bg-surface p-3 shadow-card ring-1 transition hover:-translate-y-0.5 hover:shadow-raised",
          isNew ? "ring-accent-ink/50" : overdue ? "ring-danger/50" : "ring-line",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-base font-bold italic">{o.orderNo}</p>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-line">
            <Icon name={o.fulfillment === "pickup" ? "store" : "truck"} className="size-3.5" />
            {o.fulfillment === "pickup" ? "รับเอง" : "ส่งถึงที่"}
          </span>
        </div>
        {DONE.includes(o.status) && (
          <StatusBadge status={o.status} fulfillment={o.fulfillment} className="mt-1" />
        )}
        <p
          className={cx(
            "mt-1.5 text-sm tabular-nums",
            line.tone === "hot" && "font-semibold text-accent-ink",
            line.tone === "late" && "font-semibold text-danger",
            line.tone === "plain" && "text-ink-muted",
          )}
        >
          {line.text}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
          {o.requiresManualPrice && isNew ? (
            <span className="text-xs font-semibold text-warning-ink">ต้องตั้งราคา</span>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-2">
            {o.unreadMessageCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-ink px-1.5 text-xs leading-5 font-bold text-white">
                <Icon name="chat" className="size-3" />
                {o.unreadMessageCount > 9 ? "9+" : o.unreadMessageCount}
              </span>
            )}
            {o.printSubtotalSatang !== null && (
              <Money satang={o.printSubtotalSatang} className="font-semibold" />
            )}
          </span>
        </div>
      </Link>
    </li>
  );
}

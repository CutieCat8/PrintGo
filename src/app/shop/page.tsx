"use client";

import Link from "next/link";
import {
  Badge,
  EmptyState,
  ErrorState,
  Money,
  SkeletonCard,
  StatusBadge,
  cx,
} from "@/components/ui";
import { errorMessage } from "@/lib/client/api";
import { etaText, formatCountdown, formatDayTime } from "@/lib/client/format";
import { useNow, useShopMe, useShopOrders } from "@/lib/client/hooks";
import type { Order, OrderStatus } from "@/lib/db/types";

const GROUPS: { key: string; title: string; statuses: OrderStatus[]; byEta?: boolean }[] = [
  { key: "new", title: "รอยืนยัน", statuses: ["submitted"] },
  { key: "pay", title: "รอชำระเงิน", statuses: ["awaiting_payment"] },
  { key: "todo", title: "ต้องปริ้น", statuses: ["paid"], byEta: true },
  { key: "printing", title: "กำลังปริ้น", statuses: ["printing"], byEta: true },
  {
    key: "handover",
    title: "พร้อมส่งมอบ / รอไรเดอร์",
    statuses: ["ready", "courier_requested", "in_transit"],
  },
  { key: "done", title: "เสร็จแล้ว", statuses: ["completed", "rejected", "cancelled", "expired"] },
];

export default function ShopQueuePage() {
  const me = useShopMe();
  const active = me.data?.state === "active";
  const orders = useShopOrders(undefined, active);
  const now = useNow();

  if (!active) {
    return (
      <EmptyState
        icon="⏳"
        title="คิวงานจะเปิดเมื่อแอดมินอนุมัติร้าน"
        description="ระหว่างนี้ตั้งเวลาเปิด-ปิด ราคา และบริการเสริมไว้ได้เลย"
      />
    );
  }

  if (orders.isLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }
  if (orders.error && !orders.data) {
    return <ErrorState description={errorMessage(orders.error)} onRetry={() => orders.mutate()} />;
  }

  const list = orders.data ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        icon="🗂️"
        title="ยังไม่มีออเดอร์"
        description="ออเดอร์ใหม่จะเด้งขึ้นที่นี่พร้อมเสียงแจ้งเตือน (หน้านี้อัปเดตเองทุกไม่กี่วินาที)"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((g) => {
        let items = list.filter((o) => g.statuses.includes(o.status));
        if (g.byEta) {
          items = [...items].sort((a, b) =>
            (a.estimatedReadyAt ?? "9").localeCompare(b.estimatedReadyAt ?? "9"),
          );
        }
        if (g.key === "done") items = items.slice(0, 12);
        if (items.length === 0) return null;
        return (
          <section key={g.key} aria-labelledby={`g-${g.key}`}>
            <h2
              id={`g-${g.key}`}
              className={cx(
                "mb-2 flex items-center gap-2 text-lg font-semibold",
                g.key === "new" ? "text-accent-ink" : "text-brand",
              )}
            >
              {g.title}
              <span className="rounded-full bg-surface px-2 text-sm text-ink-muted ring-1 ring-line">
                {items.length}
              </span>
            </h2>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((o) => (
                <QueueCard key={o.id} order={o} now={now} highlight={g.key === "new"} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function QueueCard({ order: o, now, highlight }: { order: Order; now: Date; highlight: boolean }) {
  const left = o.responseDeadline ? new Date(o.responseDeadline).getTime() - now.getTime() : null;
  const overdue =
    o.estimatedReadyAt !== null &&
    (o.status === "paid" || o.status === "printing") &&
    new Date(o.estimatedReadyAt).getTime() < now.getTime();
  const eta =
    o.status === "paid" || o.status === "printing" || o.status === "awaiting_payment"
      ? etaText(o, now)
      : null;
  const price = o.printSubtotalSatang ?? null;

  return (
    <li>
      <Link
        href={`/shop/orders/${o.id}`}
        className={cx(
          "block rounded-card bg-surface p-4 shadow-card ring-1 hover:ring-brand/50",
          highlight ? "ring-2 ring-accent-ink" : "ring-line",
          overdue && "ring-2 ring-danger",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-center gap-2 text-lg font-semibold text-brand">
            {o.orderNo}
            {o.unreadMessageCount > 0 && (
              <span className="rounded-full bg-danger px-1.5 text-xs leading-5 font-bold text-white">
                💬 {o.unreadMessageCount > 9 ? "9+" : o.unreadMessageCount}
              </span>
            )}
          </p>
          <StatusBadge status={o.status} fulfillment={o.fulfillment} />
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          สั่ง {formatDayTime(o.createdAt, now)} ·{" "}
          {o.fulfillment === "pickup" ? "รับเอง" : "ส่งถึงที่"}
          {o.requiresManualPrice && o.status === "submitted" && " · ต้องกำหนดราคาเอง"}
        </p>
        {o.status === "submitted" && left !== null && (
          <p
            className={cx(
              "mt-2 text-sm font-semibold tabular-nums",
              left < 3 * 60_000 ? "text-danger" : "text-warning-ink",
            )}
          >
            {left > 0 ? `ตอบภายใน ${formatCountdown(left)}` : "เลยเวลาตอบแล้ว"}
          </p>
        )}
        {eta && (
          <p className={cx("mt-2 text-sm font-medium", overdue ? "text-danger" : "text-brand")}>
            {overdue ? "⚠️ เลยเวลา · " : "⏱ "}
            {eta}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2 text-sm">
          {o.fulfillment === "delivery" ? <Badge tone="violet">จัดส่ง</Badge> : <span />}
          {price !== null && <Money satang={price} className="font-semibold" />}
        </div>
      </Link>
    </li>
  );
}

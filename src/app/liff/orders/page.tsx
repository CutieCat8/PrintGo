"use client";

import Link from "next/link";
import { useState } from "react";
import {
  EmptyState,
  ErrorState,
  Icon,
  Money,
  PageShell,
  SkeletonCard,
  StatusBadge,
  buttonClasses,
  cx,
} from "@/components/ui";
import { errorMessage } from "@/lib/client/api";
import { etaText, formatDayTime, formatTime } from "@/lib/client/format";
import { useMyOrders, useNow } from "@/lib/client/hooks";
import { customerMoney } from "@/lib/client/orders";
import type { Order, OrderStatus } from "@/lib/db/types";
import { LiffBottomNav } from "../_components/LiffBottomNav";
import { UnreadBadge } from "../_components/UnreadBadge";

type Tab = "active" | "done" | "stopped";
const TABS: { key: Tab; label: string; statuses: OrderStatus[] }[] = [
  {
    key: "active",
    label: "กำลังดำเนินการ",
    statuses: [
      "submitted",
      "awaiting_payment",
      "paid",
      "printing",
      "ready",
      "courier_requested",
      "in_transit",
    ],
  },
  { key: "done", label: "เสร็จสิ้น", statuses: ["completed"] },
  { key: "stopped", label: "ยกเลิก/หมดอายุ", statuses: ["rejected", "cancelled", "expired"] },
];

/** C15: all my orders, filtered by tab. */
export default function MyOrdersPage() {
  const orders = useMyOrders();
  const now = useNow(30_000);
  const [tab, setTab] = useState<Tab>("active");
  const all = [...(orders.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const counts = Object.fromEntries(
    TABS.map((t) => [t.key, all.filter((o) => t.statuses.includes(o.status)).length]),
  ) as Record<Tab, number>;
  const list = all.filter((o) => TABS.find((t) => t.key === tab)!.statuses.includes(o.status));

  return (
    <PageShell title="สถานะงาน" bottomNav={<LiffBottomNav />}>
      <div
        role="tablist"
        aria-label="กรองออเดอร์"
        className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition",
              tab === t.key ? "bg-ink text-white" : "bg-surface text-ink ring-1 ring-line",
            )}
          >
            {t.label}
            {counts[t.key] > 0 && ` (${counts[t.key]})`}
          </button>
        ))}
      </div>

      {orders.isLoading ? (
        <div className="flex flex-col gap-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : orders.error && !orders.data ? (
        <ErrorState description={errorMessage(orders.error)} onRetry={() => orders.mutate()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Icon name="box" className="size-7" />}
          title={tab === "active" ? "ไม่มีงานที่กำลังทำ" : "ยังไม่มีออเดอร์ในกลุ่มนี้"}
          action={
            tab === "active" ? (
              <Link href="/liff/new" className={buttonClasses({})}>
                สั่งปริ้นเลย
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((o) => (
            <OrderCard key={o.id} order={o} now={now} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function OrderCard({ order: o, now }: { order: Order; now: Date }) {
  const money = customerMoney(o);
  const line =
    o.status === "awaiting_payment" && o.paymentDeadline
      ? `ชำระก่อน ${formatTime(o.paymentDeadline)}`
      : o.status === "ready" && o.pickupCode
        ? `รหัสรับงาน ${o.pickupCode.split("").join(" ")}`
        : o.status === "submitted"
          ? "รอร้านยืนยันราคา"
          : (etaText(o, now) ?? formatDayTime(o.createdAt, now));

  return (
    <li>
      <Link
        href={`/liff/orders/${o.id}`}
        className={cx(
          "block rounded-card bg-surface p-4 ring-1 transition hover:shadow-raised",
          o.status === "awaiting_payment" ? "ring-2 ring-accent-ink" : "ring-line",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 font-semibold">
            <span className="truncate">
              {o.orderNo} · {o.shopName}
            </span>
            <UnreadBadge count={o.unreadMessageCount} />
          </p>
          <StatusBadge status={o.status} fulfillment={o.fulfillment} />
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {line} · {o.fulfillment === "pickup" ? "รับเอง" : "ส่งถึงที่"}
          {money?.total != null && (
            <>
              {" · "}
              <Money satang={money.total} className="font-semibold text-ink" />
            </>
          )}
        </p>
      </Link>
    </li>
  );
}

"use client";

import Link from "next/link";
import {
  EmptyState,
  ErrorState,
  Money,
  PageShell,
  SkeletonCard,
  StatusBadge,
  buttonClasses,
} from "@/components/ui";
import { errorMessage } from "@/lib/client/api";
import { etaText, formatDayTime } from "@/lib/client/format";
import { isTerminal, useMyOrders, useNow } from "@/lib/client/hooks";
import { customerMoney } from "@/lib/client/orders";
import { LiffBottomNav } from "../_components/LiffBottomNav";
import { UnreadBadge } from "../_components/UnreadBadge";

export default function MyOrdersPage() {
  const orders = useMyOrders();
  const now = useNow(30_000);
  const list = [...(orders.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <PageShell title="ออเดอร์ของฉัน" bottomNav={<LiffBottomNav />}>
      {orders.isLoading ? (
        <div className="flex flex-col gap-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : orders.error && !orders.data ? (
        <ErrorState description={errorMessage(orders.error)} onRetry={() => orders.mutate()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="📦"
          title="ยังไม่มีออเดอร์"
          description="ส่งไฟล์ให้ร้านปริ้นได้เลย"
          action={
            <Link href="/liff/new" className={buttonClasses({})}>
              สั่งปริ้น
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((o) => {
            const money = customerMoney(o);
            const eta = isTerminal(o.status) ? null : etaText(o, now);
            return (
              <li key={o.id}>
                <Link
                  href={`/liff/orders/${o.id}`}
                  className="block rounded-card bg-surface p-4 shadow-card ring-1 ring-line hover:ring-brand/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold text-brand">
                        {o.orderNo}
                        <UnreadBadge count={o.unreadMessageCount} />
                      </p>
                      <p className="truncate text-sm text-ink-muted">{o.shopName}</p>
                    </div>
                    <StatusBadge status={o.status} fulfillment={o.fulfillment} />
                  </div>
                  {eta && <p className="mt-2 text-sm font-medium text-brand">⏱ {eta}</p>}
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-ink-muted">{formatDayTime(o.createdAt, now)}</span>
                    {money?.total != null ? (
                      <Money satang={money.total} className="font-semibold" />
                    ) : (
                      !isTerminal(o.status) && (
                        <span className="text-ink-muted">รอร้านยืนยันราคา</span>
                      )
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}

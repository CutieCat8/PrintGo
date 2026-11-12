"use client";

import Link from "next/link";
import {
  Icon,
  Logo,
  Money,
  PageShell,
  Skeleton,
  StatusBadge,
  buttonClasses,
  cx,
} from "@/components/ui";
import { useDraft } from "@/lib/client/draft";
import { etaText, formatCountdown, formatTime } from "@/lib/client/format";
import { isTerminal, useMyOrders, useNow, useShops } from "@/lib/client/hooks";
import { positionOf, useLocation } from "@/lib/client/location";
import { customerMoney } from "@/lib/client/orders";
import type { Order } from "@/lib/db/types";
import { LiffBottomNav } from "./_components/LiffBottomNav";

/** C1 home: start a new order, follow running orders, see nearby shops. */
export default function LiffHome() {
  const { draft, hydrated } = useDraft();
  const orders = useMyOrders();
  const now = useNow(1_000);
  const pos = positionOf(useLocation());
  const shops = useShops(pos);
  const running = (orders.data ?? [])
    .filter((o) => !isTerminal(o.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);
  const resume = hydrated && draft.files.length > 0;

  return (
    <PageShell title="หน้าแรก" hideTitle bottomNav={<LiffBottomNav />}>
      <h1 className="sr-only">PrintGo หน้าแรก</h1>

      <section className="relative overflow-hidden rounded-card bg-race p-5 text-white shadow-raised">
        <p className="text-sm text-white/70">สั่งปริ้นผ่าน LINE ส่งไว ไม่ต้องรอคิว</p>
        <h2 className="mt-1 font-display text-3xl leading-tight font-bold italic">
          สั่งปริ้นงานใหม่
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-white/75">
          {["ส่งไฟล์", "เลือกร้าน", "ร้านยืนยันราคา", "จ่าย", "รับงาน"].map((s, i) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              {i > 0 && <Icon name="next" className="size-3 text-accent" strokeWidth={2.5} />}
              {s}
            </span>
          ))}
        </p>
        <Link
          href="/liff/new"
          className={buttonClasses({ size: "lg", fullWidth: true, className: "mt-5" })}
        >
          {resume ? "สั่งต่อจากที่ค้างไว้" : "เริ่มสั่งปริ้น"}
          <Icon
            name="next"
            className="size-5 transition-transform group-hover/btn:translate-x-1"
            strokeWidth={2.4}
          />
        </Link>
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold italic">งานของฉัน</h2>
          <Link href="/liff/orders" className="text-sm font-medium text-ink-muted hover:text-ink">
            ดูทั้งหมด ›
          </Link>
        </div>
        {orders.isLoading ? (
          <Skeleton className="h-20" />
        ) : running.length === 0 ? (
          <p className="rounded-card bg-surface px-4 py-5 text-center text-sm text-ink-muted ring-1 ring-line">
            ยังไม่มีงานที่กำลังทำ
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {running.map((o) => (
              <RunningOrder key={o.id} order={o} now={now} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold italic">ร้านใกล้คุณ</h2>
          <Link href="/liff/new" className="text-sm font-medium text-ink-muted hover:text-ink">
            สั่งเลย ›
          </Link>
        </div>
        {shops.isLoading ? (
          <Skeleton className="h-28" />
        ) : (
          <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(shops.data ?? []).map((s) => {
              const open = s.isOpen && !s.isPaused;
              return (
                <li
                  key={s.id}
                  className="w-36 shrink-0 snap-start rounded-card bg-surface p-3 ring-1 ring-line"
                >
                  <div className="flex h-16 items-center justify-center rounded-xl bg-brand text-white">
                    <Icon name="store" className="size-7" />
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold">{s.name}</p>
                  <p className="text-xs text-ink-muted">
                    {s.distanceKm !== null ? `${s.distanceKm.toFixed(1)} กม. · ` : ""}
                    <span className={open ? "text-success-ink" : ""}>
                      {open ? "เปิดอยู่" : "ปิด"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs">
                    เริ่ม <Money satang={s.startingPriceSatang} className="font-semibold" />
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-8 flex justify-center opacity-60">
        <Logo size="sm" />
      </div>
    </PageShell>
  );
}

function RunningOrder({ order: o, now }: { order: Order; now: Date }) {
  const money = customerMoney(o);
  const payLeft =
    o.status === "awaiting_payment" && o.paymentDeadline
      ? new Date(o.paymentDeadline).getTime() - now.getTime()
      : null;
  const line =
    payLeft !== null
      ? `ชำระก่อน ${formatTime(o.paymentDeadline!)} (เหลือ ${formatCountdown(payLeft)})`
      : o.status === "submitted"
        ? "รอร้านยืนยันราคา"
        : (etaText(o, now) ?? "");

  return (
    <li>
      <Link
        href={`/liff/orders/${o.id}`}
        className={cx(
          "flex items-center gap-3 rounded-card bg-surface p-4 ring-1 transition hover:shadow-raised",
          o.status === "awaiting_payment" ? "ring-2 ring-accent-ink" : "ring-line",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {o.orderNo} <span className="font-normal text-ink-muted">· {o.shopName}</span>
          </p>
          <p className="mt-0.5 truncate text-sm text-ink-muted">
            {line}
            {money?.total != null && (
              <>
                {" · ยอด "}
                <Money satang={money.total} />
              </>
            )}
          </p>
        </div>
        <StatusBadge status={o.status} fulfillment={o.fulfillment} />
      </Link>
    </li>
  );
}

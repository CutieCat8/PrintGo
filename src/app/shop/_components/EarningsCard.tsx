"use client";

import { useState } from "react";
import { Card, Icon, Money, Skeleton, cx } from "@/components/ui";
import { formatDayTime } from "@/lib/client/format";
import { useShopEarnings } from "@/lib/client/hooks";

/**
 * "รายได้วันนี้": money from orders the customer has received (completed). PrintGo collects the
 * customer's payment first and transfers to the shop later (demo: after closing, the admin marks
 * the transfer), so this is a statement and not a withdrawable balance.
 */
export function EarningsCard() {
  const earnings = useShopEarnings();
  const [open, setOpen] = useState(false);
  const data = earnings.data;

  if (earnings.isLoading) return <Skeleton className="h-24" />;
  if (!data) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted">รายได้วันนี้ ({data.todayCount} ออเดอร์)</p>
          <p className="font-display text-3xl font-bold text-ink italic">
            <Money satang={data.todayTotalSatang} />
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-ink-muted">รอ PrintGo โอนให้ร้าน</p>
          <p className="text-xl font-semibold text-accent-ink">
            <Money satang={data.pendingSatang} />
          </p>
          {data.paidSatang > 0 && (
            <p className="text-xs text-ink-subtle">
              โอนแล้ว <Money satang={data.paidSatang} />
            </p>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-subtle">
        นับเฉพาะออเดอร์ที่ลูกค้ารับของแล้ว · ไม่รวมค่าบริการแพลตฟอร์ม · PrintGo รับเงินจากลูกค้าไว้ก่อน
        และโอนให้ร้านหลังปิดร้าน
      </p>
      {data.items.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="mt-3 flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            <Icon name="down" className={cx("size-4 transition", open && "rotate-180")} />
            รายการ ({data.items.length})
          </button>
          {open && (
            <ul className="mt-2 divide-y divide-line text-sm">
              {data.items.map((i) => (
                <li key={i.orderId} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-semibold">{i.orderNo}</span>{" "}
                    <span className="text-ink-subtle">{formatDayTime(i.completedAt)} น.</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Money satang={i.amountSatang} />
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-xs",
                        i.status === "paid"
                          ? "bg-success-50 text-success-ink"
                          : "bg-warning-50 text-warning-ink",
                      )}
                    >
                      {i.status === "paid" ? "โอนแล้ว" : "รอโอน"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

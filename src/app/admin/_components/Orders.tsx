"use client";
import { useState } from "react";
import useSWR from "swr";
import { useNow } from "@/lib/client/hooks";
import Link from "next/link";
import { Card, ErrorState, Money, Skeleton } from "@/components/ui";
import { OrderStatus } from "@/lib/db/types";
import { errorMessage } from "@/lib/client/http";
import { orderStatusLabel } from "@/components/ui/status";
import { adminRead } from "../_lib/api";
import { AdminOrders } from "../_lib/review-types";
export function Orders() {
  const now = useNow(1000).getTime();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const resource = useSWR(
    ["admin-orders", q, status],
    async () => AdminOrders.parse(await adminRead(`orders?${new URLSearchParams({ q, status })}`)),
    { refreshInterval: 15000, shouldRetryOnError: false },
  );
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-brand">ออเดอร์</h1>
      <div className="flex flex-wrap gap-3">
        <label>
          ค้นหาเลขออเดอร์หรือชื่อร้าน
          <input
            maxLength={100}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="block min-h-11 rounded-control border border-line px-3"
          />
        </label>
        <label>
          สถานะ
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="block min-h-11 rounded-control border border-line px-3"
          >
            <option value="">ทั้งหมด</option>
            {OrderStatus.options.map((s) => (
              <option key={s} value={s}>
                {orderStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {resource.error ? (
        <ErrorState
          description={errorMessage(resource.error)}
          onRetry={() => void resource.mutate()}
        />
      ) : !resource.data ? (
        <Skeleton className="h-64" />
      ) : !resource.data.orders.length ? (
        <p>ไม่พบออเดอร์</p>
      ) : (
        resource.data.orders.map((o) => {
          const overdueReady = o.status === "ready" && now - Date.parse(o.updatedAt) > 86400000;
          const deliveryStuck =
            ["courier_requested", "in_transit"].includes(o.status) &&
            now - Date.parse(o.updatedAt) > 86400000;
          const noReply = o.status === "submitted" && Date.parse(o.responseDeadline) <= now;
          return (
            <Card key={o.id}>
              <Link className="text-brand underline" href={`/admin/orders/${o.id}`}>
                {o.orderNo} · {o.shopName}
              </Link>
              <p>
                {orderStatusLabel(o.status, o.fulfillment)} ·{" "}
                {o.totalSatang === null ? "รอราคา" : <Money satang={o.totalSatang} />}
              </p>
              {(o.pendingReview || overdueReady || deliveryStuck || noReply) && (
                <p className="text-danger-ink">
                  {o.pendingReview ? "สลิปรอตรวจ " : ""}
                  {overdueReady ? "พร้อมรับค้างเกิน 24 ชั่วโมง " : ""}
                  {deliveryStuck ? "จัดส่งค้างเกิน 24 ชั่วโมง " : ""}
                  {noReply ? "ร้านยังไม่ตอบและหมดเวลาตอบแล้ว" : ""}
                </p>
              )}
            </Card>
          );
        })
      )}
    </section>
  );
}

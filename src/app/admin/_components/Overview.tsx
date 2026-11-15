"use client";
import Link from "next/link";
import { Card, Skeleton, Money, ErrorState } from "@/components/ui";
import useSWR from "swr";
import { adminRead } from "../_lib/api";
import { AdminOverview } from "../_lib/delivery-types";
import { errorMessage } from "@/lib/client/http";
import { useAdminShops } from "../_lib/api";
export function Overview() {
  const { data } = useAdminShops();
  const totals = useSWR(
    "admin-overview",
    async () => AdminOverview.parse(await adminRead("overview")),
    { refreshInterval: 15000, shouldRetryOnError: false },
  );
  if (!data) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-brand">ภาพรวมแอดมิน</h1>
      {totals.error ? (
        <ErrorState description={errorMessage(totals.error)} onRetry={() => void totals.mutate()} />
      ) : totals.data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p>ออเดอร์สร้างวันนี้ (เวลาไทย)</p>
            <p>{totals.data.ordersToday}</p>
          </Card>
          <Card>
            <p>สำเร็จจากออเดอร์ที่สร้างวันนี้</p>
            <p>
              {totals.data.completedToday}/{totals.data.ordersToday}
            </p>
            <p>
              {totals.data.ordersToday
                ? `${Math.floor((totals.data.completedToday * 100) / totals.data.ordersToday)}%`
                : "ยังไม่มีออเดอร์"}
            </p>
          </Card>
          <Card>
            <p>ค่าบริการงานที่เสร็จวันนี้</p>
            <Money satang={totals.data.platformFeeTodaySatang} />
          </Card>
          <Card>
            <p>ค่าบริการงานที่เสร็จทั้งหมด</p>
            <Money satang={totals.data.platformFeeTotalSatang} />
          </Card>
        </div>
      ) : (
        <Skeleton className="h-32" />
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p>ร้านรออนุมัติ</p>
          <p className="text-3xl font-bold tabular-nums">{data.pendingShopCount}</p>
          <Link href="/admin/shops" className="text-brand underline">
            ตรวจสอบร้าน
          </Link>
        </Card>
        <Card>
          <p>สลิปรอตรวจ</p>
          <p className="text-3xl font-bold tabular-nums">{data.pendingPaymentCount}</p>
          <Link href="/admin/payments" className="text-brand underline">
            ตรวจสลิป
          </Link>
        </Card>
        <Card>
          <p>ร้านทั้งหมด</p>
          <p className="text-3xl font-bold tabular-nums">{data.shops.length}</p>
        </Card>
      </div>
      <p className="text-sm text-ink-muted">
        ตรวจข้อมูลร้านและราคาก่อนอนุมัติ
        ร้านจะปรากฏให้ลูกค้าเมื่ออนุมัติแล้วและตั้งราคาอย่างน้อยหนึ่งรายการ
      </p>
    </div>
  );
}

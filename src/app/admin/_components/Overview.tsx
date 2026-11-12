"use client";
import Link from "next/link";
import { Card, Skeleton } from "@/components/ui";
import { useAdminShops } from "../_lib/api";
export function Overview() {
  const { data } = useAdminShops();
  if (!data) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-brand">ภาพรวมแอดมิน</h1>
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
          <p className="text-sm text-ink-muted">หน้าตรวจสลิปจะเปิดเร็ว ๆ นี้</p>
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

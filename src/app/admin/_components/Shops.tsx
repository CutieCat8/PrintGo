"use client";
import { useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Modal, Skeleton } from "@/components/ui";
import { errorMessage } from "@/lib/client/http";
import { adminApi, useAdminShops } from "../_lib/api";
import type { AdminShop } from "../_lib/types";

const labels = { pending: "รออนุมัติ", active: "เปิดใช้งาน", suspended: "ถูกระงับ" };
export function Shops() {
  const resource = useAdminShops();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<{
    shop: AdminShop;
    action: "approve" | "suspend";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const submitting = useRef(false);
  async function confirm() {
    if (!selection || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await adminApi.changeShop(selection.shop.id, selection.action);
      setNotice(selection.action === "approve" ? "อนุมัติร้านแล้ว" : "ระงับร้านแล้ว");
      setSelection(null);
      await resource.mutate();
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const rows =
    resource.data?.shops.filter(
      (shop) =>
        (filter === "all" || shop.status === filter) &&
        `${shop.name} ${shop.phone} ${shop.address}`
          .toLocaleLowerCase("th")
          .includes(search.toLocaleLowerCase("th")),
    ) ?? [];
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-brand">จัดการร้าน</h1>
      <p className="text-sm text-ink-muted">
        ร้านรออนุมัติแสดงก่อน ตรวจข้อมูล ราคา และเวลาเปิดก่อนยืนยัน
      </p>
      {notice && (
        <p role="status" className="rounded-control bg-success-50 p-3 text-success-ink">
          {notice}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <label className="flex-1">
          ค้นหาร้าน
          <input
            className="mt-1 block min-h-11 w-full rounded-control border border-line bg-white px-3"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ชื่อ เบอร์ หรือที่อยู่"
          />
        </label>
        <label>
          สถานะ
          <select
            className="mt-1 block min-h-11 rounded-control border border-line bg-white px-3"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">ทั้งหมด</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!resource.data ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <EmptyState title="ไม่พบร้าน" description="ยังไม่มีร้านหรือไม่มีรายการที่ตรงกับการค้นหา" />
      ) : (
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <caption className="sr-only">ร้านทั้งหมดและสถานะการอนุมัติ</caption>
            <thead className="bg-canvas">
              <tr>
                <th className="p-3">ร้าน / ติดต่อ</th>
                <th className="p-3">สถานะ</th>
                <th className="p-3">ความพร้อม</th>
                <th className="p-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((shop) => (
                <tr
                  key={shop.id}
                  className={`border-t border-line ${shop.status === "pending" ? "bg-warning-50" : ""}`}
                >
                  <td className="max-w-sm p-3">
                    <p className="font-semibold text-brand">{shop.name}</p>
                    <p className="break-words">{shop.address}</p>
                    <a href={`tel:${shop.phone}`} className="text-brand underline">
                      {shop.phone}
                    </a>
                  </td>
                  <td className="p-3">
                    <Badge
                      tone={
                        shop.status === "pending"
                          ? "amber"
                          : shop.status === "active"
                            ? "green"
                            : "red"
                      }
                    >
                      {labels[shop.status]}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {!shop.hasPricing && <p className="text-warning-ink">ยังไม่ตั้งราคา</p>}
                    {!shop.hasHours && <p className="text-warning-ink">ยังไม่ตั้งเวลาเปิดครบ</p>}
                    {shop.hasPricing && shop.hasHours && <p>ตั้งราคาและเวลาแล้ว</p>}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {shop.status === "pending" && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelection({ shop, action: "approve" });
                            setFailure(null);
                          }}
                        >
                          อนุมัติ
                        </Button>
                      )}
                      {shop.status !== "suspended" && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setSelection({ shop, action: "suspend" });
                            setFailure(null);
                          }}
                        >
                          ระงับ
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal
        open={!!selection}
        onClose={() => {
          if (!busy) setSelection(null);
        }}
        dismissible={!busy}
        title={selection?.action === "approve" ? "ยืนยันอนุมัติร้าน" : "ยืนยันระงับร้าน"}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setSelection(null)}>
              กลับ
            </Button>
            <Button
              variant={selection?.action === "suspend" ? "danger" : "primary"}
              loading={busy}
              onClick={() => void confirm()}
            >
              ยืนยัน
            </Button>
          </>
        }
      >
        <p>{selection?.shop.name}</p>
        {selection?.action === "approve" ? (
          <>
            <p>เมื่ออนุมัติแล้ว ร้านจึงเริ่มรับออเดอร์ได้ตามเวลาเปิดและการตั้งค่า</p>
            {!selection.shop.hasPricing && (
              <p className="mt-2 text-warning-ink">
                ร้านยังไม่ตั้งราคา ลูกค้าจะยังไม่เห็นร้านนี้จนกว่าจะตั้งราคา
              </p>
            )}
            {!selection.shop.hasHours && (
              <p className="mt-2 text-warning-ink">
                ร้านยังตั้งเวลาเปิดไม่ครบ ควรให้ร้านตรวจสอบก่อนรับงาน
              </p>
            )}
          </>
        ) : (
          <p>ร้านจะไม่ปรากฏในรายการค้นหาของลูกค้า การระงับนี้ไม่ยกเลิกออเดอร์เดิม</p>
        )}
        {failure && (
          <p role="alert" className="mt-2 text-danger">
            {failure}
          </p>
        )}
      </Modal>
    </section>
  );
}

"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Button, Card, ErrorState, Modal, Money, Skeleton } from "@/components/ui";
import { errorMessage } from "@/lib/client/http";
import { parseDeliveryFee } from "../_lib/delivery-fee";
import { formatBaht } from "@/lib/domain/pricing/format";
import { ManualDeliveryUpdate } from "@/lib/delivery/manual-update";
import { DeliveryQueue, mapUrl } from "../_lib/delivery-types";
import { adminAction, adminRead } from "../_lib/api";

const labels: Record<string, string> = {
  pending_admin: "รอเรียกไรเดอร์",
  booked: "เรียกไรเดอร์แล้ว",
  in_transit: "กำลังจัดส่ง",
  delivered: "ส่งสำเร็จ",
  failed: "จัดส่งไม่สำเร็จ",
  cancelled: "ยกเลิก",
};
export function deliveryActions(status: string) {
  return status === "pending_admin" || status === "failed"
    ? ["booked"]
    : status === "booked"
      ? ["in_transit", "failed"]
      : status === "in_transit"
        ? ["delivered", "failed"]
        : [];
}
export function Deliveries() {
  const resource = useSWR(
    "admin-deliveries",
    async () => DeliveryQueue.parse(await adminRead("orders?queue=delivery")),
    { refreshInterval: 15000, shouldRetryOnError: false },
  );
  const [selected, setSelected] = useState<DeliveryQueue["deliveries"][number] | null>(null);
  const [status, setStatus] = useState("booked");
  const [fee, setFee] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("pending_admin");
  function open(row: DeliveryQueue["deliveries"][number]) {
    setSelected(row);
    setStatus(deliveryActions(row.delivery.status)[0]);
    setFee(row.delivery.feeSatang === null ? "" : formatBaht(row.delivery.feeSatang));
    setUrl(row.delivery.trackingUrl ?? "");
    setNote("");
    setFailure("");
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("คัดลอกแล้ว");
    } catch {
      setFailure("คัดลอกไม่ได้ โปรดเลือกข้อความและคัดลอกด้วยตัวเอง");
    }
  }
  async function save() {
    if (!selected || busy) return;
    const amount = parseDeliveryFee(fee);
    const parsed = ManualDeliveryUpdate.safeParse({
      status,
      ...(amount === undefined ? {} : { feeSatang: amount }),
      ...(url.trim() ? { trackingUrl: url.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    if (!parsed.success) {
      setFailure(
        "ตรวจค่าส่ง (ทศนิยมไม่เกิน 2 ตำแหน่ง) ลิงก์ HTTPS และหมายเหตุไม่เกิน 500 ตัวอักษร",
      );
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      await adminAction(`orders/${selected.id}/delivery`, parsed.data);
      setSelected(null);
      setMessage("บันทึกผลจัดส่งแล้ว");
      await resource.mutate();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-brand">จัดส่งด้วยมือ</h1>
      <p>แอดมินเรียกไรเดอร์ในแอปภายนอก แล้วกลับมาบันทึกผลและค่าส่งจริง</p>
      <label>
        สถานะ{" "}
        <select
          className="min-h-11 rounded-control border p-2"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["pending_admin", "booked", "in_transit", "failed", "all"].map((s) => (
            <option key={s} value={s}>
              {labels[s] ?? "ทั้งหมดที่ยังไม่จบ"}
            </option>
          ))}
        </select>
      </label>
      {message && <p role="status">{message}</p>}
      {failure && !selected && <p role="alert">{failure}</p>}
      {resource.error ? (
        <ErrorState
          description={errorMessage(resource.error)}
          onRetry={() => void resource.mutate()}
        />
      ) : !resource.data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          {!resource.data.deliveries.filter((r) => filter === "all" || r.delivery.status === filter)
            .length && <p>ไม่มีงานจัดส่งในสถานะนี้</p>}
          {resource.data.deliveries
            .filter((r) => filter === "all" || r.delivery.status === filter)
            .map((row) => {
              const map = mapUrl(row.lat, row.lng);
              return (
                <Card key={row.id} className="space-y-3 break-words">
                  <Link className="text-brand underline" href={`/admin/orders/${row.id}`}>
                    {row.orderNo}
                  </Link>
                  <p>{labels[row.delivery.status]}</p>
                  <p>
                    รับจาก {row.shop.name} · {row.shop.address} · {row.shop.phone}
                  </p>
                  <p>
                    ส่งที่ {row.address ?? "ไม่มีที่อยู่"} · ผู้รับ {row.recipientName ?? "ไม่ระบุ"}{" "}
                    · {row.recipientPhone ?? "ไม่ระบุ"}
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void copy(
                        `${row.address ?? ""}\n${row.recipientName ?? ""} ${row.recipientPhone ?? ""}`,
                      )
                    }
                  >
                    คัดลอกข้อมูลผู้รับ
                  </Button>
                  {map ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        className="text-brand underline"
                        href={map}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        เปิดแผนที่ปลายทาง
                      </a>
                      <Button
                        variant="secondary"
                        onClick={() => void copy(`${row.lat},${row.lng}`)}
                      >
                        คัดลอกพิกัด
                      </Button>
                    </div>
                  ) : (
                    <p>ไม่มีพิกัดปลายทาง</p>
                  )}
                  <p>
                    ค่าส่งที่ลูกค้ายืนยัน <Money satang={row.estimatedFeeSatang} /> · ค่าส่งจริง{" "}
                    {row.delivery.feeSatang === null ? (
                      "ยังไม่บันทึก"
                    ) : (
                      <Money satang={row.delivery.feeSatang} />
                    )}
                  </p>
                  {row.delivery.trackingUrl && (
                    <p className="break-all">ลิงก์ติดตาม {row.delivery.trackingUrl}</p>
                  )}
                  {row.delivery.note && <p>หมายเหตุ {row.delivery.note}</p>}
                  {row.delivery.status === "failed" && (
                    <p>เรียกใหม่ หรือเปิดรายละเอียดออเดอร์เพื่อยกเลิกและสร้างรายการคืนเงิน</p>
                  )}
                  {!!deliveryActions(row.delivery.status).length && (
                    <Button variant="secondary" onClick={() => open(row)}>
                      บันทึกผลจัดส่ง
                    </Button>
                  )}
                </Card>
              );
            })}
        </>
      )}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        dismissible={!busy}
        title="ยืนยันผลจัดส่ง"
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setSelected(null)}>
              กลับ
            </Button>
            <Button variant="secondary" loading={busy} onClick={() => void save()}>
              ยืนยันบันทึก
            </Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-3">
            <p>
              {selected.orderNo} · {selected.recipientName}
            </p>
            <label className="block">
              สถานะ
              <select
                className="block min-h-11 w-full rounded-control border p-2"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {deliveryActions(selected.delivery.status).map((s) => (
                  <option key={s} value={s}>
                    {labels[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              ค่าส่งจริง (บาท)
              <input
                inputMode="decimal"
                className="block min-h-11 w-full rounded-control border p-2"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </label>
            <p className="text-sm">บันทึกค่าส่งจริงไว้ในรายการจัดส่ง ยอดที่ลูกค้ายืนยันคงเดิม</p>
            <label className="block">
              ลิงก์ติดตาม HTTPS
              <input
                maxLength={2000}
                className="block min-h-11 w-full rounded-control border p-2"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label className="block">
              หมายเหตุ
              <textarea
                maxLength={500}
                className="block w-full rounded-control border p-2"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>
        )}
        {failure && <p role="alert">{failure}</p>}
      </Modal>
    </section>
  );
}

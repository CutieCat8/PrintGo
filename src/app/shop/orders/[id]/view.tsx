"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Button,
  Card,
  ErrorState,
  Input,
  Modal,
  Money,
  SkeletonCard,
  StatusBadge,
  Textarea,
  cx,
  useToast,
} from "@/components/ui";
import { ChatRoom } from "@/components/ui/ChatRoom";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import {
  UNIT_LABEL,
  etaText,
  fileSettingsText,
  formatCountdown,
  formatDayTime,
} from "@/lib/client/format";
import { isTerminal, useNow, useOrder } from "@/lib/client/hooks";
import type { ConfirmOrderBody, Order, OrderDetail } from "@/lib/db/types";
import { ConfirmPanel, EtaPicker, type EtaValue } from "./ConfirmPanel";

const REJECT_REASONS = [
  "เปิดไฟล์ไม่ได้",
  "ไฟล์มีรหัสผ่าน/ไฟล์เสีย",
  "ไม่รับงานชุดนี้",
  "ร้านปิดแล้ว",
];

const QUICK_REPLIES = [
  "ไฟล์มีรหัสผ่าน ปริ้นให้ไม่ได้ ช่วยส่งไฟล์ใหม่ (สั่งออเดอร์ใหม่) ค่ะ/ครับ",
  "เปิดไฟล์ไม่ได้ รบกวนตรวจไฟล์อีกครั้ง",
  "งานนี้วันนี้ยังไม่เสร็จ จะเสร็จ…",
];

export function ShopOrderPage() {
  const { id } = useParams<{ id: string }>();
  const order = useOrder(id, "shop");
  const o = order.data;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Link href="/shop" className="text-sm text-brand underline">
        ‹ กลับไปคิวงาน
      </Link>
      {order.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : order.error && !o ? (
        <ErrorState
          title={
            isApiClientError(order.error) && order.error.status === 404 ? "ไม่พบออเดอร์" : undefined
          }
          description={errorMessage(order.error)}
          onRetry={() => order.mutate()}
        />
      ) : o ? (
        <OrderView order={o} refresh={() => order.mutate()} />
      ) : null}
    </div>
  );
}

function OrderView({ order: o, refresh }: { order: OrderDetail; refresh: () => Promise<unknown> }) {
  const toast = useToast();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  /** Runs one state change; ORDER_INVALID_TRANSITION means someone else moved it first. */
  async function act(
    run: () => Promise<Order>,
    success: string,
    /** Return true when the error was shown in place (no toast needed). */
    handle?: (e: unknown) => boolean,
  ): Promise<boolean> {
    setBusy(true);
    try {
      await run();
      toast(success, "success");
      return true;
    } catch (e) {
      if (handle?.(e)) return false;
      if (isApiClientError(e) && e.code === "ORDER_INVALID_TRANSITION") {
        toast("ออเดอร์นี้เปลี่ยนสถานะแล้ว โหลดข้อมูลใหม่ให้แล้ว", "info");
      } else {
        toast(errorMessage(e), "error");
      }
      return false;
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  const eta = etaText(o, now);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-brand">{o.orderNo}</h1>
            <p className="text-sm text-ink-muted">
              สั่งเมื่อ {formatDayTime(o.createdAt, now)} ·{" "}
              {o.fulfillment === "pickup" ? "ลูกค้ารับเองที่ร้าน" : "ส่งถึงที่ (ไรเดอร์)"}
            </p>
          </div>
          <StatusBadge status={o.status} fulfillment={o.fulfillment} className="text-base" />
        </div>
        {eta && !isTerminal(o.status) && (
          <p className="mt-3 inline-block rounded-control bg-brand-50 px-3 py-2 font-semibold text-brand">
            ⏱ {eta}
            {o.readyNote && <span className="ml-2 font-normal">({o.readyNote})</span>}
          </p>
        )}
        {o.rejectReason && <p className="mt-2 text-sm">เหตุผลที่ปฏิเสธ/ยกเลิก: {o.rejectReason}</p>}
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_minmax(320px,420px)]">
        <div className="flex flex-col gap-4">
          {o.status === "submitted" && (
            <ConfirmPanel
              order={o}
              now={now}
              busy={busy}
              onReject={() => setRejecting(true)}
              onConfirm={(body: ConfirmOrderBody) =>
                act(() => api.confirmOrder(o.id, body), "ยืนยันราคาแล้ว รอลูกค้าชำระเงิน")
              }
            />
          )}
          <NextStep order={o} busy={busy} act={act} onReject={() => setRejecting(true)} now={now} />
          <FilesCard order={o} />
          <PriceCard order={o} />
        </div>
        <ChatRoom
          orderId={o.id}
          side="shop"
          closed={isTerminal(o.status)}
          quickReplies={QUICK_REPLIES}
          className="lg:sticky lg:top-24"
        />
      </div>

      <RejectModal
        open={rejecting}
        busy={busy}
        refund={o.status === "paid"}
        onClose={() => setRejecting(false)}
        onReject={async (reason) => {
          const ok = await act(() => api.rejectOrder(o.id, reason), "ปฏิเสธออเดอร์แล้ว");
          if (ok) setRejecting(false);
        }}
      />
    </>
  );
}

function NextStep({
  order: o,
  busy,
  act,
  onReject,
  now,
}: {
  order: OrderDetail;
  busy: boolean;
  act: (
    run: () => Promise<Order>,
    success: string,
    handle?: (e: unknown) => boolean,
  ) => Promise<boolean>;
  onReject: () => void;
  now: Date;
}) {
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [confirmHandover, setConfirmHandover] = useState(false);
  const [etaOpen, setEtaOpen] = useState(false);

  const adjustEta = (o.status === "paid" || o.status === "printing") && (
    <>
      <Button variant="ghost" size="sm" onClick={() => setEtaOpen(true)}>
        ปรับเวลาเสร็จ
      </Button>
      {/* Mounted only while open, so a closed-and-reopened modal starts empty */}
      {etaOpen && (
        <EtaModal
          open
          busy={busy}
          now={now}
          onClose={() => setEtaOpen(false)}
          onSave={async (body) => {
            const ok = await act(
              () => api.updateOrderEta(o.id, body),
              "ปรับเวลาเสร็จแล้ว ลูกค้าได้รับแจ้งเตือน",
            );
            if (ok) setEtaOpen(false);
          }}
        />
      )}
    </>
  );

  if (o.status === "awaiting_payment") {
    const left = o.paymentDeadline ? new Date(o.paymentDeadline).getTime() - now.getTime() : null;
    return (
      <Card className="bg-warning-50">
        <p className="font-semibold text-warning-ink">รอลูกค้าชำระเงิน</p>
        {left !== null && left > 0 && (
          <p className="text-sm text-warning-ink">หมดเวลาชำระใน {formatCountdown(left)} นาที</p>
        )}
      </Card>
    );
  }

  if (o.status === "paid") {
    return (
      <Card className="ring-2 ring-accent-ink">
        <p className="font-semibold text-brand">ลูกค้าชำระเงินแล้ว เริ่มปริ้นได้เลย</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="lg"
            loading={busy}
            onClick={() => act(() => api.startPrinting(o.id), "เริ่มปริ้นแล้ว")}
          >
            เริ่มปริ้น
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onReject}>
            ปฏิเสธ/คืนเงิน
          </Button>
          {adjustEta}
        </div>
      </Card>
    );
  }

  if (o.status === "printing") {
    return (
      <Card className="ring-2 ring-accent-ink">
        <p className="font-semibold text-brand">กำลังปริ้น</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="lg"
            loading={busy}
            onClick={() =>
              act(
                () => api.markReady(o.id),
                o.fulfillment === "pickup" ? "แจ้งลูกค้าให้มารับแล้ว" : "พร้อมส่ง รอเรียกไรเดอร์",
              )
            }
          >
            ปริ้นเสร็จแล้ว
          </Button>
          {adjustEta}
        </div>
      </Card>
    );
  }

  if (o.status === "ready" && o.fulfillment === "pickup") {
    const valid = /^\d{4}$/.test(code);
    return (
      <Card className="ring-2 ring-success-ink">
        <p className="font-semibold text-success-ink">พร้อมให้ลูกค้ารับ</p>
        <p className="mt-1 text-sm text-ink-muted">
          ขอรหัสรับงาน 4 หลักจากลูกค้า แล้วกรอกเพื่อส่งมอบ
        </p>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setConfirmHandover(true);
          }}
        >
          <Input
            label="รหัสรับงาน"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            autoComplete="off"
            className="w-40"
            value={code}
            error={codeError ?? undefined}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 4));
              setCodeError(null);
            }}
          />
          <Button type="submit" size="lg" disabled={!valid || busy}>
            ส่งมอบแล้ว
          </Button>
        </form>
        <Modal
          open={confirmHandover}
          onClose={() => setConfirmHandover(false)}
          dismissible={!busy}
          title="ยืนยันส่งมอบงาน?"
          description="ส่งมอบแล้วย้อนกลับไม่ได้"
          footer={
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setConfirmHandover(false)}>
                ยกเลิก
              </Button>
              <Button
                loading={busy}
                onClick={async () => {
                  const ok = await act(
                    () => api.completePickup(o.id, code),
                    "ส่งมอบงานเรียบร้อย",
                    (e) => {
                      // wrong code -> 422; too many tries -> 429 (API.md §5 #17)
                      if (isApiClientError(e) && e.code === "RATE_LIMITED") {
                        setCodeError("ใส่รหัสผิดหลายครั้ง ลองใหม่อีกครั้งภายหลัง");
                        return true;
                      }
                      if (isApiClientError(e) && e.code === "VALIDATION_ERROR") {
                        setCodeError("รหัสไม่ถูกต้อง");
                        return true;
                      }
                      return false;
                    },
                  );
                  setConfirmHandover(false);
                  if (ok) setCode("");
                }}
              >
                ยืนยันส่งมอบ
              </Button>
            </>
          }
        />
      </Card>
    );
  }

  if (o.status === "ready" || o.status === "courier_requested" || o.status === "in_transit") {
    return (
      <Card>
        <p className="font-semibold text-brand">
          {o.status === "in_transit" ? "ไรเดอร์กำลังนำส่ง" : "รอไรเดอร์มารับงาน"}
        </p>
        <p className="text-sm text-ink-muted">ร้านไม่ต้องทำอะไรเพิ่ม ระบบจะแจ้งเมื่อจัดส่งเสร็จ</p>
        {o.delivery?.note && <p className="mt-1 text-sm">{o.delivery.note}</p>}
      </Card>
    );
  }

  return null;
}

function FilesCard({ order: o }: { order: OrderDetail }) {
  const toast = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  /** A fresh signed URL on every click (it expires in 5 minutes; never kept). */
  async function open(fileId: string, mode: "view" | "download") {
    // Open the tab inside the click so pop-up blockers allow it, then point it at the file
    const win = mode === "view" ? window.open("about:blank", "_blank") : null;
    setLoading(`${fileId}:${mode}`);
    try {
      const { url } = await api.getShopFileUrl(o.id, fileId, mode);
      if (win) win.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      win?.close();
      toast(errorMessage(e), "error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-brand">ไฟล์ ({o.files.length})</h2>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {o.files.map((f, i) => {
          const services = o.services.filter((s) => s.fileId === f.id);
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {i + 1}. {f.originalName}
                </p>
                <p className="text-sm text-ink-muted">{fileSettingsText(f)}</p>
                {services.length > 0 && (
                  <p className="mt-1 text-sm font-semibold text-accent-ink">
                    + {services.map((s) => s.name).join(", ")}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={loading === `${f.id}:view`}
                  onClick={() => open(f.id, "view")}
                >
                  เปิดดู/พิมพ์
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={loading === `${f.id}:download`}
                  onClick={() => open(f.id, "download")}
                >
                  ดาวน์โหลด
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {o.services.length > 0 && (
        <div className="mt-3 rounded-control bg-accent-50 p-3">
          <h3 className="font-semibold text-accent-ink">บริการเสริมที่ลูกค้าเลือก (อย่าลืมทำ)</h3>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {o.services.map((s) => {
              const file = s.fileId ? o.files.find((f) => f.id === s.fileId) : null;
              return (
                <li key={s.id} className="flex justify-between gap-2">
                  <span>
                    {s.name} × {s.quantity} {UNIT_LABEL[s.unit]}
                    {file && <span className="text-ink-muted"> · {file.originalName}</span>}
                  </span>
                  {s.lineTotalSatang === null ? (
                    <span className="text-ink-muted">ราคาตามตกลง</span>
                  ) : (
                    <Money satang={s.lineTotalSatang} />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {o.customerNote && (
        <p className="mt-3 rounded-control bg-canvas p-3 text-sm">
          <span className="font-semibold">หมายเหตุจากลูกค้า: </span>
          {o.customerNote}
        </p>
      )}
      {o.fulfillment === "delivery" && o.deliveryAddress && (
        <p className="mt-3 text-sm">
          <span className="font-semibold">ส่งที่: </span>
          {o.deliveryAddress}
        </p>
      )}
    </Card>
  );
}

function PriceCard({ order: o }: { order: OrderDetail }) {
  const rows: { label: string; satang: number | null; strong?: boolean }[] = [];
  if (o.printSubtotalSatang !== null) {
    rows.push({
      label: "ราคาที่ร้านยืนยัน (ค่าปริ้น + บริการเสริม)",
      satang: o.printSubtotalSatang,
      strong: true,
    });
  } else {
    rows.push({ label: "ค่าปริ้น (ประเมิน)", satang: o.estimatedPrintSatang });
    if (o.estimatedServicesSatang)
      rows.push({ label: "บริการเสริม (ประเมิน)", satang: o.estimatedServicesSatang });
  }
  if (o.platformFeeSatang !== null)
    rows.push({ label: "ค่าบริการแพลตฟอร์ม (ลูกค้าจ่าย)", satang: o.platformFeeSatang });
  if (o.fulfillment === "delivery" && o.deliveryFeeSatang !== null) {
    rows.push({ label: "ค่าส่ง (ประมาณ)", satang: o.deliveryFeeSatang });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-brand">ราคา</h2>
      <dl className="mt-2 flex flex-col gap-1.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className={cx("flex justify-between gap-2", r.strong && "font-semibold")}
          >
            <dt>{r.label}</dt>
            <dd>
              {r.satang === null ? (
                <span className="text-ink-muted">ยังไม่มี</span>
              ) : (
                <Money satang={r.satang} />
              )}
            </dd>
          </div>
        ))}
        {o.totalSatang !== null && (
          <div className="mt-1 flex justify-between border-t border-line pt-2 text-lg font-semibold">
            <dt>ลูกค้าจ่ายรวม</dt>
            <dd>
              <Money satang={o.totalSatang} />
            </dd>
          </div>
        )}
      </dl>
      {o.requiresManualPrice && o.printSubtotalSatang === null && (
        <p className="mt-2 text-sm text-warning-ink">ออเดอร์นี้ต้องกำหนดราคาเอง</p>
      )}
    </Card>
  );
}

function RejectModal({
  open,
  busy,
  refund,
  onClose,
  onReject,
}: {
  open: boolean;
  busy: boolean;
  refund: boolean;
  onClose: () => void;
  onReject: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const trimmed = reason.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={refund ? "ปฏิเสธและคืนเงินลูกค้า?" : "ปฏิเสธออเดอร์นี้?"}
      description="ลูกค้าจะเห็นเหตุผลนี้ ปฏิเสธแล้วย้อนกลับไม่ได้"
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() => {
              setTouched(true);
              if (trimmed) onReject(trimmed);
            }}
          >
            ยืนยันปฏิเสธ
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        {REJECT_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className={cx(
              "min-h-11 rounded-control px-3 text-sm ring-1",
              reason === r ? "bg-brand text-white ring-brand" : "ring-line hover:bg-brand-50",
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <Textarea
        label="เหตุผล"
        required
        className="mt-3"
        rows={2}
        maxLength={300}
        value={reason}
        error={touched && !trimmed ? "ต้องใส่เหตุผล" : undefined}
        onChange={(e) => setReason(e.target.value)}
      />
    </Modal>
  );
}

function EtaModal({
  open,
  busy,
  now,
  onClose,
  onSave,
}: {
  open: boolean;
  busy: boolean;
  now: Date;
  onClose: () => void;
  onSave: (body: { estimatedReadyAt: string; readyNote?: string }) => void;
}) {
  const [eta, setEta] = useState<EtaValue | null>(null);
  const [note, setNote] = useState("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="ปรับเวลาเสร็จ"
      description="ลูกค้าจะได้รับแจ้งเตือนเวลาใหม่"
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            loading={busy}
            disabled={!eta?.estimatedReadyAt}
            onClick={() =>
              eta?.estimatedReadyAt &&
              onSave({
                estimatedReadyAt: eta.estimatedReadyAt,
                ...(note.trim() ? { readyNote: note.trim() } : {}),
              })
            }
          >
            บันทึกและแจ้งลูกค้า
          </Button>
        </>
      }
    >
      {open && <EtaPicker value={eta} onChange={setEta} allowMinutes={false} now={now} />}
      <Textarea
        label="หมายเหตุ (ไม่บังคับ)"
        className="mt-3"
        rows={2}
        maxLength={200}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </Modal>
  );
}

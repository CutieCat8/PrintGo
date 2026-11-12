"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Button, Card, Input, Textarea, cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import {
  bangkokDate,
  bangkokIso,
  bangkokTime,
  bangkokWeekday,
  etaText,
  formatMinutes,
  nextBangkokDate,
} from "@/lib/client/format";
import { parseBahtToSatang } from "@/lib/client/money";
import type { ConfirmOrderBody, OrderDetail } from "@/lib/db/types";
import type { ShopHour } from "@/lib/client/types";

/** The ready-time choices of D19. Minutes count from payment; the rest are fixed times. */
type EtaChoice =
  | { kind: "minutes"; minutes: number }
  | { kind: "today_close" }
  | { kind: "tomorrow_noon" }
  | { kind: "custom" };

const MINUTE_OPTIONS = [
  { minutes: 15, label: "พร้อมรับเลย (~15 นาที)" },
  { minutes: 30, label: "30 นาที" },
  { minutes: 60, label: "1 ชม." },
  { minutes: 120, label: "2 ชม." },
];

export type EtaValue = { readyInMinutes?: number; estimatedReadyAt?: string };

/** The ready time to send, or null while incomplete. Pure, so the preview and submit agree. */
function resolveEta(
  choice: EtaChoice | null,
  custom: string,
  hours: ShopHour[] | undefined,
  now: Date,
): EtaValue | null {
  if (!choice) return null;
  if (choice.kind === "minutes") return { readyInMinutes: choice.minutes };
  const today = bangkokDate(now);
  if (choice.kind === "tomorrow_noon")
    return { estimatedReadyAt: bangkokIso(nextBangkokDate(today), "12:00") };
  if (choice.kind === "today_close") {
    const h = hours?.find((x) => x.weekday === bangkokWeekday(today));
    if (!h || h.isClosed) return null;
    return { estimatedReadyAt: bangkokIso(today, h.closeTime.slice(0, 5)) };
  }
  // datetime-local gives "2026-11-12T15:30", read as Bangkok time
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(custom);
  return m ? { estimatedReadyAt: bangkokIso(m[1], m[2]) } : null;
}

/** Fixed time outside the shop's opening hours (warning only, D19). */
function outsideHours(iso: string, hours: ShopHour[] | undefined): boolean {
  if (!hours?.length) return false;
  const d = new Date(iso);
  const date = bangkokDate(d);
  const time = bangkokTime(d);
  const h = hours.find((x) => x.weekday === bangkokWeekday(date));
  if (!h || h.isClosed) return true;
  return time < h.openTime.slice(0, 5) || time > h.closeTime.slice(0, 5);
}

export function EtaPicker({
  value,
  onChange,
  allowMinutes,
  now,
}: {
  value: EtaValue | null;
  onChange: (v: EtaValue | null) => void;
  /** After payment only fixed times are possible (POST /eta takes estimatedReadyAt). */
  allowMinutes: boolean;
  now: Date;
}) {
  const hours = useSWR("shopHours", () => api.getShopHours());
  const [choice, setChoice] = useState<EtaChoice | null>(null);
  const [custom, setCustom] = useState("");

  const todayHours = hours.data?.find((x) => x.weekday === bangkokWeekday(bangkokDate(now)));
  const canToday =
    todayHours && !todayHours.isClosed && bangkokTime(now) < todayHours.closeTime.slice(0, 5);

  function pick(c: EtaChoice, customValue = custom) {
    setChoice(c);
    onChange(resolveEta(c, customValue, hours.data, now));
  }

  const chip = (selected: boolean) =>
    cx(
      "min-h-11 rounded-control px-3 text-sm font-medium ring-1",
      selected
        ? "bg-brand text-white ring-brand"
        : "bg-surface text-brand ring-line hover:bg-brand-50",
    );

  const preview = value
    ? etaText(
        {
          readyInMinutes: value.readyInMinutes ?? null,
          estimatedReadyAt: value.estimatedReadyAt ?? null,
        },
        now,
      )
    : null;
  const warn = value?.estimatedReadyAt && outsideHours(value.estimatedReadyAt, hours.data);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">
        เวลาเสร็จประมาณ <span className="text-danger">*</span>
      </legend>
      {allowMinutes && (
        <>
          <p className="text-sm text-ink-muted">นับจากตอนลูกค้าชำระเงิน</p>
          <div className="flex flex-wrap gap-2">
            {MINUTE_OPTIONS.map((o) => (
              <button
                key={o.minutes}
                type="button"
                aria-pressed={choice?.kind === "minutes" && choice.minutes === o.minutes}
                className={chip(choice?.kind === "minutes" && choice.minutes === o.minutes)}
                onClick={() => pick({ kind: "minutes", minutes: o.minutes })}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-sm text-ink-muted">หรือเวลาตายตัว</p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {canToday && (
          <button
            type="button"
            aria-pressed={choice?.kind === "today_close"}
            className={chip(choice?.kind === "today_close")}
            onClick={() => pick({ kind: "today_close" })}
          >
            วันนี้ก่อนร้านปิด ({todayHours!.closeTime.slice(0, 5)})
          </button>
        )}
        <button
          type="button"
          aria-pressed={choice?.kind === "tomorrow_noon"}
          className={chip(choice?.kind === "tomorrow_noon")}
          onClick={() => pick({ kind: "tomorrow_noon" })}
        >
          พรุ่งนี้ 12:00
        </button>
        <button
          type="button"
          aria-pressed={choice?.kind === "custom"}
          className={chip(choice?.kind === "custom")}
          onClick={() => pick({ kind: "custom" })}
        >
          กำหนดเอง
        </button>
      </div>
      {choice?.kind === "custom" && (
        <Input
          label="วันและเวลา (เวลาไทย)"
          type="datetime-local"
          value={custom}
          min={`${bangkokDate(now)}T${bangkokTime(now)}`}
          onChange={(e) => {
            setCustom(e.target.value);
            pick({ kind: "custom" }, e.target.value);
          }}
        />
      )}
      {preview && (
        <p className="rounded-control bg-brand-50 px-3 py-2 text-sm text-brand">
          ลูกค้าจะเห็น: <span className="font-semibold">{preview}</span>
        </p>
      )}
      {warn && (
        <p className="rounded-control bg-warning-50 px-3 py-2 text-sm text-warning-ink">
          ⚠️ เวลานี้อยู่นอกเวลาเปิดร้าน ตรวจสอบอีกครั้ง (ยังยืนยันได้)
        </p>
      )}
    </fieldset>
  );
}

/** Submitted order: shop sets the price (required for manual price) and the ready time. */
export function ConfirmPanel({
  order: o,
  now,
  onConfirm,
  onReject,
  busy,
}: {
  order: OrderDetail;
  now: Date;
  onConfirm: (body: ConfirmOrderBody) => void;
  onReject: () => void;
  busy: boolean;
}) {
  const [priceText, setPriceText] = useState("");
  const [eta, setEta] = useState<EtaValue | null>(null);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const manual = o.requiresManualPrice;
  const price = priceText.trim() ? parseBahtToSatang(priceText) : null;
  const priceError = useMemo(() => {
    if (priceText.trim() && (price === null || price <= 0))
      return "กรอกราคาเป็นบาท เช่น 120 หรือ 99.50";
    if (manual && !priceText.trim()) return "ออเดอร์นี้ต้องกรอกราคาเอง";
    return undefined;
  }, [priceText, price, manual]);

  const ready = !priceError && eta !== null;

  function submit() {
    setTouched(true);
    if (!ready || !eta) return;
    onConfirm({
      ...(price !== null ? { printSubtotalSatang: price } : {}),
      ...eta,
      ...(note.trim() ? { readyNote: note.trim() } : {}),
    });
  }

  return (
    <Card className="ring-2 ring-accent-ink">
      <h2 className="text-lg font-semibold text-brand">ยืนยันราคาและเวลาเสร็จ</h2>
      {manual && (
        <p className="mt-2 rounded-control bg-warning-50 px-3 py-2 text-sm text-warning-ink">
          ออเดอร์นี้เข้าเงื่อนไขส่วนลดหรือมีบริการที่ราคาตามตกลง กรุณากำหนดราคาเอง
        </p>
      )}
      <div className="mt-3 flex flex-col gap-4">
        <Input
          label="ราคาที่ร้านยืนยัน (บาท) — ค่าปริ้นรวมบริการเสริม"
          inputMode="decimal"
          required={manual}
          placeholder={manual ? "เช่น 250" : "เว้นว่าง = ใช้ราคาประเมินของระบบ"}
          value={priceText}
          error={touched || priceText ? priceError : undefined}
          onChange={(e) => setPriceText(e.target.value)}
        />
        <EtaPicker value={eta} onChange={setEta} allowMinutes now={now} />
        <Textarea
          label="หมายเหตุเวลาเสร็จ (ไม่บังคับ)"
          rows={2}
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {eta?.readyInMinutes && (
          <p className="text-sm text-ink-muted">
            เวลาเสร็จจะนับ {formatMinutes(eta.readyInMinutes)} จากตอนลูกค้าชำระเงิน
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={busy} onClick={onReject}>
            ปฏิเสธ
          </Button>
          <Button loading={busy} disabled={!ready || busy} onClick={submit}>
            ยืนยันราคา
          </Button>
        </div>
        {!eta && (
          <p className="text-center text-sm text-ink-muted">เลือกเวลาเสร็จก่อนจึงยืนยันได้</p>
        )}
      </div>
    </Card>
  );
}

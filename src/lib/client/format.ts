import type { ColorMode, Order, Paper, ServiceUnit, Sides } from "@/lib/db/types";

/** Display text and Thai time. All times shown in Asia/Bangkok, whatever the device clock zone. */

export const TZ = "Asia/Bangkok";

export const COLOR_LABEL: Record<ColorMode, string> = { bw: "ขาวดำ", color: "สี" };
export const PAPER_LABEL: Record<Paper, string> = { A4: "A4", A3: "A3" };
export const SIDES_LABEL: Record<Sides, string> = { single: "ด้านเดียว", double: "สองด้าน" };
export const UNIT_LABEL: Record<ServiceUnit, string> = { per_set: "ชุด", per_order: "ออเดอร์" };

export function fileSettingsText(f: {
  color: ColorMode;
  paper: Paper;
  sides: Sides;
  copies: number;
  pageCount?: number | null;
}) {
  const parts = [COLOR_LABEL[f.color], PAPER_LABEL[f.paper], SIDES_LABEL[f.sides]];
  if (f.pageCount) parts.unshift(`${f.pageCount} หน้า`);
  parts.push(`${f.copies} ชุด`);
  return parts.join(" · ");
}

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

/** "14:05" */
export function formatTime(iso: string | Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** "วันนี้ 14:05" · "พรุ่งนี้ 12:00" · "เมื่อวาน 09:10" · "12 พ.ย. 14:05" */
export function formatDayTime(iso: string | Date, now = new Date()): string {
  const d = new Date(iso);
  const day = dayKey(d);
  const oneDay = 86_400_000;
  const time = formatTime(d);
  if (day === dayKey(now)) return `วันนี้ ${time}`;
  if (day === dayKey(new Date(now.getTime() + oneDay))) return `พรุ่งนี้ ${time}`;
  if (day === dayKey(new Date(now.getTime() - oneDay))) return `เมื่อวาน ${time}`;
  const date = new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
  }).format(d);
  return `${date} ${time}`;
}

/** "3:07" for a countdown, "0:00" when past. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** "15 นาที" · "1 ชม." · "1 ชม. 30 นาที" */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} นาที`;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

/**
 * Ready-time text (D19), or null if the shop has not set one yet.
 * Fixed time / after payment: "เสร็จประมาณ พรุ่งนี้ 12:00 น." · countdown before payment:
 * "เสร็จประมาณ 15 นาทีหลังชำระเงิน".
 */
export function etaText(
  o: Pick<Order, "estimatedReadyAt" | "readyInMinutes">,
  now = new Date(),
): string | null {
  if (o.estimatedReadyAt) return `เสร็จประมาณ ${formatDayTime(o.estimatedReadyAt, now)} น.`;
  if (o.readyInMinutes) return `เสร็จประมาณ ${formatMinutes(o.readyInMinutes)}หลังชำระเงิน`;
  return null;
}

/** Thai mobile/landline: digits only, 9-10 digits starting with 0. */
export function isThaiPhone(text: string): boolean {
  return /^0\d{8,9}$/.test(text.replace(/[\s-]/g, ""));
}

// --- Bangkok wall-clock helpers (Thailand has no DST: always +07:00) -------------------------

/** "2026-11-12" in Bangkok for this instant. */
export function bangkokDate(d: Date): string {
  return dayKey(d);
}

/** Bangkok date + "HH:mm" -> ISO instant with offset, e.g. "2026-11-12T12:00:00+07:00". */
export function bangkokIso(date: string, time: string): string {
  return `${date}T${time}:00+07:00`;
}

/** 0 = Sunday ... 6 = Saturday, for a Bangkok date. */
export function bangkokWeekday(date: string): number {
  return new Date(`${date}T12:00:00+07:00`).getUTCDay();
}

/** Bangkok date one day after `date`. */
export function nextBangkokDate(date: string): string {
  return bangkokDate(new Date(new Date(`${date}T12:00:00+07:00`).getTime() + 86_400_000));
}

/** "HH:mm" in Bangkok for an instant. */
export function bangkokTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

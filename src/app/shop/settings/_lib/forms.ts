import type { Shop, ShopService } from "@/lib/db/types";
import type {
  ShopHour,
  ShopPricing,
  ShopProfileRequest,
  ShopServiceCreateRequest,
} from "@/lib/client/types";
import { formatBaht, parseBahtToSatang } from "@/lib/client/money";
import { isApiClientError } from "@/lib/client/http";

export type FieldErrors = Record<string, string>;
export class FormProblem extends Error {
  constructor(readonly fields: FieldErrors) {
    super("กรุณาตรวจสอบข้อมูลที่กรอก");
  }
}
function check(errors: FieldErrors) {
  if (Object.keys(errors).length) throw new FormProblem(errors);
}
export function errorsFrom(
  error: unknown,
  pathMap: (path: string) => string = (path) => path,
): FieldErrors {
  if (error instanceof FormProblem) return error.fields;
  if (isApiClientError(error)) {
    const errors: FieldErrors = {};
    const issues = error.details.issues;
    if (Array.isArray(issues))
      for (const issue of issues) {
        if (typeof issue?.path === "string" && typeof issue.message === "string")
          errors[pathMap(issue.path) || "_form"] = issue.message;
      }
    return Object.keys(errors).length ? errors : { _form: error.message };
  }
  return { _form: "บันทึกไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่" };
}
function integer(text: string, min: number, max: number, key: string, errors: FieldErrors) {
  const value = Number(text);
  if (!/^[0-9]+$/.test(text.trim()) || !Number.isSafeInteger(value) || value < min || value > max)
    errors[key] = `กรอกจำนวนเต็มตั้งแต่ ${min} ถึง ${max}`;
  return value;
}
/** All settings money enters through Yuri's one integer-satang parser. */
function money(text: string, max: number, key: string, errors: FieldErrors) {
  const valid = /^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]{1,2})?$/.test(text.trim());
  const value = valid ? parseBahtToSatang(text) : null;
  if (value === null || value <= 0 || value > max)
    errors[key] = `กรอกราคามากกว่า 0 ไม่เกิน ${formatBaht(max)} บาท และทศนิยมไม่เกิน 2 ตำแหน่ง`;
  return value ?? 0;
}

export type ProfileDraft = {
  name: string;
  phone: string;
  address: string;
  lat: string;
  lng: string;
  acceptsDelivery: boolean;
  cutoffMinutes: string;
  isPaused: boolean;
};
export function profileDraft(shop: Shop): ProfileDraft {
  return {
    name: shop.name,
    phone: shop.phone,
    address: shop.address,
    lat: String(shop.lat),
    lng: String(shop.lng),
    acceptsDelivery: shop.acceptsDelivery,
    cutoffMinutes: String(shop.cutoffMinutes),
    isPaused: shop.isPaused,
  };
}
/** An untouched pause field must follow the shared header switch, not the initial form. */
export function profileWithPause(
  draft: ProfileDraft,
  latestPaused: boolean,
  editedPause: boolean | null,
): ProfileDraft {
  return { ...draft, isPaused: editedPause ?? latestPaused };
}
export function profileBody(draft: ProfileDraft): ShopProfileRequest {
  const errors: FieldErrors = {};
  const name = draft.name.trim();
  const address = draft.address.trim();
  if (!name || name.length > 80) errors.name = "ชื่อร้านต้องยาว 1–80 ตัวอักษร";
  if (!address || address.length > 300) errors.address = "ที่อยู่ต้องยาว 1–300 ตัวอักษร";
  let phone = draft.phone.replace(/[\s\-().]/g, "");
  if (phone.startsWith("+66")) phone = `0${phone.slice(3)}`;
  else if (/^66\d{8,9}$/.test(phone)) phone = `0${phone.slice(2)}`;
  if (!/^0\d{8,9}$/.test(phone)) errors.phone = "เบอร์โทรต้องเป็นเบอร์ไทย 9–10 หลัก";
  const coordinate = (text: string, max: number, key: string) => {
    const value = Number(text);
    if (
      !/^-?[0-9]+(?:\.[0-9]+)?$/.test(text.trim()) ||
      !Number.isFinite(value) ||
      value < -max ||
      value > max
    )
      errors[key] = `กรอกพิกัดตั้งแต่ -${max} ถึง ${max}`;
    return value;
  };
  const lat = coordinate(draft.lat, 90, "lat");
  const lng = coordinate(draft.lng, 180, "lng");
  const cutoffMinutes = integer(draft.cutoffMinutes, 0, 240, "cutoffMinutes", errors);
  check(errors);
  return {
    name,
    phone,
    address,
    lat,
    lng,
    cutoffMinutes,
    acceptsDelivery: draft.acceptsDelivery,
    isPaused: draft.isPaused,
  };
}

export function hoursDraft(rows: ShopHour[]): ShopHour[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    const row = rows.find((r) => r.weekday === weekday);
    return row
      ? { ...row, openTime: row.openTime.slice(0, 5), closeTime: row.closeTime.slice(0, 5) }
      : { weekday, openTime: "", closeTime: "", isClosed: true };
  });
}
export function hoursBody(draft: ShopHour[]): ShopHour[] {
  const errors: FieldErrors = {};
  if (
    draft.length !== 7 ||
    new Set(draft.map((row) => row.weekday)).size !== 7 ||
    draft.some((row) => !Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6)
  )
    throw new FormProblem({ _form: "ต้องตั้งเวลาครบทั้ง 7 วัน" });
  const rows = draft.map((row, index) => {
    const openTime = row.openTime || (row.isClosed ? "00:00" : "");
    const closeTime = row.closeTime || (row.isClosed ? "00:00" : "");
    if (!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(openTime))
      errors[`${index}.openTime`] = "กรอกเวลาเปิดเป็น HH:mm";
    if (!/^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/.test(closeTime))
      errors[`${index}.closeTime`] = "กรอกเวลาปิดเป็น HH:mm (24:00 ได้)";
    if (!row.isClosed && closeTime <= openTime)
      errors[`${index}.closeTime`] = "เวลาปิดต้องหลังเวลาเปิด ไม่ข้ามเที่ยงคืน";
    return { ...row, openTime, closeTime };
  });
  check(errors);
  return rows;
}
export function copyHours(rows: ShopHour[], index: number): ShopHour[] {
  return rows.map((row) => ({ ...rows[index], weekday: row.weekday }));
}

export const PRICE_COMBINATIONS = (["bw", "color"] as const).flatMap((color) =>
  (["A4", "A3"] as const).flatMap((paper) =>
    (["single", "double"] as const).map((sides) => ({ color, paper, sides })),
  ),
);
export const priceKey = (rule: { color: string; paper: string; sides: string }) =>
  `${rule.color}-${rule.paper}-${rule.sides}`;
export type PricingDraft = {
  prices: Record<string, string>;
  tiers: { minPages: string; note: string }[];
};
export function pricingDraft(body: ShopPricing): PricingDraft {
  return {
    prices: Object.fromEntries(
      PRICE_COMBINATIONS.map((combo) => {
        const rule = body.rules.find((r) => priceKey(r) === priceKey(combo));
        return [priceKey(combo), rule ? formatBaht(rule.pricePerPageSatang) : ""];
      }),
    ),
    tiers: body.tiers.map((t) => ({ minPages: String(t.minPages), note: t.note ?? "" })),
  };
}
export function pricingBody(draft: PricingDraft): ShopPricing {
  const errors: FieldErrors = {};
  const rules = PRICE_COMBINATIONS.flatMap((combo) => {
    const key = priceKey(combo);
    const text = draft.prices[key] ?? "";
    return text.trim()
      ? [{ ...combo, pricePerPageSatang: money(text, 10000, `prices.${key}`, errors) }]
      : [];
  });
  if (draft.tiers.length > 20) errors._form = "เพิ่มส่วนลดได้ไม่เกิน 20 ขั้น";
  const seen = new Set<number>();
  const tiers = draft.tiers.map((tier, index) => {
    const minPages = integer(tier.minPages, 1, 1000000, `tiers.${index}.minPages`, errors);
    if (seen.has(minPages)) errors[`tiers.${index}.minPages`] = "จำนวนหน้าขั้นต่ำซ้ำกับรายการอื่น";
    seen.add(minPages);
    const note = tier.note.trim();
    if (note.length > 200) errors[`tiers.${index}.note`] = "หมายเหตุยาวเกิน 200 ตัวอักษร";
    return { minPages, note: note || null };
  });
  check(errors);
  return { rules, tiers };
}
export function pricingErrorPath(body: ShopPricing, path: string): string {
  const match = /^rules\.([0-9]+)\.pricePerPageSatang$/.exec(path);
  return match && body.rules[Number(match[1])]
    ? `prices.${priceKey(body.rules[Number(match[1])])}`
    : path;
}

export type ServiceDraft = {
  name: string;
  priceBaht: string;
  negotiated: boolean;
  unit: "per_set" | "per_order";
};
export function serviceDraft(service?: ShopService): ServiceDraft {
  return {
    name: service?.name ?? "",
    priceBaht: service?.priceSatang == null ? "" : formatBaht(service.priceSatang),
    negotiated: !!service && service.priceSatang === null,
    unit: service?.unit ?? "per_set",
  };
}
export function serviceBody(draft: ServiceDraft): ShopServiceCreateRequest {
  const errors: FieldErrors = {};
  const name = draft.name.trim();
  if (!name || name.length > 60) errors.name = "ชื่อบริการต้องยาว 1–60 ตัวอักษร";
  if (!["per_set", "per_order"].includes(draft.unit))
    errors.unit = "เลือกหน่วยต่อชุดหรือต่อออเดอร์";
  const priceSatang = draft.negotiated
    ? null
    : money(draft.priceBaht, 1000000, "priceBaht", errors);
  check(errors);
  return { name, priceSatang, unit: draft.unit };
}

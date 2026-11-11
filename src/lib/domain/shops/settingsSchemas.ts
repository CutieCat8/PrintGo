import { z } from "zod";
import { ENUMS } from "@/lib/db/enums";
import { normalizeThaiPhone } from "@/lib/domain/orders/schemas";

/**
 * Request bodies of the shop setup API (CONTRACTS 6.2, task P7). The shop id never appears here:
 * it comes from the session. Fields that are not listed (for example `status`) are dropped by Zod,
 * so a shop cannot set its own approval state.
 */
const lat = z
  .number("ต้องระบุละติจูด")
  .min(-90, "ละติจูดต้องอยู่ระหว่าง -90 ถึง 90")
  .max(90, "ละติจูดต้องอยู่ระหว่าง -90 ถึง 90");
const lng = z
  .number("ต้องระบุลองจิจูด")
  .min(-180, "ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180")
  .max(180, "ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180");

const thaiPhone = z.string("ต้องระบุเบอร์โทร").transform((raw, ctx) => {
  const phone = normalizeThaiPhone(raw);
  if (phone === null) ctx.addIssue({ code: "custom", message: "เบอร์โทรไม่ถูกต้อง (9–10 หลัก)" });
  return phone ?? raw;
});

const text = (label: string, max: number) =>
  z
    .string(`ต้องระบุ${label}`)
    .trim()
    .min(1, `ต้องระบุ${label}`)
    .max(max, `${label}ยาวเกิน ${max} ตัวอักษร`);

export const RegisterBody = z.object({
  name: text("ชื่อร้าน", 80),
  phone: thaiPhone,
  address: text("ที่อยู่", 300),
  lat,
  lng,
  acceptsDelivery: z.boolean("ต้องระบุว่ารับจัดส่งหรือไม่"),
});
export type RegisterBody = z.infer<typeof RegisterBody>;

/** Minutes before closing when the shop stops taking new jobs (default 30). */
export const MAX_CUTOFF_MINUTES = 240;

export const ProfileBody = RegisterBody.extend({
  cutoffMinutes: z
    .number("ต้องระบุเวลาตัดรับงาน")
    .int("เวลาตัดรับงานต้องเป็นจำนวนเต็ม")
    .min(0, "เวลาตัดรับงานต้องไม่ติดลบ")
    .max(MAX_CUTOFF_MINUTES, `เวลาตัดรับงานสูงสุด ${MAX_CUTOFF_MINUTES} นาที`),
  isPaused: z.boolean("ต้องระบุว่าพักรับงานหรือไม่"),
});
export type ProfileBody = z.infer<typeof ProfileBody>;

// ---- opening hours -------------------------------------------------------------------------
const TIME = /^(?:([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?|24:00(?::00)?)$/;

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

/** "09:00:00" -> "09:00" (what the API shows). */
export const toHHmm = (time: string) => time.slice(0, 5);

const ColorMode = z.enum(ENUMS.ColorMode, "สีต้องเป็น bw หรือ color");
const Paper = z.enum(ENUMS.Paper, "กระดาษต้องเป็น A4 หรือ A3");
const Sides = z.enum(ENUMS.Sides, "ด้านต้องเป็น single หรือ double");
const ServiceUnit = z.enum(ENUMS.ServiceUnit, "หน่วยต้องเป็น per_set หรือ per_order");

const hourRow = z.object({
  weekday: z
    .number("ต้องระบุวัน")
    .int("วันต้องเป็นจำนวนเต็ม 0–6")
    .min(0, "วันต้องอยู่ระหว่าง 0–6")
    .max(6, "วันต้องอยู่ระหว่าง 0–6"),
  openTime: z.string("ต้องระบุเวลาเปิด").regex(TIME, "เวลาเปิดต้องเป็นรูปแบบ HH:mm"),
  closeTime: z.string("ต้องระบุเวลาปิด").regex(TIME, "เวลาปิดต้องเป็นรูปแบบ HH:mm (24:00 ได้)"),
  isClosed: z.boolean("ต้องระบุว่าปิดทั้งวันหรือไม่"),
});

/** 7 rows, one per weekday 0-6; a day that is open must close after it opens. */
export const HoursBody = z
  .array(hourRow, "ต้องส่งเวลาเปิด-ปิดครบ 7 วัน")
  .length(7, "ต้องส่งเวลาเปิด-ปิดครบ 7 วัน")
  .superRefine((rows, ctx) => {
    const days = new Set(rows.map((r) => r.weekday));
    if (days.size !== 7) {
      ctx.addIssue({ code: "custom", message: "วันซ้ำกันหรือไม่ครบ 7 วัน (0–6)" });
    }
    rows.forEach((r, i) => {
      if (r.openTime.startsWith("24:")) {
        ctx.addIssue({
          code: "custom",
          path: [i, "openTime"],
          message: "เวลาเปิดต้องไม่ใช่ 24:00",
        });
      }
      if (!r.isClosed && timeToMinutes(r.closeTime) <= timeToMinutes(r.openTime)) {
        ctx.addIssue({
          code: "custom",
          path: [i, "closeTime"],
          message: "เวลาปิดต้องหลังเวลาเปิด",
        });
      }
    });
  });
export type HoursBody = z.infer<typeof HoursBody>;

// ---- pricing -------------------------------------------------------------------------------
/** Sanity cap: at most 100.00 baht per page. */
export const MAX_PRICE_PER_PAGE_SATANG = 10_000;

const rule = z.object({
  color: ColorMode,
  paper: Paper,
  sides: Sides,
  pricePerPageSatang: z
    .number("ต้องระบุราคาต่อหน้า")
    .int("ราคาต้องเป็นจำนวนเต็มสตางค์")
    .min(1, "ราคาต่อหน้าต้องมากกว่า 0")
    .max(MAX_PRICE_PER_PAGE_SATANG, "ราคาต่อหน้าสูงสุด 100 บาท"),
});

const tier = z.object({
  minPages: z
    .number("ต้องระบุจำนวนหน้า")
    .int("จำนวนหน้าต้องเป็นจำนวนเต็ม")
    .min(1, "จำนวนหน้าต้องไม่น้อยกว่า 1")
    .max(1_000_000, "จำนวนหน้าสูงสุด 1,000,000"),
  note: z
    .string("หมายเหตุต้องเป็นข้อความ")
    .trim()
    .max(200, "หมายเหตุยาวเกิน 200 ตัวอักษร")
    .nullish()
    .transform((n) => (n === undefined || n === null || n === "" ? null : n)),
});

export const PricingBody = z
  .object({
    rules: z.array(rule, "ต้องส่งรายการราคา").max(8, "รายการราคามีได้ไม่เกิน 8 ชุด"),
    tiers: z.array(tier, "ต้องส่งรายการส่วนลด").max(20, "รายการส่วนลดมีได้ไม่เกิน 20 ขั้น"),
  })
  .superRefine((body, ctx) => {
    const combos = body.rules.map((r) => `${r.color}/${r.paper}/${r.sides}`);
    if (new Set(combos).size !== combos.length) {
      ctx.addIssue({ code: "custom", path: ["rules"], message: "มีชุดสี/กระดาษ/ด้านซ้ำกัน" });
    }
    const pages = body.tiers.map((t) => t.minPages);
    if (new Set(pages).size !== pages.length) {
      ctx.addIssue({ code: "custom", path: ["tiers"], message: "มีจำนวนหน้าขั้นต่ำซ้ำกัน" });
    }
  });
export type PricingBody = z.infer<typeof PricingBody>;

// ---- extra services (D22) ------------------------------------------------------------------
export const MAX_SERVICES_PER_SHOP = 20;
export const MAX_SERVICE_PRICE_SATANG = 1_000_000;

const serviceFields = {
  name: text("ชื่อบริการ", 60),
  priceSatang: z
    .number("ราคาต้องเป็นตัวเลขหรือ null (ราคาตามตกลง)")
    .int("ราคาต้องเป็นจำนวนเต็มสตางค์")
    .min(1, "ราคาต้องมากกว่า 0")
    .max(MAX_SERVICE_PRICE_SATANG, "ราคาสูงสุด 10,000 บาท")
    .nullable(),
  unit: ServiceUnit,
};

export const ServiceCreateBody = z.object(serviceFields);
export const ServiceUpdateBody = z.object({
  ...serviceFields,
  isActive: z.boolean("ต้องระบุว่าเปิดใช้งานหรือไม่"),
  sortOrder: z
    .number("ต้องระบุลำดับ")
    .int("ลำดับต้องเป็นจำนวนเต็ม")
    .min(0, "ลำดับต้องไม่ติดลบ")
    .max(9999, "ลำดับสูงสุด 9999"),
});
export type ServiceCreateBody = z.infer<typeof ServiceCreateBody>;
export type ServiceUpdateBody = z.infer<typeof ServiceUpdateBody>;

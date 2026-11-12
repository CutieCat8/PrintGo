import { z } from "zod";
import { ColorMode, Fulfillment, Paper, Sides } from "@/lib/db/enums";
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES, MAX_FILES_PER_ORDER } from "@/lib/domain/files/paths";

/**
 * Request bodies of CONTRACTS 6.1 for estimate and create-order. Money never appears here:
 * prices, totals and status are always worked out on the server (CLAUDE.md).
 * The limits that are not in the contract (pages, copies, text lengths) follow the database
 * checks (copies 1-99, note 500) or are generous sanity caps.
 */
const MAX_PAGES_PER_FILE = 10_000;

const fileSetting = {
  pageCount: z.number().int().min(1, "จำนวนหน้าต้องไม่น้อยกว่า 1").max(MAX_PAGES_PER_FILE),
  color: ColorMode,
  paper: Paper,
  sides: Sides,
  copies: z.number().int().min(1, "จำนวนชุดต้องไม่น้อยกว่า 1").max(99, "จำนวนชุดสูงสุด 99"),
};

const selectedService = z.object({
  serviceId: z.uuid(),
  fileIndexes: z.array(z.number().int().min(0)).max(MAX_FILES_PER_ORDER).optional(),
});
const services = z.array(selectedService).max(20).optional();

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

/** Basic Thai phone number: 0 + 8 or 9 digits. Accepts spaces, dashes and +66; stores 0xxxxxxxxx. */
export function normalizeThaiPhone(raw: string): string | null {
  let digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+66")) digits = `0${digits.slice(3)}`;
  else if (/^66\d{8,9}$/.test(digits)) digits = `0${digits.slice(2)}`;
  return /^0\d{8,9}$/.test(digits) ? digits : null;
}

export const EstimateBody = z
  .object({
    shopId: z.uuid(),
    fulfillment: Fulfillment,
    deliveryLat: lat.optional(),
    deliveryLng: lng.optional(),
    files: z.array(z.object(fileSetting)).min(1, "ต้องมีอย่างน้อย 1 ไฟล์").max(MAX_FILES_PER_ORDER),
    services,
  })
  .superRefine((body, ctx) => {
    if (
      body.fulfillment === "delivery" &&
      (body.deliveryLat === undefined || body.deliveryLng === undefined)
    ) {
      ctx.addIssue({ code: "custom", path: ["deliveryLat"], message: "ต้องระบุพิกัดจัดส่ง" });
    }
  });
export type EstimateBody = z.infer<typeof EstimateBody>;

const text = (max: number, label: string) =>
  z.string().trim().min(1, `ต้องระบุ${label}`).max(max, `${label}ยาวเกินไป`);

export const CreateOrderBody = z
  .object({
    shopId: z.uuid(),
    fulfillment: Fulfillment,
    deliveryAddress: text(300, "ที่อยู่จัดส่ง").optional(),
    deliveryLat: lat.optional(),
    deliveryLng: lng.optional(),
    deliveryRecipientName: text(100, "ชื่อผู้รับ").optional(),
    deliveryRecipientPhone: z.string().optional(),
    customerNote: z
      .string()
      .trim()
      .max(500, "หมายเหตุยาวเกิน 500 ตัวอักษร")
      .transform((s) => (s === "" ? undefined : s))
      .optional(),
    files: z
      .array(
        z.object({
          path: z.string().min(1).max(500),
          originalName: z.string().min(1).max(255),
          mime: z.enum(ALLOWED_MIME_TYPES),
          sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
          ...fileSetting,
        }),
      )
      .min(1, "ต้องมีอย่างน้อย 1 ไฟล์")
      .max(MAX_FILES_PER_ORDER),
    services,
  })
  .superRefine((body, ctx) => {
    const need = (ok: boolean, field: string, message: string) => {
      if (!ok) ctx.addIssue({ code: "custom", path: [field], message });
    };
    if (body.fulfillment === "delivery") {
      need(body.deliveryAddress !== undefined, "deliveryAddress", "ต้องระบุที่อยู่จัดส่ง");
      need(
        body.deliveryLat !== undefined && body.deliveryLng !== undefined,
        "deliveryLat",
        "ต้องระบุพิกัดจัดส่ง",
      );
      need(body.deliveryRecipientName !== undefined, "deliveryRecipientName", "ต้องระบุชื่อผู้รับ");
      need(
        body.deliveryRecipientPhone !== undefined &&
          normalizeThaiPhone(body.deliveryRecipientPhone) !== null,
        "deliveryRecipientPhone",
        "เบอร์โทรผู้รับไม่ถูกต้อง",
      );
    }
    const paths = body.files.map((f) => f.path);
    need(new Set(paths).size === paths.length, "files", "มีไฟล์ซ้ำกัน");
  });
export type CreateOrderBody = z.infer<typeof CreateOrderBody>;

import type { Order, OrderDetail, OrderStatus } from "@/lib/db/types";

/** Pure helpers for order screens (tested in orders.test.ts). */

export type StepState = "done" | "current" | "upcoming" | "failed";
export type Step = { key: string; title: string; state: StepState };

const PICKUP_STEPS: [OrderStatus, string][] = [
  ["submitted", "รอร้านยืนยัน"],
  ["awaiting_payment", "รอชำระเงิน"],
  ["paid", "ชำระเงินแล้ว"],
  ["printing", "กำลังปริ้น"],
  ["ready", "พร้อมรับที่ร้าน"],
  ["completed", "รับงานแล้ว"],
];

const DELIVERY_STEPS: [OrderStatus, string][] = [
  ["submitted", "รอร้านยืนยัน"],
  ["awaiting_payment", "รอชำระเงิน"],
  ["paid", "ชำระเงินแล้ว"],
  ["printing", "กำลังปริ้น"],
  ["ready", "พร้อมส่ง"],
  ["courier_requested", "กำลังหาไรเดอร์"],
  ["in_transit", "กำลังจัดส่ง"],
  ["completed", "ส่งถึงแล้ว"],
];

const STOPPED: Partial<Record<OrderStatus, string>> = {
  rejected: "ร้านปฏิเสธ",
  cancelled: "ยกเลิกแล้ว",
  expired: "หมดเวลา",
};

/**
 * Timeline steps for an order. A rejected/cancelled/expired order shows where it stopped:
 * after a verified payment -> at "printing"; with a payment deadline -> at "awaiting_payment";
 * otherwise at "submitted".
 */
export function orderSteps(
  o: Pick<OrderDetail, "status" | "fulfillment" | "paymentDeadline"> & {
    payment: Pick<NonNullable<OrderDetail["payment"]>, "status"> | null;
  },
): Step[] {
  const flow = o.fulfillment === "delivery" ? DELIVERY_STEPS : PICKUP_STEPS;
  const stopTitle = STOPPED[o.status];

  if (stopTitle) {
    const stopAt =
      o.payment?.status === "verified"
        ? "printing"
        : o.paymentDeadline
          ? "awaiting_payment"
          : "submitted";
    const idx = flow.findIndex(([s]) => s === stopAt);
    return flow
      .slice(0, idx + 1)
      .map(([key, title], i) =>
        i < idx ? { key, title, state: "done" } : { key, title: stopTitle, state: "failed" },
      );
  }

  const current = flow.findIndex(([s]) => s === o.status);
  return flow.map(([key, title], i) => ({
    key,
    title,
    state:
      o.status === "completed" || i < current ? "done" : i === current ? "current" : "upcoming",
  }));
}

export type MoneyLine = { label: string; satang: number | null; note?: string };

/**
 * What the customer sees as the price.
 * - Shop has confirmed (printSubtotalSatang set): only the shop's price (API.md §5 #18), which
 *   already includes the extra services.
 * - Not confirmed and manual price: no numbers at all (CLAUDE.md rule 7).
 * - Otherwise: the system estimate.
 * Returns null when nothing should be shown.
 */
export function customerMoney(
  o: Pick<
    Order,
    | "requiresManualPrice"
    | "estimatedPrintSatang"
    | "estimatedServicesSatang"
    | "printSubtotalSatang"
    | "platformFeeSatang"
    | "deliveryFeeSatang"
    | "totalSatang"
    | "fulfillment"
  >,
): { lines: MoneyLine[]; total: number | null; estimate: boolean } | null {
  const delivery: MoneyLine[] =
    o.fulfillment === "delivery" && o.deliveryFeeSatang !== null
      ? [{ label: "ค่าส่ง", satang: o.deliveryFeeSatang, note: "ค่าประมาณ" }]
      : [];

  if (o.printSubtotalSatang !== null) {
    return {
      lines: [
        { label: "ค่าปริ้นและบริการเสริม", satang: o.printSubtotalSatang },
        { label: "ค่าบริการ", satang: o.platformFeeSatang },
        ...delivery,
      ],
      total: o.totalSatang,
      estimate: false,
    };
  }

  if (o.requiresManualPrice || o.estimatedPrintSatang === null) return null;

  const lines: MoneyLine[] = [{ label: "ค่าปริ้น", satang: o.estimatedPrintSatang }];
  if (o.estimatedServicesSatang)
    lines.push({ label: "บริการเสริม", satang: o.estimatedServicesSatang });
  if (o.platformFeeSatang !== null) lines.push({ label: "ค่าบริการ", satang: o.platformFeeSatang });
  return { lines: [...lines, ...delivery], total: o.totalSatang, estimate: true };
}

/** Customer may cancel only before paying (D19). */
export function customerCanCancel(status: OrderStatus): boolean {
  return status === "submitted" || status === "awaiting_payment";
}

export type OrderProblem = {
  message: string;
  /** The customer should pick another shop (closed, paused, or this shop cannot print a file). */
  pickAnotherShop: boolean;
  /** Index of the file the problem is about, when the API says so. */
  fileIndex: number | null;
};

const COLOR_TEXT: Record<string, string> = { bw: "ขาวดำ", color: "สี" };
const SIDES_TEXT: Record<string, string> = { single: "ด้านเดียว", double: "สองด้าน" };

/**
 * Thai explanation of an /estimate or /orders failure, naming the file when the API gives
 * `details.fileIndex` (pricing/estimate.ts: "ร้านนี้ไม่รับงานชุดค่านี้" + color/paper/sides).
 */
export function describeOrderProblem(
  err: { code: string; message: string; details: Record<string, unknown> },
  fileNames: string[],
): OrderProblem {
  if (err.code === "SHOP_CLOSED" || err.code === "SHOP_PAUSED") {
    return { message: err.message, pickAnotherShop: true, fileIndex: null };
  }
  const d = err.details;
  const fileIndex =
    typeof d.fileIndex === "number" && Number.isInteger(d.fileIndex) ? d.fileIndex : null;
  if (err.code !== "VALIDATION_ERROR" || fileIndex === null) {
    return { message: err.message, pickAnotherShop: false, fileIndex: null };
  }

  const name = fileNames[fileIndex] ?? `ไฟล์ที่ ${fileIndex + 1}`;
  const unsupported = typeof d.color === "string" && typeof d.paper === "string";
  if (unsupported) {
    const setting = [COLOR_TEXT[d.color as string], d.paper, SIDES_TEXT[d.sides as string]]
      .filter(Boolean)
      .join(" ");
    return {
      message: `ร้านนี้ไม่รับงานแบบ ${setting} (ไฟล์ "${name}") กรุณาเลือกร้านอื่น หรือเปลี่ยนการตั้งค่าไฟล์นี้`,
      pickAnotherShop: true,
      fileIndex,
    };
  }
  return { message: `${err.message} (ไฟล์ "${name}")`, pickAnotherShop: false, fileIndex };
}

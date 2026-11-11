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

import type { Fulfillment, OrderStatus } from "@/lib/db/enums";

/** The one place that maps order statuses to Thai text and colours. Pages must not hard-code these. */
export type StatusTone =
  "amber" | "orange" | "blue" | "navy" | "teal" | "violet" | "green" | "red" | "gray";

type StatusInfo = { label: string; tone: StatusTone };

export const ORDER_STATUS_INFO: Record<OrderStatus, StatusInfo> = {
  submitted: { label: "รอร้านยืนยัน", tone: "amber" },
  awaiting_payment: { label: "รอชำระเงิน", tone: "orange" },
  paid: { label: "ชำระแล้ว", tone: "blue" },
  printing: { label: "กำลังปริ้น", tone: "navy" },
  ready: { label: "พร้อมรับ/พร้อมส่ง", tone: "teal" },
  courier_requested: { label: "กำลังหาไรเดอร์", tone: "violet" },
  in_transit: { label: "กำลังจัดส่ง", tone: "violet" },
  completed: { label: "เสร็จสิ้น", tone: "green" },
  rejected: { label: "ร้านปฏิเสธ", tone: "red" },
  cancelled: { label: "ยกเลิก", tone: "gray" },
  expired: { label: "หมดเวลา", tone: "gray" },
};

/** Thai label for a status. `ready` gets a precise label when the fulfillment is known. */
export function orderStatusLabel(status: OrderStatus, fulfillment?: Fulfillment): string {
  if (status === "ready" && fulfillment === "pickup") return "พร้อมรับ";
  if (status === "ready" && fulfillment === "delivery") return "พร้อมส่ง";
  return ORDER_STATUS_INFO[status].label;
}

/** Light background + dark text: every pair is at least 4.5:1. */
export const TONE_CLASSES: Record<StatusTone, string> = {
  amber: "bg-amber-100 text-amber-900 ring-amber-300",
  orange: "bg-accent-100 text-accent-ink-hover ring-accent/40",
  blue: "bg-info-50 text-info-ink ring-blue-200",
  navy: "bg-brand-100 text-brand ring-brand-600/30",
  teal: "bg-teal-100 text-teal-900 ring-teal-300",
  violet: "bg-violet-100 text-violet-900 ring-violet-300",
  green: "bg-success-50 text-success-ink ring-green-300",
  red: "bg-danger-50 text-danger-hover ring-red-300",
  gray: "bg-gray-100 text-gray-700 ring-gray-300",
};

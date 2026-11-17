import type { ReactNode } from "react";
import type { Fulfillment, OrderStatus } from "@/lib/db/enums";
import { cx } from "./cx";
import {
  ORDER_STATUS_INFO,
  TONE_CLASSES,
  isHandedOffToDelivery,
  orderStatusLabel,
  type StatusTone,
} from "./status";

export function Badge({
  tone = "gray",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Order status in Thai with its colour. Pass `fulfillment` so `ready` reads "พร้อมรับ" or "พร้อมส่ง". */
export function StatusBadge({
  status,
  fulfillment,
  audience,
  label,
  className,
}: {
  status: OrderStatus;
  fulfillment?: Fulfillment;
  /** "shop": a delivery order after printing reads "ปริ้นเสร็จแล้ว" (the shop's job is done). */
  audience?: "shop";
  /** Replaces the text (e.g. the simulated rider stage on the customer's screen). */
  label?: string;
  className?: string;
}) {
  const handedOff = audience === "shop" && isHandedOffToDelivery(status, fulfillment);
  return (
    <Badge tone={handedOff ? "teal" : ORDER_STATUS_INFO[status].tone} className={className}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label ?? orderStatusLabel(status, fulfillment, audience)}
    </Badge>
  );
}

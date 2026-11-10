import type { ReactNode } from "react";
import type { Fulfillment, OrderStatus } from "@/lib/db/enums";
import { cx } from "./cx";
import { ORDER_STATUS_INFO, TONE_CLASSES, orderStatusLabel, type StatusTone } from "./status";

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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap ring-1 ring-inset",
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
  className,
}: {
  status: OrderStatus;
  fulfillment?: Fulfillment;
  className?: string;
}) {
  return (
    <Badge tone={ORDER_STATUS_INFO[status].tone} className={className}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {orderStatusLabel(status, fulfillment)}
    </Badge>
  );
}

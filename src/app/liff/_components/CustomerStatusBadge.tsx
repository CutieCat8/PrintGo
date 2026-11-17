"use client";

import { StatusBadge } from "@/components/ui";
import { RIDER_STAGES } from "@/lib/client/riderTracker";
import type { Fulfillment, OrderStatus } from "@/lib/db/types";
import { useRiderSimulation } from "./useRiderSimulation";

/**
 * Status badge for the customer. A delivery order that is out for delivery shows the simulated
 * rider stage, the same one the tracking card and progress list show, so every screen agrees.
 */
export function CustomerStatusBadge({
  orderId,
  status,
  fulfillment,
  now,
  className,
}: {
  orderId: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  now: Date;
  className?: string;
}) {
  const sim = useRiderSimulation(orderId, status, fulfillment, now);
  return (
    <StatusBadge
      status={status}
      fulfillment={fulfillment}
      label={sim ? RIDER_STAGES[sim.stage].title : undefined}
      className={className}
    />
  );
}

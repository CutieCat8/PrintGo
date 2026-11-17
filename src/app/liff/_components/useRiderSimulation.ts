import { riderStage, type RiderStage } from "@/lib/client/riderTracker";
import type { Fulfillment, OrderStatus } from "@/lib/db/types";

/** The simulation runs only for delivery orders that are out for delivery and not finished yet. */
export function riderSimulationActive(status: OrderStatus, fulfillment: Fulfillment): boolean {
  return fulfillment === "delivery" && (status === "courier_requested" || status === "in_transit");
}

/** When the simulation first ran for this order, kept per tab so a reload does not restart it. */
function startedAtFor(orderId: string, now: Date): number {
  const key = `printgo:rider-sim:${orderId}`;
  try {
    const saved = Number(sessionStorage.getItem(key));
    if (Number.isFinite(saved) && saved > 0) return saved;
    sessionStorage.setItem(key, String(now.getTime()));
  } catch {
    // storage blocked: the simulation simply restarts on reload
  }
  return now.getTime();
}

/**
 * Screen-only rider simulation shared by the tracking card, the progress list and the status
 * badge, so they always agree. Nothing is sent to the server: the real order status is untouched.
 * Returns null when it does not apply.
 */
export function useRiderSimulation(
  orderId: string,
  status: OrderStatus,
  fulfillment: Fulfillment,
  now: Date,
): { startedAt: number; stage: RiderStage } | null {
  if (!riderSimulationActive(status, fulfillment)) return null;
  const startedAt = startedAtFor(orderId, now);
  return { startedAt, stage: riderStage(status, now.getTime() - startedAt) };
}

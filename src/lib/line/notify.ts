/**
 * STUB. Task Z6 replaces the body with real LINE push messages.
 * Other modules may already call it; the signature is fixed by docs/CONTRACTS.md section 7.
 */
export const NOTIFY_EVENTS = [
  "quote_ready",
  "order_rejected",
  "order_expired",
  "order_cancelled",
  "payment_verified",
  "payment_rejected",
  "printing",
  "ready",
  "courier_requested",
  "in_transit",
  "completed",
  "chat_message",
  "eta_changed",
] as const;

export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export async function notify(orderId: string, event: NotifyEvent): Promise<void> {
  console.info(`[notify stub] ${event} -> order ${orderId}`);
}

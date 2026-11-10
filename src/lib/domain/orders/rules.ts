import type { Fulfillment, OrderStatus } from "@/lib/db/enums";
import type { NotifyEvent } from "@/lib/line/notify";

/**
 * The order state machine as data: one row per row of docs/CONTRACTS.md section 4.
 * Do not add, remove or change rows without asking the Tech Lead (CLAUDE.md section 1).
 * transition.ts is the only code that reads this table and writes `orders.status`.
 */
export type Actor = "customer" | "shop" | "admin" | "system";

export type Effect =
  | "confirm_quote" // set print subtotal, fee, total, payment deadline and the ready-time choice
  | "on_paid" // paid_at, pickup code, estimated_ready_at, settlement row
  | "set_completed_at"
  | "create_refund" // refunds row (pending); the amount is checked against total_satang
  | "create_delivery"; // createDeliveryForOrder (Z7)

export type PatchKey =
  "printSubtotalSatang" | "readyInMinutes" | "estimatedReadyAt" | "readyNote" | "rejectReason";

export type TransitionRule = {
  from: readonly OrderStatus[];
  to: OrderStatus;
  actors: readonly Actor[];
  /** Only these `patch` keys are accepted for this step; anything else is rejected. */
  patchKeys: readonly PatchKey[];
  /** `patch.rejectReason` must be a non-empty text. */
  requiresReason?: boolean;
  /** Only valid for this fulfillment. */
  fulfillment?: Fulfillment;
  effects: readonly Effect[];
  notify: NotifyEvent | null;
};

export const TERMINAL_STATUSES = ["completed", "rejected", "cancelled", "expired"] as const;

/** Every status that is not terminal: the order is still "open" (used for pickup-code uniqueness). */
export const ACTIVE_STATUSES = [
  "submitted",
  "awaiting_payment",
  "paid",
  "printing",
  "ready",
  "courier_requested",
  "in_transit",
] as const satisfies readonly OrderStatus[];

const AFTER_PAYMENT = ["paid", "printing", "ready", "courier_requested", "in_transit"] as const;

export const TRANSITIONS: readonly TransitionRule[] = [
  {
    from: ["submitted"],
    to: "awaiting_payment",
    actors: ["shop"],
    patchKeys: ["printSubtotalSatang", "readyInMinutes", "estimatedReadyAt", "readyNote"],
    effects: ["confirm_quote"],
    notify: "quote_ready",
  },
  {
    from: ["submitted"],
    to: "rejected",
    actors: ["shop"],
    patchKeys: ["rejectReason"],
    requiresReason: true,
    effects: [],
    notify: "order_rejected",
  },
  {
    from: ["submitted"],
    to: "expired",
    actors: ["system"],
    patchKeys: [],
    effects: [],
    notify: "order_expired",
  },
  {
    from: ["submitted", "awaiting_payment"],
    to: "cancelled",
    actors: ["customer"],
    patchKeys: [],
    effects: [],
    notify: "order_cancelled",
  },
  {
    from: ["awaiting_payment"],
    to: "expired",
    actors: ["system"],
    patchKeys: [],
    effects: [],
    notify: "order_expired",
  },
  {
    from: ["awaiting_payment"],
    to: "paid",
    actors: ["system", "admin"],
    patchKeys: [],
    effects: ["on_paid"],
    notify: "payment_verified",
  },
  {
    from: ["paid"],
    to: "printing",
    actors: ["shop"],
    patchKeys: [],
    effects: [],
    notify: "printing",
  },
  {
    // After payment the customer cannot cancel alone (D19); only an admin can, with a refund.
    from: AFTER_PAYMENT,
    to: "cancelled",
    actors: ["admin"],
    patchKeys: ["rejectReason"],
    requiresReason: true,
    effects: ["create_refund"],
    notify: "order_cancelled",
  },
  {
    from: ["paid", "printing"],
    to: "rejected",
    actors: ["shop"],
    patchKeys: ["rejectReason"],
    requiresReason: true,
    effects: ["create_refund"],
    notify: "order_rejected",
  },
  {
    from: ["printing"],
    to: "ready",
    actors: ["shop"],
    patchKeys: [],
    effects: [],
    notify: "ready",
  },
  {
    // The shop typing the right pickup code is checked by the shop API (P6) before calling this.
    from: ["ready"],
    to: "completed",
    actors: ["shop", "admin"],
    patchKeys: [],
    fulfillment: "pickup",
    effects: ["set_completed_at"],
    notify: "completed",
  },
  {
    from: ["ready"],
    to: "courier_requested",
    actors: ["system", "admin"],
    patchKeys: [],
    fulfillment: "delivery",
    effects: ["create_delivery"],
    notify: "courier_requested",
  },
  {
    from: ["courier_requested"],
    to: "in_transit",
    actors: ["system", "admin"],
    patchKeys: [],
    effects: [],
    notify: "in_transit",
  },
  {
    from: ["in_transit"],
    to: "completed",
    actors: ["system", "admin"],
    patchKeys: [],
    effects: ["set_completed_at"],
    notify: "completed",
  },
];

/** The rule allowing every status in `from` to go to `to` for this actor, or undefined. */
export function findRule(
  from: readonly OrderStatus[],
  to: OrderStatus,
  actor: Actor,
): TransitionRule | undefined {
  return TRANSITIONS.find(
    (r) => r.to === to && r.actors.includes(actor) && from.every((f) => r.from.includes(f)),
  );
}

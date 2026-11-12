import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toDb } from "@/lib/db/case";
import { getServiceClient } from "@/lib/db/server";
import { OrderRow, parseRow, type OrderStatus } from "@/lib/db/types";
import { createDeliveryForOrder } from "@/lib/delivery";
import { calculateTotals, getFeeRate } from "@/lib/domain/pricing";
import { ApiError } from "@/lib/errors";
import { notify } from "@/lib/line/notify";
import { ACTIVE_STATUSES, findRule, type Actor, type PatchKey, type TransitionRule } from "./rules";

/** Number of digits of a new pickup code (D25). Grows by one if every candidate is taken. */
export const PICKUP_CODE_DIGITS = 4;
const PICKUP_CODE_CANDIDATES = 20;
const MAX_PICKUP_CODE_DIGITS = 5; // the database check allows 4-5 digits

const MIN_READY_MINUTES = 5;
const MAX_READY_MINUTES = 2880;
const MAX_READY_NOTE_LENGTH = 200;
const MAX_REASON_LENGTH = 500;
const DEFAULT_PAYMENT_WINDOW_MINUTES = 30; // O3 (open): PAYMENT_WINDOW_MINUTES

export type TransitionArgs = {
  orderId: string;
  from: OrderStatus | OrderStatus[];
  to: OrderStatus;
  actor: Actor;
  patch?: Partial<OrderRow>;
  /** Only for admin -> cancelled; defaults to the full total. Any other step rejects it. */
  refundSatang?: number;
};

function invalid(message: string, details: Record<string, unknown> = {}) {
  return new ApiError("VALIDATION_ERROR", 422, message, details);
}

function conflict(currentStatus: OrderStatus, expected: OrderStatus[], to: OrderStatus) {
  return new ApiError("ORDER_INVALID_TRANSITION", 409, undefined, {
    currentStatus,
    expected,
    to,
  });
}

function paymentWindowMinutes(): number {
  const raw = process.env.PAYMENT_WINDOW_MINUTES;
  if (raw === undefined || raw.trim() === "") return DEFAULT_PAYMENT_WINDOW_MINUTES;
  const minutes = Number(raw);
  if (!Number.isSafeInteger(minutes) || minutes <= 0) {
    throw new Error(`PAYMENT_WINDOW_MINUTES must be a positive integer, got "${raw}"`);
  }
  return minutes;
}

async function readOrder(db: SupabaseClient, orderId: string): Promise<OrderRow> {
  const { data, error } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError("NOT_FOUND", 404);
  return parseRow(OrderRow, data);
}

/** Accept only the patch keys this step allows; undefined values are ignored. */
function checkPatch(
  patch: Partial<OrderRow>,
  rule: TransitionRule,
): Partial<Record<PatchKey, unknown>> {
  const allowed = new Set<string>(rule.patchKeys);
  const clean: Partial<Record<PatchKey, unknown>> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (!allowed.has(key)) {
      throw invalid("ข้อมูลที่ส่งมาไม่ถูกต้อง", { field: key });
    }
    clean[key as PatchKey] = value;
  }
  return clean;
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0;
}

/** A pickup code that no other open order of this shop uses (D25). Never logged. */
async function generatePickupCode(db: SupabaseClient, shopId: string): Promise<string> {
  for (let digits = PICKUP_CODE_DIGITS; digits <= MAX_PICKUP_CODE_DIGITS; digits++) {
    const min = 10 ** (digits - 1);
    const max = 10 ** digits - 1;
    const space = max - min + 1;
    const candidates = new Set<string>();
    while (candidates.size < Math.min(PICKUP_CODE_CANDIDATES, space)) {
      candidates.add(String(randomInt(min, max + 1)));
    }
    const { data, error } = await db
      .from("orders")
      .select("pickup_code")
      .eq("shop_id", shopId)
      .in("status", [...ACTIVE_STATUSES])
      .in("pickup_code", [...candidates]);
    if (error) throw error;
    const taken = new Set((data ?? []).map((r) => r.pickup_code as string));
    const free = [...candidates].find((c) => !taken.has(c));
    if (free) return free;
  }
  throw new ApiError("INTERNAL", 500);
}

/**
 * The only function that changes `orders.status` (CLAUDE.md rule 2).
 * Validates the step against the rules table, updates the row with a conditional atomic update
 * (`where id = $id and status = any($from)`), then runs the step's side effects and notifies.
 */
export async function transition(args: TransitionArgs): Promise<OrderRow> {
  const { orderId, to, actor } = args;
  const from = [...new Set(Array.isArray(args.from) ? args.from : [args.from])];
  if (from.length === 0) throw invalid("ไม่ระบุสถานะเดิม");

  const rule = findRule(from, to, actor);
  if (!rule) {
    throw new ApiError("ORDER_INVALID_TRANSITION", 409, undefined, { from, to, actor });
  }
  const patch = checkPatch(args.patch ?? {}, rule);
  // A partial refund is the admin's call only (CONTRACTS section 7, D26); the shop's refund is always full.
  if (args.refundSatang !== undefined && !(actor === "admin" && to === "cancelled")) {
    throw invalid("ขั้นตอนนี้ไม่มีการคืนเงิน", { field: "refundSatang" });
  }

  const db = getServiceClient();
  const order = await readOrder(db, orderId);
  if (!from.includes(order.status)) throw conflict(order.status, from, to);
  if (rule.fulfillment && order.fulfillment !== rule.fulfillment) {
    throw new ApiError("ORDER_INVALID_TRANSITION", 409, undefined, {
      currentStatus: order.status,
      fulfillment: order.fulfillment,
      to,
    });
  }

  const now = new Date();
  const values: Record<string, unknown> = { status: to, updatedAt: now.toISOString() };
  let reason: string | undefined;
  let refundAmount: number | undefined;

  if (rule.requiresReason) {
    const text = typeof patch.rejectReason === "string" ? patch.rejectReason.trim() : "";
    if (text === "" || text.length > MAX_REASON_LENGTH) {
      throw invalid("ต้องระบุเหตุผล", { field: "rejectReason" });
    }
    reason = text;
    values.rejectReason = text;
  }

  for (const effect of rule.effects) {
    if (effect === "confirm_quote") {
      const { readyInMinutes, estimatedReadyAt, readyNote, printSubtotalSatang } = patch;
      const hasMinutes = readyInMinutes !== undefined && readyInMinutes !== null;
      const hasFixed = estimatedReadyAt !== undefined && estimatedReadyAt !== null;
      if (hasMinutes === hasFixed) {
        throw invalid("ต้องระบุเวลาเสร็จอย่างใดอย่างหนึ่ง", { field: "readyInMinutes" });
      }
      if (hasMinutes) {
        if (
          !Number.isSafeInteger(readyInMinutes) ||
          (readyInMinutes as number) < MIN_READY_MINUTES ||
          (readyInMinutes as number) > MAX_READY_MINUTES
        ) {
          throw invalid("เวลาเสร็จต้องอยู่ระหว่าง 5–2880 นาที", { field: "readyInMinutes" });
        }
        values.readyInMinutes = readyInMinutes;
        values.estimatedReadyAt = null;
      } else {
        const at = new Date(String(estimatedReadyAt));
        if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) {
          throw invalid("เวลาเสร็จต้องอยู่ในอนาคต", { field: "estimatedReadyAt" });
        }
        values.estimatedReadyAt = at.toISOString();
        values.readyInMinutes = null;
      }
      if (readyNote !== undefined && readyNote !== null) {
        if (typeof readyNote !== "string" || readyNote.length > MAX_READY_NOTE_LENGTH) {
          throw invalid("หมายเหตุยาวเกิน 200 ตัวอักษร", { field: "readyNote" });
        }
      }
      values.readyNote = readyNote ?? null;

      // The price: manual orders need the shop's own number; others default to the estimate.
      let subtotal: number;
      if (order.requiresManualPrice) {
        if (!isPositiveInt(printSubtotalSatang)) {
          throw new ApiError("MANUAL_PRICE_REQUIRED", 409);
        }
        subtotal = printSubtotalSatang;
      } else if (printSubtotalSatang !== undefined && printSubtotalSatang !== null) {
        if (!isPositiveInt(printSubtotalSatang)) {
          throw invalid("ราคาต้องเป็นจำนวนเต็มสตางค์มากกว่า 0", { field: "printSubtotalSatang" });
        }
        subtotal = printSubtotalSatang;
      } else {
        if (order.estimatedPrintSatang === null || order.estimatedServicesSatang === null) {
          throw invalid("ออเดอร์นี้ยังไม่มีราคาประมาณ", { field: "printSubtotalSatang" });
        }
        subtotal = order.estimatedPrintSatang + order.estimatedServicesSatang;
      }
      const totals = calculateTotals({
        printSubtotalSatang: subtotal,
        deliveryFeeSatang: order.deliveryFeeSatang,
        feeRate: getFeeRate(),
      });
      values.printSubtotalSatang = subtotal;
      values.platformFeeSatang = totals.platformFeeSatang;
      values.totalSatang = totals.totalSatang;
      values.paymentDeadline = new Date(
        now.getTime() + paymentWindowMinutes() * 60_000,
      ).toISOString();
    }

    if (effect === "on_paid") {
      if (order.printSubtotalSatang === null || order.totalSatang === null) {
        throw new ApiError("INTERNAL", 500); // an order cannot be paid before it was quoted
      }
      values.paidAt = now.toISOString();
      if (order.readyInMinutes !== null) {
        values.estimatedReadyAt = new Date(
          now.getTime() + order.readyInMinutes * 60_000,
        ).toISOString();
      }
      values.pickupCode = await generatePickupCode(db, order.shopId);
    }

    if (effect === "set_completed_at") values.completedAt = now.toISOString();

    if (effect === "create_refund") {
      if (order.totalSatang === null) throw new ApiError("INTERNAL", 500);
      const amount = args.refundSatang ?? order.totalSatang;
      if (!isPositiveInt(amount) || amount > order.totalSatang) {
        throw invalid("ยอดคืนเงินต้องมากกว่า 0 และไม่เกินยอดที่ชำระ", { field: "refundSatang" });
      }
      refundAmount = amount;
    }
  }

  // Conditional atomic update: if another request moved the order first, no row comes back.
  const { data, error } = await db
    .from("orders")
    .update(toDb(values))
    .eq("id", orderId)
    .in("status", from)
    .select()
    .maybeSingle();
  if (error) {
    // The database message can quote the failing row, which holds the pickup code: log only the code.
    console.error(`[transition] update failed for order ${orderId} (db code ${error.code})`);
    throw new ApiError("INTERNAL", 500);
  }
  if (!data) {
    const current = await readOrder(db, orderId);
    throw conflict(current.status, from, to);
  }
  const updated = parseRow(OrderRow, data);

  // Side effects insert at most once, so a repeated call cannot double them. They are NOT atomic with the
  // status change: if one fails the status stays changed and a retry gets 409, so the missing row is not
  // recreated (needs a database function / a repair job; see docs/API.md section 6).
  try {
    for (const effect of rule.effects) {
      if (effect === "on_paid") await createSettlement(db, updated);
      if (effect === "create_refund") {
        await createRefund(db, updated.id, refundAmount as number, reason as string);
      }
      if (effect === "create_delivery") await createDeliveryForOrder(updated.id);
    }
  } catch (err) {
    // The status already changed, so report loudly; never log the pickup code.
    console.error(
      `[transition] side effect failed for order ${updated.id} (${order.status} -> ${to}): ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    );
    throw err;
  }

  if (rule.notify) {
    try {
      await notify(updated.id, rule.notify);
    } catch (err) {
      console.error(
        `[transition] notify ${rule.notify} failed for order ${updated.id}: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    }
  }
  return updated;
}

async function createSettlement(db: SupabaseClient, order: OrderRow): Promise<void> {
  const { error } = await db.from("settlements").upsert(
    {
      shop_id: order.shopId,
      order_id: order.id,
      amount_satang: order.printSubtotalSatang,
      status: "pending",
    },
    { onConflict: "order_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

async function createRefund(
  db: SupabaseClient,
  orderId: string,
  amountSatang: number,
  reason: string,
): Promise<void> {
  const existing = await db.from("refunds").select("id").eq("order_id", orderId).limit(1);
  if (existing.error) throw existing.error;
  if ((existing.data ?? []).length > 0) return;
  const { error } = await db
    .from("refunds")
    .insert({ order_id: orderId, amount_satang: amountSatang, reason, status: "pending" });
  if (error) throw error;
}

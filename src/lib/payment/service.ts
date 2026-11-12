import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { OrderRow, PaymentRow } from "@/lib/db/types";
import { finalizePayment } from "@/lib/domain/orders/transition";
import { expireIfDue } from "@/lib/domain/orders/expire";
import { ApiError } from "@/lib/errors";
import { notify } from "@/lib/line/notify";
import { getPaymentProvider } from "./provider";
import { createPaymentStore, type PaymentStore } from "./store";
import type { PaymentProvider } from "./types";
import { slipImageType } from "./slip/validation";

export const SlipSignInput = z.object({ mime: z.enum(["image/jpeg", "image/png"]) }).strict();
export const SubmitSlipInput = z.object({ slipPath: z.string().max(160) }).strict();
export type PaymentOutcome = {
  status: "verified" | "pending_review" | "rejected";
  reason?: string;
};

type Dependencies = {
  store: PaymentStore;
  expire: (order: OrderRow) => Promise<OrderRow>;
  provider: (order: OrderRow) => PaymentProvider;
  notifyRejected: (orderId: string) => Promise<void>;
  /** Atomically finalize payment + transition() + settlement through the shared RPC. */
  finalizeVerified?: (orderId: string, paymentId: string, slipRef: string) => Promise<void>;
};

function conflict(): never {
  throw new ApiError("ORDER_INVALID_TRANSITION", 409);
}
function attemptId(orderId: string, number: number): string {
  const bytes = createHash("sha256")
    .update(`printgo:payment:${orderId}:${number}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createPaymentService(deps: Dependencies) {
  async function latestOutcome(orderId: string, paymentId: string): Promise<PaymentOutcome> {
    const current = (await deps.store.attempts(orderId)).find((p) => p.id === paymentId);
    if (current?.status === "verified") return { status: "verified" };
    if (current?.status === "rejected")
      return { status: "rejected", reason: current.rejectReason ?? undefined };
    return { status: "pending_review" };
  }
  async function own(customerId: string, orderId: string) {
    return deps.expire(await deps.store.ownOrder(customerId, orderId));
  }
  function payable(order: OrderRow) {
    const deadlineMs = Date.parse(order.paymentDeadline ?? "");
    if (
      order.status !== "awaiting_payment" ||
      !order.paymentDeadline ||
      !Number.isFinite(deadlineMs) ||
      deadlineMs <= Date.now()
    )
      conflict();
    if (!Number.isSafeInteger(order.totalSatang) || order.totalSatang! <= 0)
      throw new ApiError("INTERNAL", 500);
  }
  async function attempt(order: OrderRow): Promise<PaymentRow> {
    const rows = await deps.store.attempts(order.id);
    const current =
      rows.find((p) => p.status === "verified") ??
      rows.find((p) => p.status === "pending_review") ??
      rows.find((p) => p.status === "pending");
    if (current) {
      if (current.amountSatang !== order.totalSatang || current.status === "verified") conflict();
      return current;
    }
    if (rows.length >= 5)
      throw new ApiError(
        "RATE_LIMITED",
        429,
        "ส่งสลิปได้ไม่เกิน 5 ครั้งต่อออเดอร์ กรุณาติดต่อผู้ดูแล",
      );
    // Same candidate ID for racing requests; the primary key prevents duplicate charges.
    return deps.store.insertAttempt(attemptId(order.id, rows.length), order.id, order.totalSatang!);
  }
  function pathFor(orderId: string, path: string) {
    const parts = path.split("/");
    if (
      parts.length !== 2 ||
      parts[0] !== orderId ||
      !/^[0-9a-f-]{36}\.(?:png|jpg)$/.test(parts[1]) ||
      !z.uuid().safeParse(parts[1].split(".")[0]).success
    ) {
      throw new ApiError("VALIDATION_ERROR", 422, "พาธสลิปไม่ถูกต้อง");
    }
  }
  return {
    async charge(customerId: string, orderId: string) {
      const order = await own(customerId, orderId);
      payable(order);
      const payment = await attempt(order);
      const qr = await deps
        .provider(order)
        .createCharge({ orderId, amountSatang: order.totalSatang! });
      return {
        paymentId: payment.id,
        amountSatang: payment.amountSatang,
        ...qr,
        expiresAt: order.paymentDeadline!,
      };
    },
    async sign(customerId: string, orderId: string, mime: "image/png" | "image/jpeg") {
      const order = await own(customerId, orderId);
      payable(order);
      const payment = await attempt(order);
      if (payment.status !== "pending") conflict();
      const path = `${orderId}/${randomUUID()}.${mime === "image/png" ? "png" : "jpg"}`;
      return { path, ...(await deps.store.sign(path)) };
    },
    async submit(customerId: string, orderId: string, slipPath: string): Promise<PaymentOutcome> {
      const order = await own(customerId, orderId);
      pathFor(orderId, slipPath);
      const existing = await deps.store.attempts(orderId);
      const repeated = existing.find((p) => p.slipPath === slipPath);
      if (repeated) {
        if (repeated.status === "verified") return { status: "verified" };
        if (repeated.status === "pending_review") return { status: "pending_review" };
        if (repeated.status === "rejected" && repeated.rejectReason === "สลิปนี้ถูกใช้แล้ว")
          throw new ApiError("PAYMENT_DUPLICATE_SLIP", 409);
        if (repeated.status === "rejected")
          return { status: "rejected", reason: repeated.rejectReason ?? undefined };
      }
      payable(order);
      const payment = await attempt(order);
      if (payment.status !== "pending") conflict();
      const blob = await deps.store.download(slipPath);
      if (
        !["image/png", "image/jpeg"].includes(blob.type) ||
        blob.size <= 0 ||
        blob.size > 5 * 1024 * 1024
      )
        throw new ApiError("VALIDATION_ERROR", 422, "รูปสลิปต้องเป็น JPEG/PNG ขนาดไม่เกิน 5 MB");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (slipImageType(bytes) !== blob.type)
        throw new ApiError("VALIDATION_ERROR", 422, "รูปสลิปไม่ตรงกับชนิดไฟล์");
      // Expiry/cancellation may have happened while downloading.
      payable(await own(customerId, orderId));
      if (!(await deps.store.claim(payment.id, slipPath))) return { status: "pending_review" };
      try {
        const result = await deps
          .provider(order)
          .verifySlip({ slipBytes: bytes, expectedAmountSatang: order.totalSatang! });
        if (result.result === "rejected") {
          const saved = await deps.store.finish(payment.id, slipPath, {
            status: "rejected",
            rejectReason: result.reason ?? "สลิปไม่ผ่านการตรวจสอบ",
          });
          if (!saved) return latestOutcome(orderId, payment.id);
          await deps.notifyRejected(orderId).catch(() => {});
          return { status: "rejected", reason: result.reason };
        }
        if (result.result === "verified" && result.slipRef) {
          if (deps.finalizeVerified) {
            // The RPC checks status/deadline under lock and recognizes a concurrent admin approval.
            await deps.finalizeVerified(orderId, payment.id, result.slipRef);
            return { status: "verified" };
          }
          if (!(await deps.store.finish(payment.id, slipPath, { slipRef: result.slipRef })))
            return latestOutcome(orderId, payment.id);
        }
        // Fail closed: do not use PR4's non-atomic paid/settlement sequence.
        // Preserve the slip/ref for admin review until the shared transaction exists.
        return { status: "pending_review" };
      } catch (error) {
        if (error instanceof ApiError && error.code === "PAYMENT_DUPLICATE_SLIP") {
          const saved = await deps.store.finish(payment.id, slipPath, {
            status: "rejected",
            rejectReason: "สลิปนี้ถูกใช้แล้ว",
          });
          if (!saved) return latestOutcome(orderId, payment.id);
          await deps.notifyRejected(orderId).catch(() => {});
          throw error;
        }
        if (error instanceof ApiError) throw error;
        throw new ApiError("INTERNAL", 500);
      }
    },
  };
}

export function getPaymentService() {
  return createPaymentService({
    store: createPaymentStore(),
    expire: expireIfDue,
    // O9 until Sea confirms branch receiver configuration; no real verification is enabled here.
    provider: (order) => getPaymentProvider({ orderCreatedAt: order.createdAt }),
    notifyRejected: (orderId) => notify(orderId, "payment_rejected"),
    finalizeVerified: async (orderId, paymentId, slipRef) => {
      await finalizePayment({ orderId, paymentId, slipRef, verifiedBy: "slipok" });
    },
  });
}

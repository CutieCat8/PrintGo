import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/db/server";
import { OrderRow, PaymentRow, parseRow } from "@/lib/db/types";
import { ApiError } from "@/lib/errors";
import { mapSlipPersistenceError } from "./slip";

export interface PaymentStore {
  ownOrder(customerId: string, orderId: string): Promise<OrderRow>;
  attempts(orderId: string): Promise<PaymentRow[]>;
  insertAttempt(id: string, orderId: string, amount: number): Promise<PaymentRow>;
  claim(id: string, path: string): Promise<boolean>;
  finish(
    id: string,
    path: string,
    patch: { status?: "pending_review" | "rejected"; slipRef?: string; rejectReason?: string },
  ): Promise<boolean>;
  sign(path: string): Promise<{ uploadUrl: string; token: string }>;
  download(path: string): Promise<Blob>;
}

/** Database constraints arbitrate parallel requests; no process-local lock. */
export function createPaymentStore(db: SupabaseClient = getServiceClient()): PaymentStore {
  return {
    async ownOrder(customerId, orderId) {
      const { data, error } = await db
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .eq("customer_id", customerId)
        .maybeSingle();
      if (error) throw new ApiError("INTERNAL", 500);
      if (!data) throw new ApiError("NOT_FOUND", 404);
      return parseRow(OrderRow, data);
    },
    async attempts(orderId) {
      const { data, error } = await db
        .from("payments")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw new ApiError("INTERNAL", 500);
      return (data ?? []).map((row) => parseRow(PaymentRow, row));
    },
    async insertAttempt(id, orderId, amount) {
      const row = {
        id,
        order_id: orderId,
        amount_satang: amount,
        status: "pending",
        slip_path: null,
        slip_ref: null,
        verified_by: null,
        verified_at: null,
        reject_reason: null,
      };
      const result = await db.from("payments").insert(row).select().maybeSingle();
      if (!result.error && result.data) return parseRow(PaymentRow, result.data);
      if (result.error?.code === "23505") {
        const existing = await db
          .from("payments")
          .select("*")
          .eq("id", id)
          .eq("order_id", orderId)
          .maybeSingle();
        if (!existing.error && existing.data) return parseRow(PaymentRow, existing.data);
      }
      throw new ApiError("INTERNAL", 500);
    },
    async claim(id, path) {
      const { data, error } = await db
        .from("payments")
        .update({ status: "pending_review", slip_path: path })
        .eq("id", id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (error) throw new ApiError("INTERNAL", 500);
      return !!data;
    },
    async finish(id, path, patch) {
      const values: Record<string, unknown> = {};
      if (patch.status) values.status = patch.status;
      if (patch.slipRef) values.slip_ref = patch.slipRef;
      if (patch.rejectReason) values.reject_reason = patch.rejectReason;
      const { data, error } = await db
        .from("payments")
        .update(values)
        .eq("id", id)
        .eq("status", "pending_review")
        .eq("slip_path", path)
        .select("id")
        .maybeSingle();
      if (error) throw mapSlipPersistenceError(error);
      return !!data;
    },
    async sign(path) {
      const { data, error } = await db.storage
        .from("payment-slips")
        .createSignedUploadUrl(path, { upsert: false });
      if (error || !data) throw new ApiError("INTERNAL", 500);
      return { uploadUrl: data.signedUrl, token: data.token };
    },
    async download(path) {
      const { data, error } = await db.storage.from("payment-slips").download(path);
      if (error || !data)
        throw new ApiError("VALIDATION_ERROR", 422, "ไม่พบรูปสลิป กรุณาอัปโหลดใหม่");
      return data;
    },
  };
}

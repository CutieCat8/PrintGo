"use client";
import { createContext } from "react";
import { api } from "@/lib/client/api";
import { uploadToSignedUrl } from "@/lib/client/files";
import type { Charge, SlipResult, SlipSign } from "@/lib/client/types";

export type PaymentTransport = {
  charge(id: string): Promise<Charge>;
  sign(id: string, mime: string): Promise<SlipSign>;
  submit(id: string, path: string): Promise<SlipResult>;
  order(
    id: string,
  ): Promise<{ status: string; payment: { status: string; rejectReason?: string | null } | null }>;
  upload(
    url: string,
    file: File,
    progress: (fraction: number) => void,
    signal: AbortSignal,
  ): Promise<void>;
};
/** Default uses Yuri's authenticated API/token layer. Demo injects a local transport. */
export const PaymentTransportContext = createContext<PaymentTransport>({
  charge: (id) => api.createCharge(id),
  sign: (id, mime) => api.signSlipUpload(id, mime),
  submit: (id, path) => api.submitSlip(id, path),
  order: (id) => api.getMyOrder(id),
  upload: uploadToSignedUrl,
});

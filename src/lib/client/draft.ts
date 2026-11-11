"use client";

import { useSyncExternalStore } from "react";
import type { ColorMode, Fulfillment, Paper, Sides } from "@/lib/db/types";
import type { CreateOrderRequest, EstimateRequest, SelectedService } from "./types";

/**
 * The order the customer is putting together across /liff/new -> /shop -> /summary.
 * Kept in sessionStorage so switching apps inside LINE does not lose it; cleared after the order
 * is sent. File contents are never stored, only what the API needs (the uploaded `path`).
 */

export type UploadState = "waiting" | "uploading" | "done" | "failed";

export type DraftFile = {
  key: string;
  name: string;
  mime: string;
  sizeBytes: number;
  /** Storage path from /uploads/sign, set once the upload has finished. */
  path: string | null;
  upload: UploadState;
  progress: number;
  /** null = not counted yet / could not count: the customer types it. */
  pageCount: number | null;
  /** pdf.js could not open it (password or broken): warn, but let them continue. */
  pageWarning: "password" | "broken" | "unknown" | null;
  counting: boolean;
  color: ColorMode;
  paper: Paper;
  sides: Sides;
  copies: number;
};

export type DeliveryInfo = { name: string; phone: string; address: string };

export type OrderDraft = {
  files: DraftFile[];
  note: string;
  shopId: string | null;
  fulfillment: Fulfillment;
  delivery: DeliveryInfo;
  services: SelectedService[];
};

const KEY = "printgo:order-draft";
const EMPTY: OrderDraft = {
  files: [],
  note: "",
  shopId: null,
  fulfillment: "pickup",
  delivery: { name: "", phone: "", address: "" },
  services: [],
};

let state: OrderDraft = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as OrderDraft;
      // A file whose upload had not finished cannot be retried: its contents are gone. Drop it.
      saved.files = saved.files
        .filter((f) => f.upload === "done" && f.path !== null)
        .map((f) => ({ ...f, counting: false }));
      state = { ...EMPTY, ...saved };
    }
  } catch {
    // storage blocked or corrupt: start empty
  }
}

function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // private mode / blocked storage: the draft just is not kept
  }
}

export function getDraft(): OrderDraft {
  load();
  return state;
}

export function updateDraft(change: (d: OrderDraft) => OrderDraft) {
  load();
  state = change(state);
  save();
  listeners.forEach((l) => l());
}

export function updateFile(key: string, patch: Partial<DraftFile>) {
  updateDraft((d) => ({
    ...d,
    files: d.files.map((f) => (f.key === key ? { ...f, ...patch } : f)),
  }));
}

export function clearDraft() {
  state = EMPTY;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `hydrated` is false on the server render and the first client render (sessionStorage unread). */
export function useDraft(): { draft: OrderDraft; hydrated: boolean } {
  const draft = useSyncExternalStore(subscribe, getDraft, () => EMPTY);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return { draft, hydrated };
}

/** Every file uploaded, counted and set up correctly: the form may move on. */
export function filesReady(d: OrderDraft): boolean {
  return (
    d.files.length > 0 &&
    d.files.every(
      (f) =>
        f.upload === "done" &&
        f.path !== null &&
        f.pageCount !== null &&
        Number.isInteger(f.pageCount) &&
        f.pageCount >= 1 &&
        f.pageCount <= 10000 &&
        Number.isInteger(f.copies) &&
        f.copies >= 1 &&
        f.copies <= 99,
    ) &&
    d.note.length <= 500
  );
}

function fileSettings(f: DraftFile) {
  return {
    pageCount: f.pageCount ?? 1,
    color: f.color,
    paper: f.paper,
    sides: f.sides,
    copies: f.copies,
  };
}

export function toEstimateRequest(
  d: OrderDraft,
  shopId: string,
  pos: { lat: number; lng: number } | null,
): EstimateRequest {
  const delivery = d.fulfillment === "delivery" && pos;
  return {
    shopId,
    fulfillment: d.fulfillment,
    ...(delivery ? { deliveryLat: pos.lat, deliveryLng: pos.lng } : {}),
    files: d.files.map(fileSettings),
    services: d.services,
  };
}

export function toCreateOrderRequest(
  d: OrderDraft,
  shopId: string,
  pos: { lat: number; lng: number } | null,
): CreateOrderRequest {
  const delivery = d.fulfillment === "delivery" && pos;
  const note = d.note.trim();
  return {
    shopId,
    fulfillment: d.fulfillment,
    ...(delivery
      ? {
          deliveryLat: pos.lat,
          deliveryLng: pos.lng,
          deliveryAddress: d.delivery.address.trim(),
          deliveryRecipientName: d.delivery.name.trim(),
          deliveryRecipientPhone: d.delivery.phone.trim(),
        }
      : {}),
    ...(note ? { customerNote: note } : {}),
    files: d.files.map((f) => ({
      ...fileSettings(f),
      path: f.path!,
      originalName: f.name,
      mime: f.mime,
      sizeBytes: f.sizeBytes,
    })),
    services: d.services,
  };
}

"use client";

import { useSyncExternalStore } from "react";

/**
 * The customer's current position (D24): asked only after we explain why, used for distances and
 * as the delivery point. Kept in memory only (not saved anywhere) and there is no manual entry.
 */
export type LocationState =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "granted"; lat: number; lng: number }
  | { kind: "denied" }
  | { kind: "unavailable" };

let state: LocationState = { kind: "idle" };
const listeners = new Set<() => void>();

function set(next: LocationState) {
  state = next;
  listeners.forEach((l) => l());
}

export function requestLocation() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    set({ kind: "unavailable" });
    return;
  }
  set({ kind: "asking" });
  navigator.geolocation.getCurrentPosition(
    (p) => set({ kind: "granted", lat: p.coords.latitude, lng: p.coords.longitude }),
    (err) => set({ kind: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" }),
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
  );
}

export function useLocation(): LocationState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function positionOf(s: LocationState): { lat: number; lng: number } | null {
  return s.kind === "granted" ? { lat: s.lat, lng: s.lng } : null;
}

/** The customer chose "ไม่อนุญาต": same as a refusal (list by name, pickup only). */
export function skipLocation() {
  set({ kind: "denied" });
}

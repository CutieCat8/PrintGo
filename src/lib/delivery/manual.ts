import { distanceKm } from "./distance";
import type { DeliveryProvider } from "./types";

/** O5 sample numbers (DECISIONS.md): not real Grab prices. Override with env. */
function envSatang(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${name} must be a whole number of satang`);
  return value;
}

/** Fee = base + per-km x distance, rounded up to a whole satang (money is never a float). */
export function manualFeeSatang(km: number): number {
  const base = envSatang("DELIVERY_BASE_SATANG", 4000);
  const perKm = envSatang("DELIVERY_PER_KM_SATANG", 1000);
  return base + Math.ceil(perKm * km);
}

/** The admin books the rider by hand, so `create` only says "waiting for admin". */
export const manualProvider: DeliveryProvider = {
  name: "manual",
  async getQuote({ pickup, dropoff }) {
    return {
      feeSatang: manualFeeSatang(distanceKm(pickup, dropoff)),
      etaMinutes: null,
      estimated: true,
    };
  },
  async create() {
    return { providerRef: null, status: "pending_admin" };
  },
  async cancel() {
    // Nothing to cancel outside our own database; the caller marks the row `cancelled`.
  },
};

import type { DeliveryStatus } from "@/lib/db/types";

export type LatLng = { lat: number; lng: number };
export type Place = LatLng & { address: string; name?: string; phone?: string };

/** Shape fixed by docs/CONTRACTS.md section 7. Grab (Z11) will implement the same interface. */
export interface DeliveryProvider {
  name: "manual" | "grab";
  getQuote(args: {
    pickup: LatLng;
    dropoff: LatLng;
  }): Promise<{ feeSatang: number; etaMinutes: number | null; estimated: boolean }>;
  create(args: {
    orderId: string;
    pickup: Place;
    dropoff: Place;
  }): Promise<{ providerRef: string | null; status: DeliveryStatus }>;
  cancel(args: { providerRef: string }): Promise<void>;
}

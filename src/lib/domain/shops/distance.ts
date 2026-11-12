export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Straight-line (great-circle) distance in km (D9). Not rounded: the API layer rounds to 1 decimal
 * for display, so sorting still uses the exact value.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  for (const v of [a.lat, a.lng, b.lat, b.lng]) {
    if (!Number.isFinite(v)) throw new Error("haversineKm: coordinates must be finite numbers");
  }
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

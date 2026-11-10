/**
 * Temporary formatBaht until P1 ships `@/lib/domain/pricing/format` — same name and signature
 * (CONTRACTS section 7). Swap the import in components/ui/Money.tsx when P1 is merged.
 *
 * Integer satang in, "1,250.50" out (no "฿"; the Money component adds it).
 * Uses integer maths only, so no float rounding.
 */
export function formatBaht(satang: number): string {
  if (!Number.isSafeInteger(satang) || satang < 0) {
    throw new RangeError(`formatBaht expects a non-negative integer of satang, got ${satang}`);
  }
  const baht = Math.trunc(satang / 100);
  const rest = satang % 100;
  return `${baht.toLocaleString("en-US")}.${String(rest).padStart(2, "0")}`;
}

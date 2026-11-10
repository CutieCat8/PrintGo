/** Satang (integer) -> baht text for display only, e.g. 2200 -> "22.00", 125050 -> "1,250.50". */
export function formatBaht(satang: number): string {
  if (!Number.isSafeInteger(satang) || satang < 0) {
    throw new Error(`formatBaht: expected a non-negative integer satang, got ${satang}`);
  }
  const baht = Math.floor(satang / 100);
  const rest = String(satang % 100).padStart(2, "0");
  const grouped = String(baht).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${rest}`;
}

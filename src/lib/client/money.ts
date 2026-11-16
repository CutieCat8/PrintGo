/**
 * Money helpers for screens. Amounts are integer satang everywhere (CLAUDE.md rule 1).
 * `formatBaht` is P1's (CONTRACTS section 7): "1,250.50", no "฿" (the Money component adds it).
 */
export { formatBaht } from "@/lib/domain/pricing/format";

/**
 * What a shop types in baht ("120", "1,250.5", "99.75") -> integer satang, or null if it is not a
 * valid amount (empty, negative, more than 2 decimals, letters). The only place baht becomes satang.
 * Parsed as text, never through a float.
 */
export function parseBahtToSatang(input: string): number | null {
  const text = input.trim().replace(/,/g, "");
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const satang = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(satang) ? satang : null;
}

/**
 * Integer satang -> the text a shop would type in the price box ("120", "99.5" is never produced:
 * always 2 decimals when there are satang, e.g. "99.50"). Integer maths only, never a float.
 */
export function satangToBahtInput(satang: number): string {
  const baht = Math.trunc(satang / 100);
  const rest = satang % 100;
  return rest === 0 ? String(baht) : `${baht}.${String(rest).padStart(2, "0")}`;
}

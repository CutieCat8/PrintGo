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

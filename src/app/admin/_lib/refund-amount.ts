import { parseBahtToSatang } from "@/lib/client/money";

/** Blank means a full refund. null means invalid input. Returned amounts are integer satang. */
export function parseRefundAmount(input: string, totalSatang: number): number | null | undefined {
  const value = input.trim();
  if (!value) return undefined;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = parseBahtToSatang(value);
  return amount !== null && amount > 0 && amount <= totalSatang ? amount : null;
}

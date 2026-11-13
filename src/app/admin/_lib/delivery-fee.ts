import { parseBahtToSatang } from "@/lib/client/money";

export function parseDeliveryFee(input: string): number | null | undefined {
  const value = input.trim();
  if (!value) return undefined;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = parseBahtToSatang(value);
  return amount !== null && amount <= 2147483647 ? amount : null;
}

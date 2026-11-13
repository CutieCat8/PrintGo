import "server-only";
import { ApiError } from "@/lib/errors";

/** Each page uses a stable key so status changes do not shift an offset and skip rows. */
export async function readLedgerPages<T extends { id: string }>(
  page: (after: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const result = await page(after);
    if (result.error || !result.data) throw new ApiError("INTERNAL", 500);
    rows.push(...result.data);
    if (result.data.length < 100) return rows;
    after = result.data[result.data.length - 1].id;
  }
}
export function sumSatang(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(total + value))
      throw new ApiError("INTERNAL", 500);
    total += value;
  }
  return total;
}
export function ledgerTotals(
  rows: readonly { status: "pending" | "paid"; amountSatang: number }[],
) {
  return {
    pendingSatang: sumSatang(rows.filter((r) => r.status === "pending").map((r) => r.amountSatang)),
    paidSatang: sumSatang(rows.filter((r) => r.status === "paid").map((r) => r.amountSatang)),
  };
}

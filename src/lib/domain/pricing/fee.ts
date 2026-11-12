/** Platform fee (D14): max(300, ceil(rate x printSubtotal)), all in integer satang. */
export const MIN_PLATFORM_FEE_SATANG = 300;
export const DEFAULT_PLATFORM_FEE_RATE = 0.05;

const BASIS_POINTS = 10_000;

function assertSatang(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer satang, got ${value}`);
  }
}

/** Reads PLATFORM_FEE_RATE (0-1, default 0.05). Throws on a value that is not a number in range. */
export function getFeeRate(env: Record<string, string | undefined> = process.env): number {
  const raw = env.PLATFORM_FEE_RATE;
  if (raw === undefined || raw.trim() === "") return DEFAULT_PLATFORM_FEE_RATE;
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error(`PLATFORM_FEE_RATE must be a number between 0 and 1, got "${raw}"`);
  }
  assertWholeBasisPoints(rate);
  return rate;
}

/** The rate is applied in basis points (1/10000); finer rates would be rounded silently, so reject them. */
function assertWholeBasisPoints(rate: number): void {
  if (Math.abs(rate * BASIS_POINTS - Math.round(rate * BASIS_POINTS)) > 1e-6) {
    throw new Error(`fee rate must have at most 4 decimal places, got ${rate}`);
  }
}

export function calculateTotals(args: {
  printSubtotalSatang: number;
  deliveryFeeSatang: number;
  feeRate: number;
}): { platformFeeSatang: number; totalSatang: number } {
  const { printSubtotalSatang, deliveryFeeSatang, feeRate } = args;
  assertSatang("printSubtotalSatang", printSubtotalSatang);
  assertSatang("deliveryFeeSatang", deliveryFeeSatang);
  if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate > 1) {
    throw new Error(`feeRate must be between 0 and 1, got ${feeRate}`);
  }
  assertWholeBasisPoints(feeRate);
  // Integer maths only: 0.05 * 12000 is not exact in floating point.
  const basisPoints = Math.round(feeRate * BASIS_POINTS);
  const product = printSubtotalSatang * basisPoints;
  const percentFee = Math.floor((product + BASIS_POINTS - 1) / BASIS_POINTS); // ceil
  const platformFeeSatang = Math.max(MIN_PLATFORM_FEE_SATANG, percentFee);
  return {
    platformFeeSatang,
    totalSatang: printSubtotalSatang + platformFeeSatang + deliveryFeeSatang,
  };
}

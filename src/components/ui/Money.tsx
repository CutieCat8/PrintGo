import { formatBaht } from "@/lib/client/money";
import { cx } from "./cx";

/**
 * Shows satang as "฿1,250.50". The only way pages should print money.
 * Pass values the API returned; do not compute prices on the page.
 */
export function Money({ satang, className }: { satang: number; className?: string }) {
  return (
    <span className={cx("whitespace-nowrap tabular-nums", className)}>฿{formatBaht(satang)}</span>
  );
}

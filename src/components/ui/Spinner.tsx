import { cx } from "./cx";

/** Small spinning circle. Decorative: pair it with visible text or aria-busy on the parent. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      )}
    />
  );
}

import { cx } from "./cx";

/**
 * Flip Square: a small square that flips over in 3D, used as a "something is waiting" marker
 * (e.g. new orders). Motion taken from the Amicro library's flip-square, written as CSS so no
 * animation package is needed. Respects reduced motion (globals.css turns animations off).
 */
export function FlipSquare({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cx("inline-flex [perspective:200px]", className)}>
      <span className="size-3 animate-flip-square rounded-[3px] bg-accent-ink" />
    </span>
  );
}

import { cx } from "./cx";

/**
 * Flip Square: a small two-sided tile that flips over in 3D (teal one side, ink the other), used
 * as a "something is waiting" marker, e.g. new orders. Motion after the Amicro library's
 * flip-square, written as CSS so no animation package is needed. Reduced motion stops it
 * (globals.css); it then shows as a plain teal square.
 */
export function FlipSquare({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cx("inline-flex [perspective:70px]", className)}>
      <span className="relative size-3 animate-flip-square [transform-style:preserve-3d]">
        <span className="absolute inset-0 rounded-[3px] bg-accent-ink [backface-visibility:hidden]" />
        <span className="absolute inset-0 rounded-[3px] bg-brand [backface-visibility:hidden] [transform:rotateY(180deg)]" />
      </span>
    </span>
  );
}

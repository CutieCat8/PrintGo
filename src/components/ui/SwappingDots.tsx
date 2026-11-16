import { cx } from "./cx";

/**
 * Swapping Dots: two dots that trade places, shown while the customer waits (e.g. to pay).
 * Motion taken from the Amicro library's swapping-dots, written as CSS so no animation package is
 * needed. The dots take the text colour (`currentColor`), so set it with a `text-*` class.
 * Reduced motion stops the movement (globals.css); the two dots then sit side by side.
 */
export function SwappingDots({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx("relative inline-flex h-4 w-12 shrink-0 items-center", className)}
    >
      <span className="absolute left-0 size-4 animate-swap-a rounded-full bg-current" />
      <span className="absolute right-0 size-4 animate-swap-b rounded-full bg-current opacity-45" />
    </span>
  );
}

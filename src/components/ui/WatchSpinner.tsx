import { cx } from "./cx";

/**
 * Watch Spinner: three nested arcs turning at different speeds, like a watch. Motion taken from
 * the Amicro library's watch-spinner, written as CSS so no animation package is needed. The arcs
 * use the text colour (`currentColor`); `size` is in px. Reduced motion stops the turning
 * (globals.css).
 */
export function WatchSpinner({ size = 48, className }: { size?: number; className?: string }) {
  const border = Math.max(2, Math.round(size / 16));
  return (
    <span
      aria-hidden="true"
      className={cx("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {[0, 1, 2].map((i) => {
        const ring = Math.round((size * (44 - i * 12)) / 48);
        return (
          <span
            key={i}
            className="absolute animate-watch-spin rounded-full border-transparent border-t-current"
            style={{
              width: ring,
              height: ring,
              borderWidth: border,
              animationDuration: `${1 + i * 0.5}s`,
            }}
          />
        );
      })}
    </span>
  );
}

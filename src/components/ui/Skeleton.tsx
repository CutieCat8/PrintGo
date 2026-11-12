import { cx } from "./cx";

/** Grey placeholder block while loading. Size it with className (e.g. "h-5 w-32"). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx("rounded-control bg-line/70 motion-safe:animate-pulse", className)}
    />
  );
}

/** Card-shaped skeleton for lists, with a message for screen readers. */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div
      role="status"
      className={cx("rounded-card border border-line bg-surface p-4 shadow-card", className)}
    >
      <span className="sr-only">กำลังโหลด…</span>
      <Skeleton className="mb-3 h-5 w-2/5" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cx("mb-2 h-4 last:mb-0", i === lines - 1 ? "w-3/5" : "w-full")}
        />
      ))}
    </div>
  );
}

import { cx } from "@/components/ui";

/** Red count bubble: "9+" above 9, hidden at 0. */
export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cx(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs leading-5 font-bold text-white tabular-nums",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
      <span className="sr-only"> ข้อความใหม่</span>
    </span>
  );
}

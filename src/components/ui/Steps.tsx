import { cx } from "./cx";

/** "1 ไฟล์ — 2 ร้าน — 3 สรุป" progress for a short multi-page flow. `current` is 0-based. */
export function Steps({
  steps,
  current,
  className,
}: {
  steps: string[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={cx("flex items-center gap-2", className)} aria-label="ขั้นตอน">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={s}
            className="flex flex-1 items-center gap-2"
            aria-current={active ? "step" : undefined}
          >
            <span
              className={cx(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                done && "bg-brand text-white",
                active && "bg-accent-ink text-white ring-4 ring-accent-100",
                !done && !active && "bg-surface text-ink-muted ring-1 ring-line",
              )}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={cx(
                "text-sm whitespace-nowrap",
                active ? "font-semibold text-brand" : "text-ink-muted",
              )}
            >
              {s}
            </span>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cx("h-0.5 flex-1 rounded", done ? "bg-brand" : "bg-line")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

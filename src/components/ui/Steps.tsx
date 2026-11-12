import { cx } from "./cx";

/** Thin segmented progress: "ขั้นที่ 2 จาก 3 · เลือกร้าน". `current` is 0-based. */
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
    <div className={cx("flex flex-col gap-2", className)}>
      <div className="flex gap-1.5" aria-hidden="true">
        {steps.map((s, i) => (
          <span
            key={s}
            className={cx(
              "h-1 flex-1 rounded-full transition-colors",
              i <= current ? "bg-accent-ink" : "bg-line-strong",
            )}
          />
        ))}
      </div>
      <p className="text-xs font-medium text-ink-muted">
        ขั้นที่ {current + 1} จาก {steps.length} ·{" "}
        <span className="text-ink">{steps[current]}</span>
      </p>
    </div>
  );
}

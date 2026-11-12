import type { ReactNode } from "react";
import { cx } from "./cx";

export type TimelineStepState = "done" | "current" | "upcoming" | "failed";
export type TimelineStep = {
  key: string;
  title: string;
  description?: ReactNode;
  /** Already formatted for display (Thai time). */
  time?: string;
  state: TimelineStepState;
};

const DOT: Record<TimelineStepState, string> = {
  done: "bg-brand border-brand text-white",
  current: "bg-accent-ink border-accent-ink text-white ring-4 ring-accent-100",
  upcoming: "bg-surface border-line text-ink-muted",
  failed: "bg-danger border-danger text-white",
};

const MARK: Record<TimelineStepState, string> = {
  done: "✓",
  current: "•",
  upcoming: "",
  failed: "✕",
};

const STATE_TEXT: Record<TimelineStepState, string> = {
  done: "เสร็จแล้ว",
  current: "ขั้นตอนปัจจุบัน",
  upcoming: "ยังไม่ถึง",
  failed: "ไม่สำเร็จ",
};

/** Vertical step list, e.g. order progress. */
export function Timeline({ steps, className }: { steps: TimelineStep[]; className?: string }) {
  return (
    <ol className={cx("flex flex-col", className)}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li
            key={step.key}
            className="relative flex gap-3 pb-5 last:pb-0"
            aria-current={step.state === "current" ? "step" : undefined}
          >
            {!last && (
              <span
                aria-hidden="true"
                className={cx(
                  "absolute top-7 left-[13px] h-[calc(100%-1.75rem)] w-0.5",
                  step.state === "done" ? "bg-brand" : "bg-line",
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cx(
                "z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
                DOT[step.state],
              )}
            >
              {MARK[step.state]}
            </span>
            <div className="min-w-0 pt-0.5">
              <p
                className={cx(
                  "font-medium",
                  step.state === "upcoming" ? "text-ink-muted" : "text-ink",
                  step.state === "current" && "font-semibold text-brand",
                  step.state === "failed" && "text-danger",
                )}
              >
                {step.title}
                <span className="sr-only"> ({STATE_TEXT[step.state]})</span>
              </p>
              {step.time && <p className="text-sm text-ink-muted">{step.time}</p>}
              {step.description && (
                <div className="mt-0.5 text-sm text-ink-muted">{step.description}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

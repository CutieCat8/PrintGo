"use client";

import { Button, Icon, cx, type IconName } from "@/components/ui";
import { formatTime } from "@/lib/client/format";
import {
  RIDER_STAGES,
  STAGE_SECONDS,
  sampleArrivalWindow,
  type RiderStage,
} from "@/lib/client/riderTracker";

const ICONS: IconName[] = ["search", "scooter", "box", "home"];

/**
 * Grab-style delivery tracking: arrival window, what the rider is doing, and four stages in a row.
 * SIMULATED (6 s per stage) until a real rider feed exists, and it says so on the card.
 */
export function RiderTracker({
  simulation: { startedAt, stage },
  now,
  onReceive,
  receiving = false,
}: {
  simulation: { startedAt: number; stage: RiderStage };
  now: Date;
  /** Closes the order (customer confirms the parcel arrived). Shown once the stage is "arrived". */
  onReceive?: () => void;
  receiving?: boolean;
}) {
  const current = RIDER_STAGES[stage];
  const window = sampleArrivalWindow(startedAt);
  const arrived = stage === 3;

  return (
    <section
      aria-label="ติดตามไรเดอร์"
      className="rounded-card border border-line-strong bg-surface px-5 py-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-3xl leading-tight font-bold text-ink tabular-nums">
            {arrived
              ? `${formatTime(now)} น.`
              : `${formatTime(window.from)} - ${formatTime(window.to)} น.`}
          </p>
          <p role="status" aria-live="polite" className="mt-1 text-lg font-semibold text-ink">
            {current.title}
          </p>
          <p className="text-sm text-ink-muted">{current.hint}</p>
        </div>
        <span
          aria-hidden="true"
          className="flex size-16 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-ink"
        >
          <Icon name={ICONS[stage]!} className="size-8" />
        </span>
      </div>

      <ol className="mt-6 flex items-center" aria-label="ขั้นตอนการจัดส่ง">
        {RIDER_STAGES.map((s, i) => {
          const reached = i <= stage;
          const last = i === RIDER_STAGES.length - 1;
          return (
            <li
              key={s.key}
              aria-current={i === stage ? "step" : undefined}
              className={cx("flex items-center", !last && "flex-1")}
            >
              <span className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                <span
                  className={cx(
                    "flex size-10 items-center justify-center rounded-full border transition-colors duration-300 motion-reduce:transition-none",
                    reached
                      ? "border-ink bg-surface text-ink"
                      : "border-line bg-surface text-ink-subtle",
                  )}
                >
                  <Icon name={ICONS[i]!} className="size-5" />
                </span>
                <span
                  className={cx(
                    "text-center text-xs leading-tight text-balance",
                    reached ? "font-semibold text-ink" : "text-ink-subtle",
                  )}
                >
                  {s.label}
                  <span className="sr-only">
                    {i < stage
                      ? " (เสร็จแล้ว)"
                      : i === stage
                        ? " (ขั้นตอนปัจจุบัน)"
                        : " (ยังไม่ถึง)"}
                  </span>
                </span>
              </span>
              {!last && (
                <span
                  aria-hidden="true"
                  className="relative mx-1 mb-6 h-1 flex-1 rounded-full bg-line"
                >
                  <span
                    key={i < stage ? "done" : i === stage ? `run-${stage}` : "todo"}
                    className={cx(
                      "absolute inset-y-0 left-0 rounded-full bg-ink",
                      i < stage && "w-full",
                      i > stage && "w-0",
                      i === stage &&
                        "w-0 motion-safe:animate-[rider-fill_var(--stage-s)_linear_forwards] motion-reduce:w-1/2",
                    )}
                    style={{ ["--stage-s" as string]: `${STAGE_SECONDS}s` }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {arrived && onReceive ? (
        <Button size="lg" fullWidth className="mt-5" loading={receiving} onClick={onReceive}>
          ได้รับของแล้ว
        </Button>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">
          {arrived ? "ขอบคุณที่ใช้ PrintGo" : "เราจะแจ้งเมื่อไรเดอร์ส่งของถึงคุณ"}
        </p>
      )}
      <p className="mt-1 text-xs text-ink-subtle">
        โหมดจำลอง: สถานะไรเดอร์และเวลาเป็นตัวอย่าง ยังไม่ได้เชื่อมระบบไรเดอร์จริง
      </p>
    </section>
  );
}

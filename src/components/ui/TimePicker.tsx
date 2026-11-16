"use client";

import { useId } from "react";
import { cx } from "./cx";
import { hourOptions, joinTime, minuteOptions, splitTime } from "./timeParts";

const selectClass =
  "min-h-11 w-[4.5rem] shrink-0 appearance-none rounded-control border bg-surface bg-[length:0.875rem] bg-[right_0.5rem_center] bg-no-repeat " +
  "pl-3 pr-7 text-base text-ink tabular-nums " +
  "disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-muted " +
  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent-ink/50 focus-visible:border-accent-ink";

/** Chevron as a CSS background so the native <select> keeps working on phones. */
const CHEVRON =
  'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2357534e%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M6 9l6 6 6-6%27/%3E%3C/svg%3E")';

/**
 * Hour : minute picker for opening hours (24-hour, matches the "HH:mm" the API stores).
 * Two real <select>s: one tap to open on a phone, keyboard and screen readers work, no extra package.
 * `allow24` adds hour 24 for "closes at midnight" (only 24:00). The value is "" until an hour is chosen;
 * choosing an hour first fills the minute with 00.
 */
export function TimePicker({
  label,
  value,
  onChange,
  disabled,
  error,
  allow24 = false,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  allow24?: boolean;
  className?: string;
}) {
  const id = useId();
  const { hour, minute } = splitTime(value);
  const border = error ? "border-danger" : "border-line-strong";
  const style = { backgroundImage: CHEVRON };

  return (
    <fieldset
      disabled={disabled}
      className={cx("flex w-fit min-w-0 flex-col gap-1.5", className)}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="mb-1.5 text-sm font-medium text-ink">{label}</legend>
      <div className="flex items-center gap-2">
        <select
          aria-label={`${label} ชั่วโมง`}
          aria-invalid={error ? true : undefined}
          className={cx(selectClass, border)}
          style={style}
          value={hour}
          onChange={(e) => {
            const nextHour = e.target.value;
            onChange(
              joinTime({ hour: nextHour, minute: nextHour === "24" ? "00" : minute }, allow24),
            );
          }}
        >
          <option value="">ชม.</option>
          {hourOptions(allow24).map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="font-semibold text-ink-muted">
          :
        </span>
        <select
          aria-label={`${label} นาที`}
          aria-invalid={error ? true : undefined}
          className={cx(selectClass, border)}
          style={style}
          value={hour === "24" ? "00" : minute}
          disabled={hour === "" || hour === "24"}
          onChange={(e) => onChange(joinTime({ hour, minute: e.target.value }, allow24))}
        >
          <option value="" disabled>
            นาที
          </option>
          {(hour === "24" ? ["00"] : minuteOptions(minute)).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

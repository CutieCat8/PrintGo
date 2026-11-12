"use client";

import { useId } from "react";
import { cx } from "./cx";

/** − [ n ] + for small whole numbers (copies). Typing is allowed too; the value is clamped. */
export function NumberStepper({
  label,
  value,
  min = 1,
  max = 99,
  unit,
  onChange,
  className,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  onChange: (value: number) => void;
  className?: string;
}) {
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.trunc(n)));
  const valid = Number.isInteger(value) && value >= min && value <= max;
  const btn =
    "flex size-10 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-brand ring-1 ring-line hover:bg-brand-50 disabled:opacity-40";

  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-muted">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btn}
          aria-label={`ลด${label}`}
          disabled={valid && value <= min}
          onClick={() => onChange(valid ? clamp(value - 1) : min)}
        >
          −
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={Number.isNaN(value) ? "" : value}
          onChange={(e) =>
            onChange(e.target.value === "" ? NaN : Math.trunc(Number(e.target.value)))
          }
          onBlur={() => onChange(valid ? value : clamp(Number.isNaN(value) ? min : value))}
          className="h-10 w-14 rounded-control border border-line bg-surface text-center text-lg font-semibold tabular-nums focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          className={btn}
          aria-label={`เพิ่ม${label}`}
          disabled={valid && value >= max}
          onClick={() => onChange(valid ? clamp(value + 1) : min)}
        >
          +
        </button>
        {unit && <span className="text-sm text-ink-muted">{unit}</span>}
      </div>
    </div>
  );
}

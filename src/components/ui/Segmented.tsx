"use client";

import { useId, type ReactNode } from "react";
import { cx } from "./cx";

export type SegmentOption<T extends string> = { value: T; label: ReactNode; hint?: ReactNode };

/**
 * One-tap choice between a few options (replaces a <select> with 2–4 values on phones).
 * Real radio inputs underneath, so keyboard and screen readers work as a radio group.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cx("min-w-0", className)}>
      <legend className="mb-1.5 text-sm font-medium text-ink-muted">{label}</legend>
      <div className="flex rounded-control bg-line/70 p-1">
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <label
              key={o.value}
              className={cx(
                "flex min-h-10 flex-1 cursor-pointer flex-col items-center justify-center rounded-[calc(var(--radius-control)-4px)] px-2 text-center text-sm font-medium transition",
                "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent-ink",
                checked ? "bg-surface text-ink shadow-raised" : "text-ink-muted hover:text-ink",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.label}
              {o.hint && <span className="text-xs font-normal text-ink-muted">{o.hint}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

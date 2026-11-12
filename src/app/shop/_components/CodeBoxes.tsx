"use client";

import { useRef } from "react";
import { cx } from "@/components/ui";

/**
 * Four one-digit boxes for the customer's pickup code (Figma S5). Typing moves to the next box,
 * Backspace goes back, pasting "4821" fills all four. Numeric keypad on tablets.
 */
export function CodeBoxes({
  value,
  onChange,
  invalid,
  label = "รหัสรับงาน",
}: {
  value: string;
  onChange: (code: string) => void;
  invalid?: boolean;
  label?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 4 }, (_, i) => value[i] ?? "");

  function setAt(i: number, d: string) {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join("").replace(/\s/g, ""));
  }

  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-label={`${label} หลักที่ ${i + 1}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={d}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (v.length > 1) {
              onChange(v.slice(0, 4));
              refs.current[Math.min(v.length, 4) - 1]?.focus();
              return;
            }
            setAt(i, v);
            if (v && i < 3) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const v = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
            if (v) {
              e.preventDefault();
              onChange(v);
              refs.current[Math.min(v.length, 4) - 1]?.focus();
            }
          }}
          className={cx(
            "size-14 rounded-xl border-2 bg-surface text-center font-display text-2xl font-bold italic tabular-nums focus:border-accent-ink focus:outline-none",
            invalid ? "border-danger" : "border-line-strong",
          )}
        />
      ))}
    </div>
  );
}

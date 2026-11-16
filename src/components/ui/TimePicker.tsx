"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { allMinutes, hourOptions, joinTime, splitTime } from "./timeParts";

const ROW = "h-10";

/**
 * Time picker for opening hours: a button that opens a small panel with two scrolling columns
 * (hour, minute), like a phone clock. 24-hour, matches the "HH:mm" the API stores. Tap a number
 * to set it, "ตอนนี้" fills the current time, "ล้าง" empties it. `allow24` adds hour 24 for
 * "closes at midnight" (only 24:00). No extra package: plain buttons, keyboard arrows work in
 * each column, Esc or a click outside closes it.
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
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { hour, minute } = splitTime(value);

  // Close on a click outside
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  function pickHour(h: string) {
    onChange(joinTime({ hour: h, minute: h === "24" ? "00" : minute }, allow24));
  }
  function pickMinute(m: string) {
    onChange(joinTime({ hour: hour || "00", minute: m }, allow24));
  }
  function setNow() {
    const now = new Date();
    onChange(
      joinTime(
        {
          hour: String(now.getHours()).padStart(2, "0"),
          minute: String(now.getMinutes()).padStart(2, "0"),
        },
        allow24,
      ),
    );
  }

  return (
    <div
      ref={root}
      className={cx("relative flex w-fit min-w-0 flex-col gap-1.5", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span id={`${id}-label`} className="text-sm font-medium text-ink">
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={error ? `${id}-error` : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "flex min-h-11 w-32 items-center justify-between gap-2 rounded-control border bg-surface px-3 text-base tabular-nums transition",
          "disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-muted",
          "focus-visible:border-accent-ink focus-visible:ring-3 focus-visible:ring-accent-ink/50 focus-visible:outline-none",
          error ? "border-danger" : "border-line-strong",
          value ? "text-ink" : "text-ink-subtle",
        )}
      >
        <span id={`${id}-value`}>{value || "เลือกเวลา"}</span>
        <Icon name="clock" className="size-4 shrink-0 text-ink-muted" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute top-full left-0 z-50 mt-1 w-52 overflow-hidden rounded-card border border-line bg-surface shadow-raised"
        >
          <div className="grid grid-cols-2 divide-x divide-line">
            <Column
              title="ชั่วโมง"
              options={hourOptions(allow24)}
              selected={hour}
              onPick={pickHour}
            />
            <Column
              title="นาที"
              options={hour === "24" ? ["00"] : allMinutes()}
              selected={hour === "24" ? "00" : minute}
              onPick={pickMinute}
            />
          </div>
          <div className="grid grid-cols-2 divide-x divide-line border-t border-line text-sm">
            <button
              type="button"
              onClick={setNow}
              className="min-h-11 font-medium text-ink hover:bg-brand-50"
            >
              ตอนนี้
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              className="min-h-11 text-ink-muted hover:bg-brand-50"
            >
              ล้าง
            </button>
          </div>
        </div>
      )}

      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** One scrolling column. Starts at the top; the chosen row is scrolled into view when the panel opens; fades at the bottom (and at the top once scrolled). */
function Column({
  title,
  options,
  selected,
  onPick,
}: {
  title: string;
  options: string[];
  selected: string;
  onPick: (value: string) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Centre the selected row once, on open (not on every pick, so the list does not jump under a finger)
  useEffect(() => {
    const box = list.current;
    const row = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (box && row) box.scrollTop = row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2;
  }, []);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const at = options.indexOf(selected);
    let next = -1;
    if (e.key === "ArrowDown") next = Math.min(options.length - 1, at + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, at <= 0 ? 0 : at - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onPick(options[next]);
    list.current
      ?.querySelector<HTMLElement>(`[data-value="${options[next]}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="min-w-0">
      <p className="py-2 text-center text-sm text-ink-subtle">{title}</p>
      <div
        ref={list}
        role="listbox"
        aria-label={title}
        tabIndex={0}
        onKeyDown={onKey}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}
        className={cx(
          "h-52 overflow-y-auto overscroll-contain outline-none [scrollbar-width:none] focus-visible:bg-brand-50/60 [&::-webkit-scrollbar]:hidden",
          scrolled
            ? "[mask-image:linear-gradient(to_bottom,transparent,black_18%,black_78%,transparent)]"
            : "[mask-image:linear-gradient(to_bottom,black_78%,transparent)]",
        )}
      >
        {options.map((o) => {
          const on = o === selected;
          return (
            <button
              key={o}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={on}
              data-value={o}
              onClick={() => onPick(o)}
              className={cx(
                ROW,
                "block w-full text-center text-base tabular-nums transition-colors",
                on ? "font-semibold text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

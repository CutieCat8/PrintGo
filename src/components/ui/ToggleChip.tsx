import type { ReactNode } from "react";
import { cx } from "./cx";

/** A pill that turns on and off (multi-select), e.g. "ปกใส", "เข้าเล่ม". */
export function ToggleChip({
  pressed,
  onToggle,
  icon,
  children,
  className,
}: {
  pressed: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cx(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ring-1 transition",
        pressed
          ? "bg-brand text-white ring-brand"
          : "bg-surface text-ink ring-line-strong hover:bg-canvas",
        className,
      )}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
      {pressed && <span aria-hidden="true">✓</span>}
    </button>
  );
}

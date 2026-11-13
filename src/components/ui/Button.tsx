import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-zoom text-white shadow-glow hover:brightness-110 active:scale-[0.98] disabled:shadow-none",
  secondary:
    "bg-surface text-ink ring-1 ring-inset ring-line-strong hover:ring-ink/40 active:scale-[0.98]",
  ghost: "bg-transparent text-brand hover:bg-brand-50",
  danger: "bg-danger text-white hover:bg-danger-hover active:scale-[0.98]",
};

/** md/lg are at least 44px tall (touch target). sm is for dense shop-dashboard rows only. */
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3.5 text-sm",
  md: "min-h-12 px-5 text-base",
  lg: "min-h-14 px-6 font-display text-lg italic tracking-wide",
};

type StyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

/** Button look for things that are not <button>, e.g. <Link className={buttonClasses()}>. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
}: StyleOptions = {}) {
  return cx(
    "group/btn inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-150 select-none",
    "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    fullWidth && "w-full",
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  StyleOptions & {
    /** Shows a spinner, blocks clicks (stops double submits) and keeps the label for screen readers. */
    loading?: boolean;
    /** Trailing arrow that dashes forward on hover ("go" actions). */
    arrow?: boolean;
  };

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  arrow = false,
  disabled,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
      {arrow && !loading && (
        <Icon
          name="next"
          className="size-5 transition-transform duration-200 group-hover/btn:translate-x-1"
          strokeWidth={2.4}
        />
      )}
    </button>
  );
}

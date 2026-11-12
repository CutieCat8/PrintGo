import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent-ink text-white hover:bg-accent-ink-hover shadow-sm",
  secondary: "bg-surface text-brand ring-1 ring-inset ring-brand/30 hover:bg-brand-50",
  ghost: "bg-transparent text-brand hover:bg-brand-50",
  danger: "bg-danger text-white hover:bg-danger-hover shadow-sm",
};

/** md/lg are at least 44px tall (touch target). sm is for dense shop-dashboard rows only. */
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-base",
  lg: "min-h-13 px-6 text-lg",
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
    "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors select-none",
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
  };

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
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
    </button>
  );
}

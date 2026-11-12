import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

type ChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  label: ReactNode;
  description?: ReactNode;
  className?: string;
};

/** The whole row is clickable and at least 44px tall. */
function Choice({
  type,
  label,
  description,
  className,
  disabled,
  ...rest
}: ChoiceProps & { type: "checkbox" | "radio" }) {
  return (
    <label
      className={cx(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-control py-2",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        type={type}
        disabled={disabled}
        className="mt-1 size-5 shrink-0 accent-accent-ink"
        {...rest}
      />
      <span className="flex flex-col">
        <span className="text-ink">{label}</span>
        {description && <span className="text-sm text-ink-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Checkbox(props: ChoiceProps) {
  return <Choice type="checkbox" {...props} />;
}

export function Radio(props: ChoiceProps) {
  return <Choice type="radio" {...props} />;
}

/** Groups radios/checkboxes under one visible legend. */
export function ChoiceGroup({
  legend,
  error,
  children,
  className,
}: {
  legend: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cx("flex flex-col", className)}>
      <legend className="mb-1 font-medium text-ink">{legend}</legend>
      {children}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

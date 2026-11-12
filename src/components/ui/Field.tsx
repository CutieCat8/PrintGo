"use client";

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./cx";

type FieldProps = {
  label: string;
  /** Short help under the label. */
  hint?: ReactNode;
  /** Thai error text. When set, the control is marked invalid. */
  error?: string;
  /** Adds a visible "*" and sets `required` on the control. */
  required?: boolean;
  className?: string;
};

const controlBase =
  "w-full rounded-control border bg-surface px-4 text-base text-ink placeholder:text-ink-subtle " +
  "disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-muted " +
  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent-ink/50 focus-visible:border-accent-ink";

function controlClass(error?: string) {
  return cx(controlBase, error ? "border-danger" : "border-line-strong");
}

function describedBy(id: string, hint?: ReactNode, error?: string) {
  return cx(hint ? `${id}-hint` : null, error ? `${id}-error` : null) || undefined;
}

function FieldFrame({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
  extra,
}: FieldProps & { id: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {children}
      {(error || extra) && (
        <div className="flex items-start justify-between gap-2">
          {error ? (
            <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : (
            <span />
          )}
          {extra}
        </div>
      )}
    </div>
  );
}

export type InputProps = FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

export function Input({
  label,
  hint,
  error,
  required,
  className,
  id: idProp,
  ...rest
}: InputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(controlClass(error), "min-h-12")}
        {...rest}
      />
    </FieldFrame>
  );
}

export type TextareaProps = FieldProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
    /** Shows "12/500" under the box when maxLength is set and the value is controlled. */
    showCount?: boolean;
  };

export function Textarea({
  label,
  hint,
  error,
  required,
  className,
  id: idProp,
  showCount = true,
  maxLength,
  value,
  rows = 3,
  ...rest
}: TextareaProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const count = typeof value === "string" ? value.length : undefined;
  const counter =
    showCount && maxLength && count !== undefined ? (
      <span className="shrink-0 text-sm text-ink-muted tabular-nums">
        {count}/{maxLength}
      </span>
    ) : null;
  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
      extra={counter}
    >
      <textarea
        id={id}
        required={required}
        maxLength={maxLength}
        value={value}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(controlClass(error), "py-2.5")}
        {...rest}
      />
    </FieldFrame>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectProps = FieldProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
    options: SelectOption[];
    /** Empty first option, e.g. "เลือก…". */
    placeholder?: string;
  };

export function Select({
  label,
  hint,
  error,
  required,
  className,
  id: idProp,
  options,
  placeholder,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldFrame
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(controlClass(error), "min-h-12")}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons row at the bottom. */
  footer?: ReactNode;
  /** "center" = dialog box · "sheet" = slides up from the bottom (good on phones). */
  placement?: "center" | "sheet";
  /** false = Esc and backdrop clicks do nothing (use while a request is running). */
  dismissible?: boolean;
  className?: string;
};

/**
 * Built on the native <dialog>: focus is trapped and restored by the browser, Esc closes it.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  placement = "center",
  dismissible = true,
  className,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const sheet = placement === "sheet";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault(); // we decide: Esc only closes when dismissible
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        // A click on the <dialog> itself (not its content) is a click on the backdrop
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
      className={cx(
        "bg-surface p-0 text-ink shadow-pop",
        sheet
          ? "mx-auto mt-auto mb-0 max-h-[85dvh] w-full max-w-lg rounded-t-card sm:mb-auto sm:rounded-card"
          : "m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md rounded-card",
        className,
      )}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-brand">
              {title}
            </h2>
            {description && (
              <div id={descId} className="mt-1 text-ink-muted">
                {description}
              </div>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-ink-muted hover:bg-canvas"
            >
              <Icon name="x" className="size-5" />
            </button>
          )}
        </div>
        {children && <div className="overflow-y-auto px-5 pt-3">{children}</div>}
        {footer && (
          <div className="flex flex-col-reverse gap-2 px-5 pt-4 pb-5 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
        {!footer && <div className="pb-5" />}
      </div>
    </dialog>
  );
}

/** Bottom sheet: a Modal that slides up from the bottom on phones. */
export function Sheet(props: Omit<ModalProps, "placement">) {
  return <Modal {...props} placement="sheet" />;
}

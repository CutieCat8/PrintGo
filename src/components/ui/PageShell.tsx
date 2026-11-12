import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

type PageShellProps = {
  title: string;
  /** Shows a back arrow linking here. */
  backHref?: string;
  /** Small actions on the right of the header. */
  actions?: ReactNode;
  /** Sticky bar at the bottom for the main action (e.g. "ถัดไป: เลือกร้าน"). */
  footer?: ReactNode;
  /** Bottom tab bar (LiffBottomNav in Y5). Shown under the footer. */
  bottomNav?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Customer page frame for LIFF: phone-width column, header with title and back button. */
export function PageShell({
  title,
  backHref,
  actions,
  footer,
  bottomNav,
  children,
  className,
}: PageShellProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas">
      <header className="sticky top-0 z-30 flex min-h-14 items-center gap-1 border-b border-line bg-surface px-2">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="กลับ"
            className="flex size-11 items-center justify-center rounded-full text-2xl text-brand hover:bg-brand-50"
          >
            ‹
          </Link>
        ) : (
          <span className="w-2" />
        )}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-brand">{title}</h1>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </header>

      <main className={cx("flex-1 px-4 py-4", className)}>{children}</main>

      {(footer || bottomNav) && (
        <div className="sticky bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
          {footer && <div className="px-4 py-3">{footer}</div>}
          {bottomNav}
        </div>
      )}
    </div>
  );
}

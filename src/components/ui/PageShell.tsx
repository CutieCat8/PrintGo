import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

type PageShellProps = {
  /** Large page title; also used as the document's main heading. */
  title: string;
  /** Small line under the large title. */
  subtitle?: ReactNode;
  /** Shows a back arrow linking here (otherwise the PrintGo logo). */
  backHref?: string;
  /** Small actions on the right of the top bar. */
  actions?: ReactNode;
  /** Sticky bar at the bottom for the main action (e.g. "ถัดไป: เลือกร้าน"). */
  footer?: ReactNode;
  /** Bottom tab bar (LiffBottomNav). Shown under the footer. */
  bottomNav?: ReactNode;
  children: ReactNode;
  className?: string;
  /** The page draws its own hero instead of the large title (home page). */
  hideTitle?: boolean;
};

/**
 * Customer page frame for LIFF, in the style of a phone app: slim translucent top bar,
 * large page title, content, sticky action bar and tab bar.
 */
export function PageShell({
  title,
  subtitle,
  backHref,
  actions,
  footer,
  bottomNav,
  children,
  className,
  hideTitle,
}: PageShellProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-canvas/85 px-3 backdrop-blur-md">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="กลับ"
            className="-ml-1 flex size-10 items-center justify-center rounded-full text-ink hover:bg-surface"
          >
            <Icon name="back" className="size-6" />
          </Link>
        ) : (
          <Logo size="sm" className="ml-1" />
        )}
        <span className="flex-1" />
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </header>

      <main className={cx("flex-1 px-4 pt-1 pb-6", className)}>
        {!hideTitle && (
          <div className="mb-5 animate-zoom">
            <h1 className="font-display text-[1.9rem] leading-tight font-bold tracking-tight text-ink italic">
              {title}
            </h1>
            {subtitle && <div className="mt-1 text-ink-muted">{subtitle}</div>}
          </div>
        )}
        <div className="animate-rise">{children}</div>
      </main>

      {(footer || bottomNav) && (
        <div className="sticky bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
          {footer && <div className="px-4 pt-3 pb-2">{footer}</div>}
          {bottomNav}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { LogoMark } from "./Logo";

type NavItem = { href: string; label: string; icon: IconName; badge?: number };

type DashboardShellProps = {
  shopName: string;
  /** Right side of the top bar, e.g. the "รับงานอยู่" switch. */
  headerActions?: ReactNode;
  /** Full-width notice under the top bar, e.g. "รอแอดมินอนุมัติ". */
  banner?: ReactNode;
  /** New orders + unread on "ออเดอร์". Hidden when 0. */
  queueBadge?: number;
  /** Unread messages on "แชท". Hidden when 0. */
  chatBadge?: number;
  /** Let the page use the full height without padding (chat inbox). */
  flush?: boolean;
  children: ReactNode;
};

function isActive(pathname: string, href: string) {
  if (href === "/shop") return pathname === "/shop" || pathname.startsWith("/shop/orders");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Shop dashboard frame (Figma S3): one top bar with the shop name, pill menu
 * ออเดอร์ / แชท / ตั้งค่า, and the "รับงานอยู่" switch. Desktop/tablet first.
 */
export function DashboardShell({
  shopName,
  headerActions,
  banner,
  queueBadge,
  chatBadge,
  flush,
  children,
}: DashboardShellProps) {
  const pathname = usePathname() ?? "";
  const items: NavItem[] = [
    { href: "/shop", label: "ออเดอร์", icon: "inbox", badge: queueBadge },
    { href: "/shop/chats", label: "แชท", icon: "chat", badge: chatBadge },
    { href: "/shop/settings", label: "ตั้งค่า", icon: "settings" },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 text-ink backdrop-blur">
        <div className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 lg:px-6">
          <Link href="/shop" className="flex min-w-0 items-center gap-2.5">
            <LogoMark className="size-8 shrink-0" />
            <span className="min-w-0 truncate font-display text-lg font-bold">
              Print<span className="text-forest">Go</span>{" "}
              <span className="text-ink-subtle">·</span> {shopName}
            </span>
          </Link>
          <nav
            aria-label="เมนูร้าน"
            className="order-3 flex w-full gap-1.5 md:order-none md:w-auto"
          >
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition",
                    active
                      ? "bg-brand text-white"
                      : "text-ink-muted ring-1 ring-line hover:bg-brand-50 hover:text-ink",
                  )}
                >
                  <Icon name={item.icon} className="size-4" />
                  {item.label}
                  {item.badge ? (
                    <span
                      className={cx(
                        "min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-bold tabular-nums",
                        active ? "bg-white text-brand" : "bg-accent-ink text-white",
                      )}
                    >
                      {item.badge > 9 ? "9+" : item.badge}
                      <span className="sr-only"> รายการใหม่</span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <span className="flex-1" />
          <div className="flex items-center gap-2">
            {headerActions}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                aria-label="ออกจากระบบ"
                title="ออกจากระบบ"
                className="flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-brand-50 hover:text-ink"
              >
                <Icon name="logout" className="size-5" />
              </button>
            </form>
          </div>
        </div>
      </header>
      {banner}
      <main className={cx("flex-1", flush ? "" : "p-4 lg:p-6")}>{children}</main>
    </div>
  );
}

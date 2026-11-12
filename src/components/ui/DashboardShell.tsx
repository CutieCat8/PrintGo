"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./cx";

type NavItem = { href: string; label: string; icon: string; badge?: number };

type DashboardShellProps = {
  shopName: string;
  /** Right side of the top bar, e.g. the "พักรับงาน" switch (Y6). */
  headerActions?: ReactNode;
  /** Full-width notice under the top bar, e.g. "รอแอดมินอนุมัติ" (Y6). */
  banner?: ReactNode;
  /** Unread/new count on the "คิวงาน" menu item. Hidden when 0. */
  queueBadge?: number;
  children: ReactNode;
};

function isActive(pathname: string, href: string) {
  if (href === "/shop") return pathname === "/shop" || pathname.startsWith("/shop/orders");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function CountBadge({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto min-w-6 rounded-full bg-danger px-1.5 text-center text-sm font-bold text-white tabular-nums">
      {count > 9 ? "9+" : count}
      <span className="sr-only"> รายการใหม่</span>
    </span>
  );
}

/** Shop dashboard frame: side menu (desktop) / top tabs (tablet), top bar with shop name and logout. */
export function DashboardShell({
  shopName,
  headerActions,
  banner,
  queueBadge,
  children,
}: DashboardShellProps) {
  const pathname = usePathname() ?? "";
  const items: NavItem[] = [
    { href: "/shop", label: "คิวงาน", icon: "🗂️", badge: queueBadge },
    { href: "/shop/settings", label: "ตั้งค่า", icon: "⚙️" },
  ];

  const logout = (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="min-h-11 rounded-control px-3 font-medium text-ink-muted hover:bg-canvas hover:text-ink"
      >
        ออกจากระบบ
      </button>
    </form>
  );

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* Side menu: 1024px and up */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-brand text-white lg:flex">
        <div className="px-5 py-5 text-xl font-bold">
          Print<span className="text-accent">Go</span>
          <span className="block text-sm font-normal text-brand-100">สำหรับร้าน</span>
        </div>
        <nav aria-label="เมนูร้าน" className="flex flex-col gap-1 px-3">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-12 items-center gap-3 rounded-control px-3 text-lg font-medium",
                  active ? "bg-white text-brand" : "text-white hover:bg-brand-700",
                )}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
                <CountBadge count={item.badge} />
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface">
          <div className="flex min-h-16 items-center gap-3 px-4 lg:px-6">
            <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-brand">{shopName}</h1>
            {headerActions}
            {logout}
          </div>
          {/* Top tabs: below 1024px */}
          <nav aria-label="เมนูร้าน" className="flex gap-1 px-2 pb-2 lg:hidden">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex min-h-11 items-center gap-2 rounded-control px-4 font-medium",
                    active ? "bg-brand text-white" : "text-brand hover:bg-brand-50",
                  )}
                >
                  {item.label}
                  <CountBadge count={item.badge} />
                </Link>
              );
            })}
          </nav>
        </header>
        {banner}
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

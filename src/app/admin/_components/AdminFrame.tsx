"use client";
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ErrorState } from "@/components/ui";
import { errorMessage } from "@/lib/client/http";
import { useAdminShops } from "../_lib/api";

const menu = [
  { href: "/admin", label: "ภาพรวม", ready: true },
  { href: "/admin/shops", label: "ร้าน", ready: true },
  { href: "/admin/payments", label: "การชำระเงินรอตรวจ", ready: true },
  { href: "/admin/orders", label: "ออเดอร์", ready: true },
  { href: "/admin/settlements", label: "โอนให้ร้าน", ready: true },
  { href: "/admin/refunds", label: "คืนเงิน", ready: true },
];
/** Admin-specific menu; Yuri's existing DashboardShell is shop-only. */
export function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const resource = useAdminShops();
  const count = resource.error
    ? 0
    : (resource.data?.pendingShopCount ?? 0) + (resource.data?.pendingPaymentCount ?? 0);
  useEffect(() => {
    const previous = document.title;
    document.title = `${count ? `(${count}) ` : ""}PrintGo Admin`;
    return () => {
      document.title = previous;
    };
  }, [count]);
  return (
    <div className="min-h-dvh bg-canvas text-ink lg:flex">
      <aside className="bg-brand p-4 text-white lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:shrink-0">
        <p className="mb-4 text-xl font-bold">
          Print<span className="text-accent">Go</span> Admin
        </p>
        <nav aria-label="เมนูแอดมิน" className="flex gap-2 overflow-x-auto lg:flex-col">
          {menu.map((item) =>
            item.ready ? (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`min-h-11 shrink-0 rounded-control px-3 py-2 ${pathname === item.href ? "bg-white font-semibold text-brand" : "hover:bg-brand-700"}`}
              >
                {item.label}
                {item.href === "/admin/shops" && resource.data && !resource.error && (
                  <span className="ml-2">({resource.data.pendingShopCount})</span>
                )}
              </Link>
            ) : (
              <span
                key={item.href}
                aria-disabled="true"
                className="shrink-0 px-3 py-2 text-brand-100"
                title="เร็ว ๆ นี้"
              >
                {item.label}
                {item.href === "/admin/payments" && resource.data && !resource.error
                  ? ` (${resource.data.pendingPaymentCount})`
                  : ""}{" "}
                <small>เร็ว ๆ นี้</small>
              </span>
            ),
          )}
        </nav>
        <form action="/auth/signout" method="post" className="mt-4">
          <button
            className="min-h-11 rounded-control border border-white/40 px-3 py-2"
            type="submit"
          >
            ออกจากระบบ
          </button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        {resource.error ? (
          <ErrorState
            description={errorMessage(resource.error)}
            onRetry={() => void resource.mutate()}
          />
        ) : (
          children
        )}
      </main>
    </div>
  );
}

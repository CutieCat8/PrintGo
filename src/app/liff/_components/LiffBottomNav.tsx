"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, cx, type IconName } from "@/components/ui";
import { useChats } from "@/lib/client/hooks";
import { UnreadBadge } from "./UnreadBadge";

const TABS: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
  { href: "/liff", label: "หน้าแรก", icon: "printer", exact: true },
  { href: "/liff/orders", label: "สถานะงาน", icon: "box" },
  { href: "/liff/chats", label: "แชท", icon: "chat" },
];

/** Bottom tab bar (Figma C1): หน้าแรก / สถานะงาน / แชท, with the unread badge on แชท. */
export function LiffBottomNav() {
  const pathname = usePathname() ?? "";
  const { data } = useChats("customer");

  return (
    <nav aria-label="เมนูหลัก" className="grid grid-cols-3">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-semibold transition",
              active ? "text-accent-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {active && (
              <span aria-hidden="true" className="absolute top-0 h-0.5 w-10 rounded-full bg-zoom" />
            )}
            <span className="relative">
              <Icon name={tab.icon} className="size-6" strokeWidth={active ? 2.1 : 1.75} />
              {tab.href === "/liff/chats" && (
                <UnreadBadge
                  count={data?.totalUnread ?? 0}
                  className="absolute -top-1.5 -right-3 ring-2 ring-surface"
                />
              )}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

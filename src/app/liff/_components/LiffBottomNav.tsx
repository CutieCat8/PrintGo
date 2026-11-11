"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { useChats } from "@/lib/client/hooks";
import { UnreadBadge } from "./UnreadBadge";

const TABS = [
  { href: "/liff/new", match: "/liff/new", label: "สั่งปริ้น", icon: "🖨️" },
  { href: "/liff/orders", match: "/liff/orders", label: "สถานะงาน", icon: "📦" },
  { href: "/liff/chats", match: "/liff/chats", label: "คุยกับร้าน", icon: "💬" },
] as const;

/** Bottom tab bar of the LIFF app. The chat tab carries the unread badge (polled every 10 s). */
export function LiffBottomNav() {
  const pathname = usePathname() ?? "";
  const { data } = useChats("customer");

  return (
    <nav aria-label="เมนูหลัก" className="grid grid-cols-3 border-t border-line">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.match);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-sm font-medium",
              active ? "text-accent-ink" : "text-ink-muted hover:text-brand",
            )}
          >
            <span aria-hidden="true" className="text-xl leading-none">
              {tab.icon}
            </span>
            {tab.label}
            {tab.href === "/liff/chats" && (
              <UnreadBadge
                count={data?.totalUnread ?? 0}
                className="absolute top-1 left-[calc(50%+6px)]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

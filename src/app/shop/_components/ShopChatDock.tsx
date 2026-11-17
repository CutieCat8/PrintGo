"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { ChatRoom } from "@/components/ui/ChatRoom";
import { useChats } from "@/lib/client/hooks";

/**
 * Customer chat for one order as a floating dock: a round customer icon that stays on screen while
 * the shop works through the price form and files, and opens the chat on tap. The badge counts
 * unread customer messages (polled with the same chat list the top bar uses), so a folded chat
 * never hides a question while the reply clock is running.
 */
export function ShopChatDock({
  orderId,
  orderNo,
  closed,
  quickReplies,
}: {
  orderId: string;
  orderNo: string;
  closed: boolean;
  quickReplies: string[];
}) {
  const [open, setOpen] = useState(false);
  const chats = useChats("shop");
  const unread = chats.data?.chats.find((c) => c.orderId === orderId)?.unreadMessageCount ?? 0;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-40 flex flex-col items-start gap-3 lg:inset-x-auto lg:bottom-5 lg:left-5 lg:flex-row lg:items-end">
      {open && (
        <section
          aria-label={`แชทกับลูกค้า ออเดอร์ ${orderNo}`}
          className="pointer-events-auto flex max-h-[min(34rem,calc(100dvh-8rem))] w-full origin-bottom-left animate-rise flex-col overflow-hidden rounded-card border border-line-strong bg-surface shadow-pop lg:order-2 lg:w-[23rem]"
        >
          <header className="flex items-center gap-3 border-b border-line px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold text-ink">ลูกค้า</h2>
              <p className="truncate text-sm text-ink-muted">ออเดอร์ {orderNo}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="พับแชท"
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-brand-50 hover:text-ink focus-visible:ring-3 focus-visible:ring-accent-ink/40 focus-visible:outline-none"
            >
              <Icon name="minus" className="size-5" />
            </button>
          </header>
          <ChatRoom
            orderId={orderId}
            side="shop"
            closed={closed}
            quickReplies={quickReplies}
            hideTitle
            listClassName="min-h-40 max-h-[min(22rem,40dvh)]"
            className="min-h-0 flex-1 rounded-none border-0 bg-transparent"
          />
        </section>
      )}

      {/* The customer circle stays on screen while the chat is open (left of the box); tapping it folds/opens */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={
          open
            ? "พับแชทกับลูกค้า"
            : unread > 0
              ? `เปิดแชทกับลูกค้า มี ${unread} ข้อความใหม่`
              : "เปิดแชทกับลูกค้า"
        }
        className="pointer-events-auto relative flex size-14 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-raised ring-1 ring-line-strong transition duration-150 hover:bg-brand-50 focus-visible:ring-3 focus-visible:ring-accent-ink/50 focus-visible:outline-none active:scale-95 motion-reduce:transition-none lg:order-1"
      >
        <Icon name="user" className="size-7" strokeWidth={2} />
        {!open && unread > 0 && (
          <>
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full ring-2 ring-danger motion-safe:animate-ping motion-safe:[animation-iteration-count:3]"
            />
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 flex min-h-6 min-w-6 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-bold text-white ring-2 ring-surface tabular-nums"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          </>
        )}
      </button>
    </div>
  );
}

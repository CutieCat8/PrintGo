"use client";

import Link from "next/link";
import {
  EmptyState,
  ErrorState,
  PageShell,
  SkeletonCard,
  StatusBadge,
  Icon,
} from "@/components/ui";
import { errorMessage } from "@/lib/client/api";
import { formatDayTime } from "@/lib/client/format";
import { useChats } from "@/lib/client/hooks";
import { LiffBottomNav } from "../_components/LiffBottomNav";
import { UnreadBadge } from "../_components/UnreadBadge";

export default function ChatsPage() {
  const chats = useChats("customer");
  const rooms = [...(chats.data?.chats ?? [])].sort((a, b) =>
    (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""),
  );

  return (
    <PageShell title="คุยกับร้าน" bottomNav={<LiffBottomNav />}>
      {chats.isLoading ? (
        <div className="flex flex-col gap-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : chats.error && !chats.data ? (
        <ErrorState description={errorMessage(chats.error)} onRetry={() => chats.mutate()} />
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={<Icon name="chat" className="size-7" />}
          title="ยังไม่มีแชท"
          description="แชทกับร้านจะเปิดเมื่อคุณส่งออเดอร์"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rooms.map((c) => (
            <li key={c.orderId}>
              <Link
                href={`/liff/chats/${c.orderId}`}
                className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-card ring-1 ring-line hover:ring-brand/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-brand">
                    <span className="truncate">{c.shopName}</span>
                    <span className="shrink-0 text-sm font-normal text-ink-muted">{c.orderNo}</span>
                  </p>
                  <p className="truncate text-sm text-ink-muted">
                    {c.lastMessage
                      ? `${c.lastMessage.sender === "customer" ? "คุณ: " : ""}${c.lastMessage.body}`
                      : "ยังไม่มีข้อความ"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {c.lastMessage && (
                    <span className="text-xs text-ink-muted">
                      {formatDayTime(c.lastMessage.createdAt)}
                    </span>
                  )}
                  {c.unreadMessageCount > 0 ? (
                    <UnreadBadge count={c.unreadMessageCount} />
                  ) : (
                    <StatusBadge status={c.status} />
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

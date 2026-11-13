"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, Icon, Skeleton, StatusBadge, cx } from "@/components/ui";
import { ChatRoom } from "@/components/ui/ChatRoom";
import { errorMessage } from "@/lib/client/api";
import { formatDayTime } from "@/lib/client/format";
import { useChats, useShopMe } from "@/lib/client/hooks";

/** Quick replies for the shop (Figma S6). Tapping fills the box so it can be edited first. */
const QUICK_REPLIES = [
  "ไฟล์เปิดไม่ได้/มีรหัสผ่าน รบกวนส่งไฟล์ใหม่ (สั่งออเดอร์ใหม่) ครับ",
  "ขอเลื่อนเวลาเสร็จเล็กน้อยนะครับ",
  "รับทราบครับ",
  "ปริ้นเสร็จแล้วครับ",
];

/** S6: every order's chat room in one place: rooms on the left, the conversation on the right. */
export default function ShopChatsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const me = useShopMe();
  const chats = useChats("shop", me.data?.state === "active");
  const rooms = [...(chats.data?.chats ?? [])].sort((a, b) => {
    if (b.unreadMessageCount !== a.unreadMessageCount) {
      return b.unreadMessageCount - a.unreadMessageCount;
    }
    return (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? "");
  });
  const selectedId = params.get("order") ?? rooms[0]?.orderId ?? null;
  const selected = rooms.find((r) => r.orderId === selectedId) ?? null;

  if (me.data?.state !== "active") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Icon name="chat" className="size-7" />}
          title="แชทจะเปิดเมื่อแอดมินอนุมัติร้าน"
        />
      </div>
    );
  }

  return (
    <div className="grid min-h-[calc(100dvh-4rem)] md:grid-cols-[320px_1fr]">
      <aside aria-label="ห้องแชท" className="border-r border-line bg-surface">
        {chats.isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : chats.error && !chats.data ? (
          <ErrorState description={errorMessage(chats.error)} onRetry={() => chats.mutate()} />
        ) : rooms.length === 0 ? (
          <EmptyState
            icon={<Icon name="chat" className="size-7" />}
            title="ยังไม่มีแชท"
            description="แชทจะเปิดเมื่อมีออเดอร์"
          />
        ) : (
          <ul className="divide-y divide-line">
            {rooms.map((r) => {
              const on = r.orderId === selectedId;
              return (
                <li key={r.orderId}>
                  <button
                    type="button"
                    onClick={() =>
                      router.replace(`${pathname}?order=${r.orderId}`, { scroll: false })
                    }
                    aria-current={on ? "true" : undefined}
                    className={cx(
                      "relative flex w-full items-center gap-3 px-4 py-3.5 text-left transition",
                      on ? "bg-brand-50" : "hover:bg-canvas",
                    )}
                  >
                    {on && (
                      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-zoom" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold italic">{r.orderNo}</p>
                      <p
                        className={cx(
                          "truncate text-sm",
                          r.unreadMessageCount ? "font-semibold text-ink" : "text-ink-muted",
                        )}
                      >
                        {r.isClosed && !r.lastMessage
                          ? "(ห้องปิด · ออเดอร์จบแล้ว)"
                          : r.lastMessage
                            ? `${r.lastMessage.sender === "shop" ? "คุณ: " : ""}${r.lastMessage.body}`
                            : "ยังไม่มีข้อความ"}
                      </p>
                    </div>
                    {r.unreadMessageCount > 0 && (
                      <span className="min-w-6 rounded-full bg-accent-ink px-1.5 text-center text-xs leading-6 font-bold text-white">
                        {r.unreadMessageCount > 9 ? "9+" : r.unreadMessageCount}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section aria-label="บทสนทนา" className="flex min-h-0 flex-col p-4 lg:p-6">
        {selected ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-xl font-bold italic">{selected.orderNo}</h1>
              <StatusBadge status={selected.status} />
              {selected.lastMessage && (
                <span className="text-sm text-ink-muted">
                  ล่าสุด {formatDayTime(selected.lastMessage.createdAt)}
                </span>
              )}
              <Link
                href={`/shop/orders/${selected.orderId}`}
                className="ml-auto text-sm font-semibold text-brand hover:underline"
              >
                ดูออเดอร์ ›
              </Link>
            </div>
            <ChatRoom
              key={selected.orderId}
              orderId={selected.orderId}
              side="shop"
              closed={selected.isClosed}
              quickReplies={QUICK_REPLIES}
              className="flex-1"
            />
          </>
        ) : (
          <div className="m-auto">
            <EmptyState
              icon={<Icon name="chat" className="size-7" />}
              title="เลือกห้องแชททางซ้าย"
            />
          </div>
        )}
      </section>
    </div>
  );
}

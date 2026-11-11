"use client";

import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import type { Message } from "@/lib/db/types";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import { formatDayTime } from "@/lib/client/format";
import { useMessages, type Side } from "@/lib/client/hooks";
import { Button } from "./Button";
import { cx } from "./cx";
import { Skeleton } from "./Skeleton";
import { ErrorState } from "./States";

type Pending = { tempId: string; body: string; failed: boolean };

type ChatRoomProps = {
  orderId: string;
  side: Side;
  /** The order has ended: read-only (CHAT_CLOSED). */
  closed: boolean;
  /** Shop quick replies: tapping one fills the box so it can be edited before sending. */
  quickReplies?: string[];
  className?: string;
};

/**
 * Chat between customer and shop for one order (Y5/Y6). Polls via useMessages, marks the room read
 * while it is actually on screen, and keeps failed messages with a retry button.
 */
export function ChatRoom({ orderId, side, closed, quickReplies, className }: ChatRoomProps) {
  const { mutate: mutateGlobal } = useSWRConfig();
  const [closedNow, setClosedNow] = useState(false);
  const isClosed = closed || closedNow;
  const messages = useMessages(orderId, side, isClosed);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const lastSeen = useRef<string | null>(null);

  const list = messages.data ?? [];
  const newest = list.at(-1)?.id ?? null;

  // Keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newest, pending.length]);

  // Mark read when new messages arrive while the room is visible on screen
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !newest || newest === lastSeen.current) return;
    let done = false;
    const markRead = () => {
      if (done || document.visibilityState !== "visible") return;
      done = true;
      lastSeen.current = newest;
      const call = side === "customer" ? api.markMyMessagesRead : api.markShopMessagesRead;
      call(orderId)
        .then(() => {
          mutateGlobal(["chats", side]);
          mutateGlobal(
            (key) => key === "myOrders" || (Array.isArray(key) && key[0] === "shopOrders"),
          );
        })
        .catch(() => {
          lastSeen.current = null; // try again next time
        });
    };
    // "On screen" = at least a third of the chat box is visible, not just a sliver
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) markRead();
      },
      { threshold: 0.3 },
    );
    io.observe(root);
    const onVisible = () => {
      const r = root.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) markRead();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [newest, orderId, side, mutateGlobal]);

  async function send(body: string, tempId: string) {
    setPending((p) => [...p.filter((x) => x.tempId !== tempId), { tempId, body, failed: false }]);
    try {
      const call = side === "customer" ? api.sendMyMessage : api.sendShopMessage;
      const msg = await call(orderId, body);
      await messages.mutate(
        (cur: Message[] | undefined) =>
          cur?.some((m) => m.id === msg.id) ? cur : [...(cur ?? []), msg],
        { revalidate: false },
      );
      setPending((p) => p.filter((x) => x.tempId !== tempId));
    } catch (e) {
      if (isApiClientError(e) && e.code === "CHAT_CLOSED") {
        setClosedNow(true);
        setPending((p) => p.filter((x) => x.tempId !== tempId));
        return;
      }
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, failed: true } : x)));
      if (isApiClientError(e) && e.code === "RATE_LIMITED") setText(body);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    send(body, `tmp-${Date.now()}`);
  }

  const mine = side;

  return (
    <section
      ref={rootRef}
      className={cx(
        "flex min-h-0 flex-col rounded-card bg-surface shadow-card ring-1 ring-line",
        className,
      )}
    >
      <h2 className="border-b border-line px-4 py-3 font-semibold text-brand">
        {side === "customer" ? "คุยกับร้าน" : "คุยกับลูกค้า"}
      </h2>

      <div
        ref={listRef}
        className="flex max-h-[60dvh] min-h-48 flex-1 flex-col gap-2 overflow-y-auto p-4"
        aria-live="polite"
      >
        {messages.isLoading ? (
          <>
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </>
        ) : messages.error && !messages.data ? (
          <ErrorState
            description={errorMessage(messages.error)}
            onRetry={() => messages.mutate()}
          />
        ) : list.length === 0 && pending.length === 0 ? (
          <p className="m-auto text-center text-sm text-ink-muted">
            ยังไม่มีข้อความ {isClosed ? "" : "พิมพ์ถามได้เลย"}
          </p>
        ) : (
          <>
            {list.map((m) => (
              <Bubble key={m.id} message={m} mine={m.sender === mine} />
            ))}
            {pending.map((p) => (
              <div key={p.tempId} className="flex flex-col items-end gap-1">
                <p
                  className={cx(
                    "max-w-[80%] rounded-2xl rounded-br-sm px-3 py-2 break-words whitespace-pre-wrap text-white",
                    p.failed ? "bg-danger/80" : "bg-brand/70",
                  )}
                >
                  {p.body}
                </p>
                {p.failed ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-danger underline"
                    onClick={() => send(p.body, p.tempId)}
                  >
                    ส่งไม่สำเร็จ · แตะเพื่อลองใหม่
                  </button>
                ) : (
                  <span className="text-xs text-ink-muted">กำลังส่ง…</span>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {isClosed ? (
        <p className="border-t border-line bg-canvas px-4 py-3 text-center text-sm text-ink-muted">
          ออเดอร์นี้จบแล้ว แชทปิดแล้ว (อ่านย้อนหลังได้)
        </p>
      ) : (
        <div className="border-t border-line p-3">
          {quickReplies && quickReplies.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {quickReplies.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setText(q)}
                  className="shrink-0 rounded-full bg-brand-50 px-3 py-1.5 text-sm text-brand hover:bg-brand-100"
                >
                  {q.length > 28 ? `${q.slice(0, 28)}…` : q}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={submit} className="flex items-end gap-2">
            <label className="sr-only" htmlFor={`chat-${orderId}`}>
              พิมพ์ข้อความ
            </label>
            <textarea
              id={`chat-${orderId}`}
              rows={1}
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && side === "shop") {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="พิมพ์ข้อความ…"
              className="max-h-32 min-h-11 flex-1 resize-y rounded-control border border-line bg-surface px-3 py-2 focus:border-brand focus:outline-none"
            />
            <Button type="submit" disabled={!text.trim()}>
              ส่ง
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}

function Bubble({ message: m, mine }: { message: Message; mine: boolean }) {
  if (m.sender === "system") {
    return (
      <p className="mx-auto max-w-[90%] rounded-full bg-canvas px-3 py-1 text-center text-xs text-ink-muted">
        {m.body}
      </p>
    );
  }
  return (
    <div className={cx("flex flex-col gap-0.5", mine ? "items-end" : "items-start")}>
      <p
        className={cx(
          "max-w-[80%] rounded-2xl px-3 py-2 break-words whitespace-pre-wrap",
          mine ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm bg-canvas text-ink",
        )}
      >
        {m.body}
      </p>
      <span className="text-xs text-ink-muted">{formatDayTime(m.createdAt)}</span>
    </div>
  );
}

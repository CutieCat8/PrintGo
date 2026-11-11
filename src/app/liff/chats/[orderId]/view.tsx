"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ErrorState, PageShell, Skeleton, StatusBadge } from "@/components/ui";
import { ChatRoom } from "@/components/ui/ChatRoom";
import { errorMessage } from "@/lib/client/api";
import { isTerminal, useOrder } from "@/lib/client/hooks";

export function ChatRoomPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const order = useOrder(orderId, "customer");
  const o = order.data;

  return (
    <PageShell
      title={o ? o.shop.name : "แชท"}
      backHref="/liff/chats"
      actions={o && <StatusBadge status={o.status} fulfillment={o.fulfillment} />}
    >
      {order.isLoading ? (
        <Skeleton className="h-80" />
      ) : order.error && !o ? (
        <ErrorState description={errorMessage(order.error)} onRetry={() => order.mutate()} />
      ) : o ? (
        <div className="flex flex-col gap-2">
          <Link href={`/liff/orders/${o.id}`} className="text-sm text-brand underline">
            ดูออเดอร์ {o.orderNo}
          </Link>
          <ChatRoom orderId={o.id} side="customer" closed={isTerminal(o.status)} />
        </div>
      ) : null}
    </PageShell>
  );
}

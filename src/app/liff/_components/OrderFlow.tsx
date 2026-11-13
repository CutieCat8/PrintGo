"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { EmptyState, ErrorState, Icon, Skeleton, buttonClasses } from "@/components/ui";
import { errorMessage } from "@/lib/client/api";
import { filesReady, useDraft, type DraftFile, type OrderDraft } from "@/lib/client/draft";
import { useShops } from "@/lib/client/hooks";
import { positionOf, useLocation } from "@/lib/client/location";
import type { ShopListItem } from "@/lib/client/types";

/** Every file is uploaded and has a usable page count (enough to set up printing). */
export function filesUploaded(d: OrderDraft): boolean {
  return (
    d.files.length > 0 &&
    d.files.every(
      (f) => f.upload === "done" && f.path !== null && f.pageCount !== null && f.pageCount >= 1,
    )
  );
}

/** Printed pages of one file: pages × copies. (Display only; prices come from the API.) */
export const printedPages = (f: DraftFile) =>
  (f.pageCount ?? 0) * (Number.isInteger(f.copies) ? f.copies : 0);

/**
 * Set right before the order is sent: the draft is then cleared on purpose and the guard must
 * not bounce the customer back to step 1 while the order page is opening.
 */
let leavingFlow = false;
export function markOrderSent() {
  leavingFlow = true;
}

/**
 * Sends the customer back to the first step that is not done yet, e.g. after reopening a link
 * in the middle of the flow. Returns the draft for the page.
 */
export function useFlowGuard(need: "files" | "settings" | "shop") {
  const router = useRouter();
  const { draft, hydrated } = useDraft();
  useEffect(() => {
    if (!hydrated) return;
    if (leavingFlow) {
      // A new order is being started again (files picked): the guard works as usual
      if (draft.files.length > 0) leavingFlow = false;
      else return;
    }
    if (!filesUploaded(draft)) router.replace("/liff/new");
    else if (need !== "files" && !filesReady(draft)) router.replace("/liff/new/settings");
    else if (need === "shop" && !draft.shopId) router.replace("/liff/new/shop");
  }, [hydrated, draft, need, router]);
  return { draft, hydrated };
}

/** Bottom bar content: a small summary line above the main button. */
export function FlowFooter({ summary, children }: { summary?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {summary && <p className="text-sm text-ink-muted">{summary}</p>}
      {children}
    </div>
  );
}

/** The shop chosen in step 3, from the cached shop list (same request as the picker). */
export function useChosenShop(shopId: string | null) {
  const pos = positionOf(useLocation());
  const shops = useShops(pos);
  return { ...shops, shop: shops.data?.find((s) => s.id === shopId) ?? null, pos };
}

/**
 * Renders the step only when the chosen shop is known. Loading → skeleton; the shop list
 * failed → error with retry; the shop is gone (paused/closed/suspended meanwhile) → pick again.
 */
export function ChosenShopGate({
  hydrated,
  chosen,
  children,
}: {
  hydrated: boolean;
  chosen: ReturnType<typeof useChosenShop>;
  children: (shop: ShopListItem) => ReactNode;
}) {
  if (!hydrated || (chosen.isLoading && !chosen.data)) return <Skeleton className="h-64" />;
  if (chosen.error && !chosen.data) {
    return <ErrorState description={errorMessage(chosen.error)} onRetry={() => chosen.mutate()} />;
  }
  if (!chosen.shop) {
    return (
      <EmptyState
        icon={<Icon name="store" className="size-7" />}
        title="ไม่พบร้านที่เลือก"
        description="ร้านอาจหยุดรับงานหรือปิดไปแล้ว กรุณาเลือกร้านใหม่"
        action={
          <Link href="/liff/new/shop" className={buttonClasses({})}>
            เลือกร้านใหม่
          </Link>
        }
      />
    );
  }
  return <>{children(chosen.shop)}</>;
}

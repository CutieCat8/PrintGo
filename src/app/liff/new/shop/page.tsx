"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  Money,
  PageShell,
  Skeleton,
  SkeletonCard,
  Steps,
  cx,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { toEstimateRequest, updateDraft, type OrderDraft } from "@/lib/client/draft";
import { useShops } from "@/lib/client/hooks";
import { positionOf, requestLocation, skipLocation, useLocation } from "@/lib/client/location";
import type { EstimateResult, ShopListItem } from "@/lib/client/types";
import { useFlowGuard } from "../../_components/OrderFlow";
import { ORDER_STEPS } from "../../_components/steps";

type Sort = "near" | "cheap" | "open";
type Quote = { kind: "price"; satang: number } | { kind: "manual" } | { kind: "none" };

/**
 * Estimated price of this order at every open shop (one /estimate call each, pickup, no
 * services). The page never computes a price itself.
 */
function useShopQuotes(shops: ShopListItem[] | undefined, draft: OrderDraft) {
  const open = (shops ?? []).filter((s) => s.isOpen && !s.isPaused);
  const files = toEstimateRequest(
    { ...draft, services: [], fulfillment: "pickup" },
    "",
    null,
  ).files;
  return useSWR(
    open.length ? ["shopQuotes", open.map((s) => s.id).join(","), JSON.stringify(files)] : null,
    async () => {
      const results = await Promise.allSettled(
        open.map((s) => api.estimate({ shopId: s.id, fulfillment: "pickup", files, services: [] })),
      );
      const map: Record<string, Quote> = {};
      results.forEach((r, i) => {
        const est: EstimateResult | null = r.status === "fulfilled" ? r.value : null;
        map[open[i].id] = !est
          ? { kind: "none" }
          : est.requiresManualPrice || est.totalSatang === null
            ? { kind: "manual" }
            : { kind: "price", satang: est.totalSatang };
      });
      return map;
    },
    { revalidateOnFocus: false },
  );
}

/** C5 · step 3: choose a shop. Closed/paused shops cannot be chosen; no location → by name. */
export default function PickShopPage() {
  const router = useRouter();
  const { draft } = useFlowGuard("settings");
  const location = useLocation();
  const pos = positionOf(location);
  const asked = location.kind !== "idle" && location.kind !== "asking";
  const shops = useShops(asked ? pos : null);
  const quotes = useShopQuotes(asked ? shops.data : undefined, draft);
  const [sort, setSort] = useState<Sort>("near");

  function choose(shop: ShopListItem) {
    updateDraft((d) => ({
      ...d,
      shopId: shop.id,
      // Services belong to one shop: a new shop starts with none selected
      services: d.shopId === shop.id ? d.services : [],
      fulfillment: shop.acceptsDelivery && pos ? d.fulfillment : "pickup",
    }));
    router.push(shop.services.length > 0 ? "/liff/new/services" : "/liff/new/delivery");
  }

  const priceOf = (s: ShopListItem) => {
    const q = quotes.data?.[s.id];
    return q?.kind === "price" ? q.satang : Number.POSITIVE_INFINITY;
  };
  let list = [...(shops.data ?? [])];
  if (sort === "open") list = list.filter((s) => s.isOpen && !s.isPaused);
  if (sort === "cheap") list.sort((a, b) => priceOf(a) - priceOf(b));
  // Available shops first, keeping the API order (distance, or name without location)
  list.sort((a, b) => Number(b.isOpen && !b.isPaused) - Number(a.isOpen && !a.isPaused));

  return (
    <PageShell title="เลือกร้านปริ้น" backHref="/liff/new/settings">
      <Steps steps={ORDER_STEPS} current={2} className="mb-5" />
      <LocationBar />

      {asked && (
        <div className="mt-4 mb-3 flex gap-2" role="radiogroup" aria-label="เรียงร้าน">
          {(
            [
              ["near", pos ? "ใกล้สุด" : "ตามชื่อ"],
              ["cheap", "ราคาถูกสุด"],
              ["open", "เปิดอยู่"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={sort === key}
              onClick={() => setSort(key)}
              className={cx(
                "rounded-full px-4 py-1.5 text-sm font-semibold transition",
                sort === key
                  ? "bg-ink text-white"
                  : "bg-surface text-ink ring-1 ring-line hover:ring-ink/40",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!asked ? null : shops.isLoading ? (
        <div className="flex flex-col gap-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : shops.error ? (
        <ErrorState description={errorMessage(shops.error)} onRetry={() => shops.mutate()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Icon name="store" className="size-7" />}
          title="ยังไม่มีร้านที่เปิดให้บริการ"
          description="ลองใหม่อีกครั้งภายหลัง"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((shop) => (
            <ShopCard
              key={shop.id}
              shop={shop}
              quote={quotes.data?.[shop.id]}
              quoting={quotes.isLoading}
              selected={draft.shopId === shop.id}
              onChoose={() => choose(shop)}
            />
          ))}
        </ul>
      )}

      {asked && (
        <p className="mt-4 flex gap-2 rounded-card bg-surface px-4 py-3 text-sm text-ink-muted ring-1 ring-line">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          ร้านที่มีงานต้องตกลงราคา จะมีป้าย &quot;ร้านกรอกราคาให้&quot; ก่อนแสดงยอดจริง
        </p>
      )}
    </PageShell>
  );
}

function LocationBar() {
  const location = useLocation();
  if (location.kind === "granted") {
    return (
      <p className="flex items-center gap-2 text-sm text-success-ink">
        <Icon name="pin" className="size-4" />
        ใช้ตำแหน่งปัจจุบัน · เรียงร้านจากใกล้ไปไกล
      </p>
    );
  }
  if (location.kind === "idle" || location.kind === "asking") {
    return (
      <div className="overflow-hidden rounded-card bg-race p-5 text-white">
        <p className="flex items-center gap-2 font-display text-lg font-bold italic">
          <Icon name="pin" className="size-5 text-accent" />
          หาร้านใกล้คุณ
        </p>
        <p className="mt-1 text-sm text-white/75">
          ใช้ตำแหน่งเพื่อเรียงร้านใกล้คุณ และเป็นจุดส่งถ้าให้ไรเดอร์ไปส่ง
          ไม่อนุญาตก็ยังรับเองที่ร้านได้
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button fullWidth loading={location.kind === "asking"} onClick={requestLocation}>
            อนุญาตตำแหน่ง
          </Button>
          <button
            type="button"
            onClick={skipLocation}
            className="min-h-11 text-sm font-semibold text-white/80 hover:text-white"
          >
            ไม่อนุญาต ดูร้านทั้งหมด
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-card bg-surface px-4 py-3 ring-1 ring-line">
      <Icon name="pin" className="size-5 shrink-0 text-ink-muted" />
      <p className="min-w-0 flex-1 text-sm text-ink-muted">
        {location.kind === "denied" ? "ไม่ได้ใช้ตำแหน่ง" : "หาตำแหน่งไม่สำเร็จ"} · เรียงตามชื่อ
        จัดส่งถึงที่ไม่ได้
        {location.kind === "denied" && (
          <span className="block text-xs">
            กดแล้วไม่มีอะไรขึ้น? เปิดสิทธิ์ตำแหน่งของ LINE ในการตั้งค่าโทรศัพท์
          </span>
        )}
      </p>
      <Button variant="secondary" size="sm" onClick={requestLocation}>
        ใช้ตำแหน่ง
      </Button>
    </div>
  );
}

function openText(shop: ShopListItem): string {
  if (shop.isPaused) return "หยุดรับงานชั่วคราว";
  if (shop.isOpen) return shop.closesAt ? `เปิดถึง ${shop.closesAt}` : "เปิดอยู่";
  return shop.opensAt ? `ปิดอยู่ · เปิด ${shop.opensAt}` : "ปิดอยู่";
}

function ShopCard({
  shop,
  quote,
  quoting,
  selected,
  onChoose,
}: {
  shop: ShopListItem;
  quote: Quote | undefined;
  quoting: boolean;
  selected: boolean;
  onChoose: () => void;
}) {
  const available = shop.isOpen && !shop.isPaused;

  return (
    <li
      className={cx(
        "rounded-card bg-surface p-4 ring-1 transition",
        selected ? "ring-2 ring-accent-ink" : "ring-line",
        available ? "hover:shadow-raised" : "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cx(
            "flex size-14 shrink-0 items-center justify-center rounded-2xl text-white",
            available ? "bg-race" : "bg-ink-subtle",
          )}
        >
          <Icon name="store" className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{shop.name}</p>
          <p className="text-sm text-ink-muted">
            {shop.distanceKm !== null && `${shop.distanceKm.toFixed(1)} กม. · `}
            <span className={available ? "text-success-ink" : ""}>{openText(shop)}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-muted">
            {shop.acceptsDelivery && (
              <span className="inline-flex items-center gap-1">
                <Icon name="truck" className="size-3.5" />
                รับจัดส่ง
              </span>
            )}
            {shop.services.length > 0 && <span>บริการเสริม {shop.services.length} อย่าง</span>}
            {!available && <span>ยังรับออเดอร์ไม่ได้</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {available &&
            (quoting && !quote ? (
              <Skeleton className="h-5 w-20" />
            ) : quote?.kind === "price" ? (
              <p className="text-right text-xs text-ink-muted">
                ประมาณ
                <span className="block font-display text-lg leading-tight font-bold text-ink italic">
                  <Money satang={quote.satang} />
                </span>
              </p>
            ) : quote?.kind === "manual" ? (
              <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-ink">
                ร้านกรอกราคาให้
              </span>
            ) : null)}
          {available ? (
            <Button size="sm" onClick={onChoose} aria-label={`เลือก${shop.name}`}>
              เลือก
            </Button>
          ) : (
            <span className="px-2 text-ink-muted" aria-hidden="true">
              —
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

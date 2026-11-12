"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Money,
  PageShell,
  SkeletonCard,
  Steps,
  cx,
} from "@/components/ui";
import { errorMessage } from "@/lib/client/api";
import { filesReady, updateDraft, useDraft } from "@/lib/client/draft";
import {
  EXTRA_LABEL,
  servicesForExtras,
  shopExtras,
  wantedExtras,
  type ExtraKey,
} from "@/lib/client/extras";
import { useShops } from "@/lib/client/hooks";
import { positionOf, requestLocation, skipLocation, useLocation } from "@/lib/client/location";
import type { ShopListItem } from "@/lib/client/types";
import { ORDER_STEPS } from "../../_components/steps";

export default function PickShopPage() {
  const router = useRouter();
  const { draft, hydrated } = useDraft();
  const location = useLocation();
  const pos = positionOf(location);
  const asked = location.kind !== "idle" && location.kind !== "asking";
  const shops = useShops(asked ? pos : null);
  const wanted = wantedExtras(draft.files);

  // Came here without files (e.g. reopened the link): back to the form
  useEffect(() => {
    if (hydrated && !filesReady(draft)) router.replace("/liff/new");
  }, [hydrated, draft, router]);

  function choose(shop: ShopListItem) {
    updateDraft((d) => ({
      ...d,
      shopId: shop.id,
      // Services belong to one shop: a new shop starts with the ones matching the files' wishes
      // (ปกใส, เข้าเล่ม ...), which the customer can still change on the summary page
      services: d.shopId === shop.id ? d.services : servicesForExtras(shop.services, d.files),
      fulfillment: shop.acceptsDelivery && pos ? d.fulfillment : "pickup",
    }));
    router.push("/liff/new/summary");
  }

  return (
    <PageShell title="เลือกร้าน" backHref="/liff/new">
      <div className="flex flex-col gap-3">
        <Steps steps={ORDER_STEPS} current={1} className="mb-1" />
        {wanted.length > 0 && (
          <p className="rounded-control bg-brand-50 px-3 py-2 text-sm text-brand">
            งานเพิ่มเติมที่คุณเลือก: <b>{wanted.map((k) => EXTRA_LABEL[k]).join(", ")}</b> ·
            ร้านที่มีครบจะมีเครื่องหมาย ✓
          </p>
        )}
        <LocationCard />

        {!asked ? null : shops.isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : shops.error ? (
          <ErrorState description={errorMessage(shops.error)} onRetry={() => shops.mutate()} />
        ) : !shops.data?.length ? (
          <EmptyState
            icon="🏪"
            title="ยังไม่มีร้านที่เปิดให้บริการ"
            description="ลองใหม่อีกครั้งภายหลัง"
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {shops.data.map((shop) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                selected={draft.shopId === shop.id}
                wanted={wanted}
                onChoose={() => choose(shop)}
              />
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}

function LocationCard() {
  const location = useLocation();
  if (location.kind === "granted") return null;

  if (location.kind === "idle" || location.kind === "asking") {
    return (
      <Card>
        <h2 className="font-semibold text-brand">📍 ขอใช้ตำแหน่งของคุณ</h2>
        <p className="mt-1 text-sm text-ink-muted">
          เพื่อแสดงร้านใกล้คุณ และใช้เป็นจุดส่งถ้าเลือกให้ไรเดอร์ไปส่ง
          ถ้าไม่อนุญาตก็ยังเลือกร้านและรับเองที่ร้านได้
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Button fullWidth loading={location.kind === "asking"} onClick={requestLocation}>
            อนุญาตตำแหน่ง
          </Button>
          <SkipButton />
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-warning-50">
      <p className="text-sm text-warning-ink">
        {location.kind === "denied"
          ? "ไม่ได้อนุญาตตำแหน่ง: แสดงร้านเรียงตามชื่อ และเลือกได้เฉพาะรับเองที่ร้าน"
          : "หาตำแหน่งไม่สำเร็จ: แสดงร้านเรียงตามชื่อ และเลือกได้เฉพาะรับเองที่ร้าน"}
      </p>
      <Button variant="secondary" size="sm" className="mt-2" onClick={requestLocation}>
        ขออนุญาตตำแหน่งอีกครั้ง
      </Button>
      {location.kind === "denied" && (
        <p className="mt-2 text-xs text-ink-muted">
          ถ้ากดแล้วไม่มีอะไรขึ้น ให้เปิดสิทธิ์ตำแหน่งของ LINE ในการตั้งค่าโทรศัพท์
          แล้วเปิดหน้านี้ใหม่
        </p>
      )}
    </Card>
  );
}

function SkipButton() {
  return (
    <Button variant="ghost" fullWidth onClick={skipLocation}>
      ไม่อนุญาต ดูร้านทั้งหมด
    </Button>
  );
}

function openText(shop: ShopListItem): string {
  if (shop.isPaused) return "พักรับงานชั่วคราว";
  if (shop.isOpen) return shop.closesAt ? `เปิดอยู่ · ปิด ${shop.closesAt} น.` : "เปิดอยู่";
  return shop.opensAt ? `ปิดอยู่ · เปิด ${shop.opensAt} น.` : "ปิดอยู่";
}

function ShopCard({
  shop,
  selected,
  wanted,
  onChoose,
}: {
  shop: ShopListItem;
  selected: boolean;
  wanted: ExtraKey[];
  onChoose: () => void;
}) {
  const available = shop.isOpen && !shop.isPaused;
  const extras = shopExtras(shop.services, wanted);
  const chips = shop.services.slice(0, 4);
  const more = shop.services.length - chips.length;

  return (
    <li>
      <button
        type="button"
        disabled={!available}
        onClick={onChoose}
        aria-pressed={selected}
        className={cx(
          "w-full rounded-card bg-surface p-4 text-left shadow-card ring-1 ring-line transition",
          available ? "hover:ring-brand/40" : "cursor-not-allowed opacity-70",
          selected && "ring-2 ring-accent-ink",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-control bg-brand-50 text-xl"
          >
            🏪
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-brand">{shop.name}</p>
            <p className="truncate text-sm text-ink-muted">{shop.address}</p>
          </div>
          {shop.distanceKm !== null && (
            <span className="shrink-0 text-sm font-medium text-ink-muted">
              ~{shop.distanceKm.toFixed(1)} กม.
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={available ? "green" : shop.isPaused ? "amber" : "gray"}>
            {openText(shop)}
          </Badge>
          {shop.acceptsDelivery && <Badge tone="blue">รับจัดส่ง</Badge>}
          <span className="text-sm">
            เริ่ม <Money satang={shop.startingPriceSatang} />
            /หน้า
          </span>
        </div>
        {wanted.length > 0 && (
          <p className="mt-2 text-sm">
            {extras.has.length > 0 && (
              <span className="font-medium text-success-ink">
                ✓ มี{extras.has.map((k) => EXTRA_LABEL[k]).join(", ")}
              </span>
            )}
            {extras.has.length > 0 && extras.missing.length > 0 && " · "}
            {extras.missing.length > 0 && (
              <span className="text-ink-muted">
                ✕ ไม่มี{extras.missing.map((k) => EXTRA_LABEL[k]).join(", ")}
              </span>
            )}
          </p>
        )}
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {chips.map((s) => (
              <span key={s.id} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand">
                {s.name}
              </span>
            ))}
            {more > 0 && (
              <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-muted">
                +{more}
              </span>
            )}
          </div>
        )}
      </button>
    </li>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  Button,
  Card,
  Checkbox,
  ChoiceGroup,
  EmptyState,
  ErrorState,
  Input,
  Money,
  PageShell,
  Radio,
  Skeleton,
  Textarea,
  buttonClasses,
  useToast,
} from "@/components/ui";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import {
  clearDraft,
  filesReady,
  toCreateOrderRequest,
  toEstimateRequest,
  updateDraft,
  useDraft,
  type OrderDraft,
} from "@/lib/client/draft";
import { UNIT_LABEL, fileSettingsText, isThaiPhone } from "@/lib/client/format";
import { useShops } from "@/lib/client/hooks";
import { positionOf, requestLocation, useLocation } from "@/lib/client/location";
import type { EstimateResult, ShopListItem } from "@/lib/client/types";

export default function SummaryPage() {
  const router = useRouter();
  const toast = useToast();
  const { draft, hydrated } = useDraft();
  const location = useLocation();
  const pos = positionOf(location);
  // "asking" again (re-request from this page) must not bounce the customer back to the shop list
  const asked = location.kind !== "idle";
  const shops = useShops(asked ? pos : null);
  const shop = shops.data?.find((s) => s.id === draft.shopId) ?? null;
  const [sending, setSending] = useState(false);
  const sentRef = useRef(false);

  useEffect(() => {
    // After a successful send the draft is cleared on purpose: do not bounce back to the form
    if (!hydrated || sentRef.current) return;
    if (!filesReady(draft)) router.replace("/liff/new");
    else if (!draft.shopId || !asked) router.replace("/liff/new/shop");
  }, [hydrated, draft, asked, router]);

  const canDeliver = Boolean(shop?.acceptsDelivery && pos);
  const fulfillment = draft.fulfillment === "delivery" && canDeliver ? "delivery" : "pickup";
  const effective: OrderDraft = { ...draft, fulfillment };

  const estimateBody = shop ? toEstimateRequest(effective, shop.id, pos) : null;
  const estimate = useSWR(estimateBody ? ["estimate", JSON.stringify(estimateBody)] : null, () =>
    api.estimate(estimateBody!),
  );

  const deliveryErrors = {
    name: draft.delivery.name.trim() ? undefined : "กรอกชื่อผู้รับ",
    phone: isThaiPhone(draft.delivery.phone) ? undefined : "เบอร์โทร 9–10 หลัก ขึ้นต้นด้วย 0",
    address: draft.delivery.address.trim() ? undefined : "กรอกที่อยู่และรายละเอียดจุดส่ง",
  };
  const deliveryOk =
    fulfillment === "pickup" || Object.values(deliveryErrors).every((e) => e === undefined);
  const [showErrors, setShowErrors] = useState(false);

  async function submit() {
    if (!shop || sentRef.current) return;
    if (!deliveryOk) {
      setShowErrors(true);
      return;
    }
    sentRef.current = true; // a double tap must create one order only
    setSending(true);
    try {
      const order = await api.createOrder(toCreateOrderRequest(effective, shop.id, pos));
      clearDraft();
      router.replace(`/liff/orders/${order.id}`);
    } catch (e) {
      sentRef.current = false;
      setSending(false);
      if (isApiClientError(e) && (e.code === "SHOP_CLOSED" || e.code === "SHOP_PAUSED")) {
        toast(errorMessage(e), "error");
        updateDraft((d) => ({ ...d, shopId: null, services: [] }));
        shops.mutate();
        router.replace("/liff/new/shop");
        return;
      }
      toast(errorMessage(e), "error");
    }
  }

  if (!hydrated || !asked || shops.isLoading) {
    return (
      <PageShell title="สรุปออเดอร์" backHref="/liff/new/shop">
        <Skeleton className="h-40" />
      </PageShell>
    );
  }

  if (shops.error) {
    return (
      <PageShell title="สรุปออเดอร์" backHref="/liff/new/shop">
        <ErrorState description={errorMessage(shops.error)} onRetry={() => shops.mutate()} />
      </PageShell>
    );
  }

  if (!shop) {
    return (
      <PageShell title="สรุปออเดอร์" backHref="/liff/new/shop">
        <EmptyState
          icon="🏪"
          title="ไม่พบร้านที่เลือก"
          description="ร้านอาจปิดรับงานแล้ว กรุณาเลือกร้านใหม่"
          action={
            <Link href="/liff/new/shop" className={buttonClasses({})}>
              เลือกร้านใหม่
            </Link>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="สรุปออเดอร์"
      backHref="/liff/new/shop"
      footer={
        <Button
          fullWidth
          size="lg"
          loading={sending}
          disabled={sending || !estimate.data}
          onClick={submit}
        >
          ส่งให้ร้านยืนยัน
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-ink-muted">ร้าน</p>
              <p className="font-semibold text-brand">{shop.name}</p>
              <p className="text-sm text-ink-muted">{shop.address}</p>
            </div>
            <Link href="/liff/new/shop" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              เปลี่ยน
            </Link>
          </div>
        </Card>

        <Card>
          <ChoiceGroup legend="วิธีรับงาน">
            <Radio
              name="fulfillment"
              checked={fulfillment === "pickup"}
              onChange={() => updateDraft((d) => ({ ...d, fulfillment: "pickup" }))}
              label="รับเองที่ร้าน"
            />
            <Radio
              name="fulfillment"
              checked={fulfillment === "delivery"}
              disabled={!canDeliver}
              onChange={() => updateDraft((d) => ({ ...d, fulfillment: "delivery" }))}
              label="ส่งถึงที่ (ไรเดอร์)"
              description={
                !shop.acceptsDelivery
                  ? "ร้านนี้ไม่รับจัดส่ง"
                  : !pos
                    ? "ต้องอนุญาตตำแหน่งก่อน จึงเลือกส่งถึงที่ได้"
                    : undefined
              }
            />
          </ChoiceGroup>
          {shop.acceptsDelivery && !pos && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              loading={location.kind === "asking"}
              onClick={requestLocation}
            >
              ขออนุญาตตำแหน่งอีกครั้ง
            </Button>
          )}

          {fulfillment === "delivery" && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="rounded-control bg-info-50 p-3 text-sm text-info-ink">
                ไรเดอร์จะไปส่งตามตำแหน่งที่คุณอนุญาตตอนนี้และที่อยู่ที่กรอก
                ถ้าตอนนี้ไม่ได้อยู่ที่จุดส่ง ให้ระบุรายละเอียดในช่องที่อยู่
              </p>
              <Input
                label="ชื่อผู้รับ"
                required
                autoComplete="name"
                value={draft.delivery.name}
                error={showErrors ? deliveryErrors.name : undefined}
                onChange={(e) =>
                  updateDraft((d) => ({ ...d, delivery: { ...d.delivery, name: e.target.value } }))
                }
              />
              <Input
                label="เบอร์โทรผู้รับ"
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={draft.delivery.phone}
                error={showErrors ? deliveryErrors.phone : undefined}
                onChange={(e) =>
                  updateDraft((d) => ({ ...d, delivery: { ...d.delivery, phone: e.target.value } }))
                }
              />
              <Textarea
                label="ที่อยู่และรายละเอียดจุดส่ง"
                required
                rows={3}
                maxLength={500}
                placeholder="เช่น หอพัก A ตึก 2 ห้อง 305 ฝากไว้ที่ป้อมยาม"
                value={draft.delivery.address}
                error={showErrors ? deliveryErrors.address : undefined}
                onChange={(e) =>
                  updateDraft((d) => ({
                    ...d,
                    delivery: { ...d.delivery, address: e.target.value },
                  }))
                }
              />
            </div>
          )}
        </Card>

        <ServicesCard shop={shop} draft={draft} />

        <Card>
          <h2 className="font-semibold text-brand">ไฟล์ ({draft.files.length})</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {draft.files.map((f) => (
              <li key={f.key} className="text-sm">
                <p className="truncate font-medium">{f.name}</p>
                <p className="text-ink-muted">{fileSettingsText(f)}</p>
              </li>
            ))}
          </ul>
          {draft.note.trim() && (
            <p className="mt-3 text-sm">
              <span className="text-ink-muted">หมายเหตุ: </span>
              {draft.note}
            </p>
          )}
          <Link
            href="/liff/new"
            className={buttonClasses({ variant: "ghost", size: "sm", className: "mt-2" })}
          >
            แก้ไขไฟล์
          </Link>
        </Card>

        <EstimateCard
          loading={estimate.isLoading}
          error={estimate.error}
          data={estimate.data}
          onRetry={() => estimate.mutate()}
        />
      </div>
    </PageShell>
  );
}

function ServicesCard({ shop, draft }: { shop: ShopListItem; draft: OrderDraft }) {
  if (shop.services.length === 0) return null;
  const manyFiles = draft.files.length > 1;

  function toggle(serviceId: string, on: boolean) {
    updateDraft((d) => ({
      ...d,
      services: on
        ? [...d.services, { serviceId }]
        : d.services.filter((s) => s.serviceId !== serviceId),
    }));
  }

  function toggleFile(serviceId: string, index: number, on: boolean) {
    updateDraft((d) => ({
      ...d,
      services: d.services.map((s) => {
        if (s.serviceId !== serviceId) return s;
        const all = d.files.map((_, i) => i);
        const current = s.fileIndexes ?? all;
        const next = on
          ? [...new Set([...current, index])].sort()
          : current.filter((i) => i !== index);
        // every file again = leave it out (the API default)
        return next.length === all.length ? { serviceId } : { serviceId, fileIndexes: next };
      }),
    }));
  }

  return (
    <Card>
      <h2 className="font-semibold text-brand">บริการเสริมของร้านนี้</h2>
      <div className="mt-2 flex flex-col gap-3">
        {shop.services.map((s) => {
          const chosen = draft.services.find((x) => x.serviceId === s.id);
          return (
            <div key={s.id}>
              <Checkbox
                checked={Boolean(chosen)}
                onChange={(e) => toggle(s.id, e.target.checked)}
                label={s.name}
                description={
                  s.priceSatang === null ? (
                    "ราคาตามตกลง (ร้านจะแจ้งราคา)"
                  ) : (
                    <>
                      <Money satang={s.priceSatang} />/{UNIT_LABEL[s.unit]}
                    </>
                  )
                }
              />
              {chosen && s.unit === "per_set" && manyFiles && (
                <fieldset className="mt-1 ml-9 flex flex-col gap-1">
                  <legend className="text-sm text-ink-muted">ใช้กับไฟล์</legend>
                  {draft.files.map((f, i) => (
                    <Checkbox
                      key={f.key}
                      checked={(chosen.fileIndexes ?? draft.files.map((_, j) => j)).includes(i)}
                      disabled={chosen.fileIndexes?.length === 1 && chosen.fileIndexes[0] === i}
                      onChange={(e) => toggleFile(s.id, i, e.target.checked)}
                      label={<span className="text-sm">{f.name}</span>}
                    />
                  ))}
                </fieldset>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Line({
  label,
  children,
  note,
}: {
  label: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt>
        {label}
        {note && <span className="ml-1 text-xs text-ink-muted">({note})</span>}
      </dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function EstimateCard({
  loading,
  error,
  data,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  data: EstimateResult | undefined;
  onRetry: () => void;
}) {
  if (loading && !data) return <Skeleton className="h-32" />;
  if (error && !data) {
    return (
      <ErrorState title="คำนวณราคาไม่สำเร็จ" description={errorMessage(error)} onRetry={onRetry} />
    );
  }
  if (!data) return null;

  return (
    <Card aria-live="polite">
      <h2 className="font-semibold text-brand">ราคาประมาณ</h2>
      {data.requiresManualPrice && (
        <p className="mt-2 rounded-control bg-warning-50 p-3 text-sm text-warning-ink">
          ออเดอร์ขนาดใหญ่ ร้านจะแจ้งราคาให้เร็ว ๆ นี้ หลังร้านยืนยันแล้วคุณจะเห็นยอดที่ต้องชำระ
        </p>
      )}
      <dl className="mt-2 flex flex-col gap-1.5">
        {data.estimatedPrintSatang !== null && (
          <Line label="ค่าปริ้น">
            <Money satang={data.estimatedPrintSatang} />
          </Line>
        )}
        {data.serviceLines.map((l, i) => (
          // a per-set service has one line per file, so the id repeats
          <Line key={`${l.serviceId}-${i}`} label={`${l.name} × ${l.quantity}`}>
            {l.lineTotalSatang === null ? (
              <span className="text-sm text-ink-muted">ราคาตามตกลง</span>
            ) : (
              <Money satang={l.lineTotalSatang} />
            )}
          </Line>
        ))}
        {data.platformFeeSatang !== null && (
          <Line label="ค่าบริการ">
            <Money satang={data.platformFeeSatang} />
          </Line>
        )}
        {data.deliveryFeeSatang > 0 && (
          <Line label="ค่าส่ง" note="ค่าประมาณ">
            <Money satang={data.deliveryFeeSatang} />
          </Line>
        )}
        {data.totalSatang !== null && (
          <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2 text-lg font-semibold">
            <dt>รวม</dt>
            <dd>
              <Money satang={data.totalSatang} />
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-2 text-xs text-ink-muted">
        ร้านจะยืนยันราคาอีกครั้งก่อนให้ชำระเงิน · ชำระแล้วยกเลิกเองไม่ได้
      </p>
    </Card>
  );
}

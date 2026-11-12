"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Button, Icon, Input, Money, PageShell, Steps, Textarea, cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import { toEstimateRequest, updateDraft } from "@/lib/client/draft";
import { isThaiPhone } from "@/lib/client/format";
import { requestLocation, useLocation } from "@/lib/client/location";
import { ChosenShopGate, useChosenShop, useFlowGuard } from "../../_components/OrderFlow";
import { ORDER_STEPS } from "../../_components/steps";

/** C7 · step 5: pickup at the shop, or delivery to the customer's current location (D24). */
export default function DeliveryPage() {
  const router = useRouter();
  const { draft, hydrated } = useFlowGuard("shop");
  const location = useLocation();
  const chosen = useChosenShop(draft.shopId);
  const { shop, pos } = chosen;
  const [touched, setTouched] = useState(false);

  const canDeliver = Boolean(shop?.acceptsDelivery && pos);
  const delivery = draft.fulfillment === "delivery" && canDeliver;
  // Delivery was chosen but the location is gone (e.g. LIFF reloaded): ask again or pick up
  const wantsDeliveryNoLocation = draft.fulfillment === "delivery" && !canDeliver;

  // Delivery fee is an estimate from the API (O5), shown on the option before it is chosen
  const feeBody =
    shop && pos ? toEstimateRequest({ ...draft, fulfillment: "delivery" }, shop.id, pos) : null;
  const fee = useSWR(
    canDeliver && feeBody ? ["deliveryFee", JSON.stringify(feeBody)] : null,
    () => api.estimate(feeBody!),
    { shouldRetryOnError: false, revalidateOnFocus: false },
  );

  const errors = {
    address: draft.delivery.address.trim() ? undefined : "กรอกที่อยู่จัดส่ง",
    name: draft.delivery.name.trim() ? undefined : "กรอกชื่อผู้รับ",
    phone: isThaiPhone(draft.delivery.phone) ? undefined : "เบอร์โทร 9–10 หลัก ขึ้นต้นด้วย 0",
  };
  const ok = !wantsDeliveryNoLocation && (!delivery || Object.values(errors).every((e) => !e));

  function setInfo(patch: Partial<typeof draft.delivery>) {
    updateDraft((d) => ({ ...d, delivery: { ...d.delivery, ...patch } }));
  }

  return (
    <PageShell
      title="รับงาน"
      backHref={shop && shop.services.length > 0 ? "/liff/new/services" : "/liff/new/shop"}
      footer={
        <Button
          fullWidth
          size="lg"
          arrow
          onClick={() => {
            setTouched(true);
            if (ok) router.push("/liff/new/summary");
          }}
        >
          ดูสรุปออเดอร์
        </Button>
      }
    >
      <Steps steps={ORDER_STEPS} current={4} className="mb-5" />

      <ChosenShopGate hydrated={hydrated} chosen={chosen}>
        {(shop) => (
          <div className="flex flex-col gap-3" role="radiogroup" aria-label="วิธีรับงาน">
            <Option
              selected={draft.fulfillment !== "delivery"}
              onSelect={() => updateDraft((d) => ({ ...d, fulfillment: "pickup" }))}
              icon="store"
              title="รับเองที่ร้าน"
              detail="ฟรี · ใช้รหัสรับงาน 4 หลักตอนมารับ"
            />

            <Option
              selected={draft.fulfillment === "delivery"}
              disabled={!canDeliver}
              onSelect={() => updateDraft((d) => ({ ...d, fulfillment: "delivery" }))}
              icon="truck"
              title="ส่งถึงที่"
              detail={
                !shop.acceptsDelivery ? (
                  "ร้านนี้ไม่รับจัดส่ง"
                ) : !pos ? (
                  "ต้องอนุญาตตำแหน่งก่อน จึงเลือกส่งถึงที่ได้"
                ) : fee.isLoading ? (
                  "กำลังคำนวณค่าส่ง…"
                ) : fee.data ? (
                  <>
                    ค่าส่งประมาณ <Money satang={fee.data.deliveryFeeSatang} /> (ค่าประมาณ)
                  </>
                ) : (
                  "ค่าส่งเป็นค่าประมาณ"
                )
              }
            >
              {shop.acceptsDelivery && !pos && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  loading={location.kind === "asking"}
                  onClick={requestLocation}
                >
                  <Icon name="pin" className="size-4" />
                  ขออนุญาตตำแหน่งใหม่
                </Button>
              )}
              {wantsDeliveryNoLocation && touched && (
                <p role="alert" className="mt-3 text-sm font-medium text-danger">
                  ส่งถึงที่ต้องใช้ตำแหน่งปัจจุบัน กดขออนุญาตตำแหน่งใหม่ หรือเลือกรับเองที่ร้าน
                </p>
              )}
              {delivery && (
                <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                  <p className="flex items-center gap-2 rounded-xl bg-success-50 px-3 py-2 text-sm text-success-ink">
                    <Icon name="pin" className="size-4" />
                    ใช้ตำแหน่งปัจจุบัน · อนุญาตแล้ว
                  </p>
                  <Textarea
                    label="ที่อยู่จัดส่ง"
                    required
                    rows={2}
                    maxLength={500}
                    placeholder="บ้านเลขที่ ซอย ถนน ตึก ห้อง ฝากไว้ที่ไหน…"
                    value={draft.delivery.address}
                    error={touched ? errors.address : undefined}
                    onChange={(e) => setInfo({ address: e.target.value })}
                  />
                  <Input
                    label="ชื่อผู้รับ"
                    required
                    autoComplete="name"
                    placeholder="ชื่อ-นามสกุล"
                    value={draft.delivery.name}
                    error={touched ? errors.name : undefined}
                    onChange={(e) => setInfo({ name: e.target.value })}
                  />
                  <Input
                    label="เบอร์โทรผู้รับ"
                    required
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="08x-xxx-xxxx"
                    value={draft.delivery.phone}
                    error={touched ? errors.phone : undefined}
                    onChange={(e) => setInfo({ phone: e.target.value })}
                  />
                  <p className="flex gap-1.5 text-xs text-warning-ink">
                    <Icon name="alert" className="size-4 shrink-0" />
                    ตำแหน่งจะใช้คำนวณค่าส่ง ถ้าตอนนี้ไม่ได้อยู่ที่จุดส่ง ค่าส่งอาจคลาดเคลื่อน
                    ระบุรายละเอียดในช่องที่อยู่
                  </p>
                </div>
              )}
            </Option>
          </div>
        )}
      </ChosenShopGate>
    </PageShell>
  );
}

function Option({
  selected,
  disabled,
  onSelect,
  icon,
  title,
  detail,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: "store" | "truck";
  title: string;
  detail: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-card bg-surface p-4 ring-1 transition",
        selected ? "ring-2 ring-accent-ink shadow-raised" : "ring-line",
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={disabled}
        onClick={onSelect}
        className="flex w-full items-center gap-3 text-left disabled:cursor-not-allowed"
      >
        <span
          className={cx(
            "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
            selected ? "border-accent-ink" : "border-line-strong",
          )}
          aria-hidden="true"
        >
          {selected && <span className="size-3 rounded-full bg-accent-ink" />}
        </span>
        <span
          aria-hidden="true"
          className={cx(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            selected ? "bg-zoom text-white" : "bg-canvas text-ink-muted",
          )}
        >
          <Icon name={icon} className="size-6" />
        </span>
        <span className={cx("min-w-0 flex-1", disabled && "opacity-60")}>
          <span className="block font-display text-lg font-bold italic">{title}</span>
          <span className="block text-sm text-ink-muted">{detail}</span>
        </span>
      </button>
      {children}
    </div>
  );
}

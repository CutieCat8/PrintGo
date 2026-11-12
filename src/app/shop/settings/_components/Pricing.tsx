"use client";
import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { ShopPricing } from "@/lib/client/types";
import {
  PRICE_COMBINATIONS,
  priceKey,
  pricingBody,
  pricingDraft,
  pricingErrorPath,
} from "../_lib/forms";
import { useSave } from "../_lib/useSave";
import { Resource } from "./Resource";
export function PricingSettings() {
  return (
    <Resource cacheKey="shopPricing" load={api.getShopPricing}>
      {(data, saved) => <PricingForm initial={data} saved={saved} />}
    </Resource>
  );
}
function PricingForm({
  initial,
  saved,
}: {
  initial: ShopPricing;
  saved: (value: ShopPricing) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => pricingDraft(initial));
  const { busy, errors, run } = useSave();
  return (
    <Card>
      <h2 className="text-xl font-semibold text-brand">ราคาปริ้นต่อหน้า</h2>
      <p className="my-3 text-sm text-ink-muted">
        กรอกเป็นบาท ทศนิยมไม่เกิน 2 ตำแหน่ง ช่องว่างหมายถึงไม่รับงานชุดนั้น ราคาสูงสุด 100
        บาทต่อหน้า
      </p>
      <form
        noValidate
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          let body: ShopPricing | undefined;
          void run(
            async () => {
              body = pricingBody(draft);
              const result = await api.updateShopPricing(body);
              setDraft(pricingDraft(result));
              await saved(result);
            },
            "บันทึกราคาแล้ว",
            (path) => (body ? pricingErrorPath(body, path) : path),
          );
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PRICE_COMBINATIONS.map((combo) => {
            const key = priceKey(combo);
            const label = `${combo.color === "bw" ? "ขาวดำ" : "สี"} · ${combo.paper} · ${combo.sides === "single" ? "ด้านเดียว" : "สองด้าน"}`;
            return (
              <Input
                key={key}
                className="min-w-0 break-words"
                label={label}
                hint="บาท/หน้า"
                inputMode="decimal"
                value={draft.prices[key]}
                error={errors[`prices.${key}`]}
                onChange={(event) =>
                  setDraft({ ...draft, prices: { ...draft.prices, [key]: event.target.value } })
                }
              />
            );
          })}
        </fieldset>
        <h3 className="text-lg font-semibold text-brand">ส่วนลดตามปริมาณ</h3>
        <p className="text-sm text-ink-muted">
          เมื่อจำนวนหน้ารวมคูณจำนวนชุดถึงขั้นต่ำ ร้านจะกรอกราคารวมเองก่อนยืนยัน
          ไม่ใช่ส่วนลดอัตโนมัติ
        </p>
        <fieldset disabled={busy} className="space-y-3">
          {draft.tiers.map((tier, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-control border border-line p-3 sm:grid-cols-[180px_1fr_auto]"
            >
              <Input
                label="ตั้งแต่จำนวนหน้า"
                inputMode="numeric"
                value={tier.minPages}
                error={errors[`tiers.${index}.minPages`]}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    tiers: draft.tiers.map((t, i) =>
                      i === index ? { ...t, minPages: event.target.value } : t,
                    ),
                  })
                }
              />
              <Input
                label="หมายเหตุ (ไม่บังคับ)"
                maxLength={200}
                value={tier.note}
                error={errors[`tiers.${index}.note`]}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    tiers: draft.tiers.map((t, i) =>
                      i === index ? { ...t, note: event.target.value } : t,
                    ),
                  })
                }
              />
              <Button
                variant="danger"
                onClick={() =>
                  setDraft({ ...draft, tiers: draft.tiers.filter((_, i) => i !== index) })
                }
              >
                ลบขั้นนี้
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            disabled={draft.tiers.length >= 20}
            onClick={() =>
              setDraft({ ...draft, tiers: [...draft.tiers, { minPages: "", note: "" }] })
            }
          >
            เพิ่มขั้นส่วนลด
          </Button>
        </fieldset>
        {errors._form && (
          <p role="alert" className="text-danger">
            {errors._form}
          </p>
        )}
        <Button type="submit" loading={busy}>
          บันทึกราคาปริ้น
        </Button>
      </form>
    </Card>
  );
}

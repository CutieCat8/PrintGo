"use client";
import { useState } from "react";
import { Button, Card, Input, useToast } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { ShopHour } from "@/lib/client/types";
import { copyHours, hoursBody, hoursDraft } from "../_lib/forms";
import { useSave } from "../_lib/useSave";
import { Resource } from "./Resource";
const days = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export function HoursSettings() {
  return (
    <Resource cacheKey="shopHours" load={api.getShopHours}>
      {(data, saved) => <HoursForm initial={data} saved={saved} />}
    </Resource>
  );
}
function HoursForm({
  initial,
  saved,
}: {
  initial: ShopHour[];
  saved: (value: ShopHour[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => hoursDraft(initial));
  const { busy, errors, run } = useSave();
  const toast = useToast();
  function update(index: number, patch: Partial<ShopHour>) {
    setDraft((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  return (
    <Card>
      <h2 className="text-xl font-semibold text-brand">เวลาเปิด–ปิด</h2>
      <p className="my-3 text-sm text-ink-muted">
        เวลาไทย ไม่ข้ามเที่ยงคืน ปิดเวลา 24:00 ได้ ร้านใหม่ยังไม่มีเวลาบันทึก
        ให้เปิดวันและกรอกเวลาก่อนบันทึก
      </p>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const result = await api.updateShopHours(hoursBody(draft));
            setDraft(hoursDraft(result));
            await saved(result);
          });
        }}
      >
        <fieldset disabled={busy} className="space-y-3">
          {draft.map((row, index) => (
            <div
              key={row.weekday}
              className="grid items-start gap-3 rounded-control border border-line p-3 sm:grid-cols-[100px_minmax(0,1fr)_minmax(0,1fr)_140px]"
            >
              <div>
                <p className="font-semibold">{days[row.weekday]}</p>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={row.isClosed}
                    onChange={(event) => update(index, { isClosed: event.target.checked })}
                  />
                  ปิดทั้งวัน
                </label>
              </div>
              <Input
                className="min-w-0"
                label={`เวลาเปิด ${days[row.weekday]}`}
                type="time"
                disabled={row.isClosed}
                value={row.openTime}
                error={errors[`${index}.openTime`]}
                onChange={(event) => update(index, { openTime: event.target.value })}
              />
              <Input
                className="min-w-0"
                label={`เวลาปิด ${days[row.weekday]}`}
                inputMode="numeric"
                placeholder="18:00 หรือ 24:00"
                disabled={row.isClosed}
                value={row.closeTime}
                error={errors[`${index}.closeTime`]}
                onChange={(event) => update(index, { closeTime: event.target.value })}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDraft(copyHours(draft, index));
                  toast("คัดลอกในฟอร์มแล้ว กดบันทึกเพื่อใช้งาน", "info");
                }}
              >
                คัดลอกไปทุกวัน
              </Button>
            </div>
          ))}
        </fieldset>
        {errors._form && (
          <p role="alert" className="text-danger">
            {errors._form}
          </p>
        )}
        <Button type="submit" loading={busy}>
          บันทึกเวลาเปิด–ปิด
        </Button>
      </form>
    </Card>
  );
}

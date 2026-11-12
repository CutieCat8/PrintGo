"use client";
import { useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { Shop } from "@/lib/db/types";
import { useShopMe } from "@/lib/client/hooks";
import { profileBody, profileDraft, profileWithPause } from "../_lib/forms";
import { useSave } from "../_lib/useSave";
import { Resource } from "./Resource";

export function ProfileSettings() {
  return (
    <Resource cacheKey="shopProfile" load={api.getShopProfile}>
      {(data, saved) => <ProfileForm initial={data} saved={saved} />}
    </Resource>
  );
}
function ProfileForm({ initial, saved }: { initial: Shop; saved: (value: Shop) => Promise<void> }) {
  const [draft, setDraft] = useState(() => profileDraft(initial));
  const me = useShopMe();
  const [editedPause, setEditedPause] = useState<boolean | null>(null);
  const latestPaused = me.data?.shop?.isPaused ?? initial.isPaused;
  const { busy, errors, run } = useSave();
  const { mutate } = useSWRConfig();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const locationRequest = useRef(0);
  useEffect(
    () => () => {
      locationRequest.current++;
    },
    [],
  );
  function locate() {
    if (!navigator.geolocation) {
      setLocationError("อุปกรณ์นี้ไม่รองรับตำแหน่ง กรุณากรอกพิกัดเอง");
      return;
    }
    const request = ++locationRequest.current;
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (request !== locationRequest.current) return;
        setDraft((current) => ({
          ...current,
          lat: String(position.coords.latitude),
          lng: String(position.coords.longitude),
        }));
        setLocating(false);
      },
      () => {
        if (request !== locationRequest.current) return;
        setLocating(false);
        setLocationError("ขอตำแหน่งไม่สำเร็จ กรุณาอนุญาตตำแหน่งหรือลองกรอกพิกัดเอง");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }
  return (
    <Card>
      <h2 className="mb-4 text-xl font-semibold text-brand">โปรไฟล์ร้าน</h2>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const shop = await api.updateShopProfile(
              profileBody(profileWithPause(draft, latestPaused, editedPause)),
            );
            setDraft(profileDraft(shop));
            await saved(shop);
            await me.mutate((current) => (current ? { ...current, shop } : current), {
              revalidate: false,
            });
            setEditedPause(null);
            void mutate("shopMe").catch(() => {});
          });
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <Input
            label="ชื่อร้าน"
            required
            value={draft.name}
            maxLength={80}
            error={errors.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
          <Input
            label="เบอร์โทรร้าน"
            required
            type="tel"
            value={draft.phone}
            error={errors.phone}
            onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
          />
          <Textarea
            label="ที่อยู่ร้าน"
            required
            value={draft.address}
            maxLength={300}
            error={errors.address}
            className="sm:col-span-2"
            onChange={(event) => setDraft({ ...draft, address: event.target.value })}
          />
          <Input
            label="ละติจูด"
            required
            inputMode="decimal"
            value={draft.lat}
            error={errors.lat}
            onChange={(event) => setDraft({ ...draft, lat: event.target.value })}
          />
          <Input
            label="ลองจิจูด"
            required
            inputMode="decimal"
            value={draft.lng}
            error={errors.lng}
            onChange={(event) => setDraft({ ...draft, lng: event.target.value })}
          />
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm text-ink-muted">
              กดปุ่มเมื่ออยู่ที่ร้าน พิกัดจะเติมในฟอร์มให้ตรวจสอบก่อนบันทึก
            </p>
            <Button variant="secondary" loading={locating} onClick={locate}>
              ใช้ตำแหน่งปัจจุบัน
            </Button>
            {locationError && (
              <p role="alert" className="mt-2 text-danger">
                {locationError}
              </p>
            )}
          </div>
          <Input
            label="หยุดรับงานก่อนปิดร้าน (นาที)"
            required
            inputMode="numeric"
            hint="0–240 นาที"
            value={draft.cutoffMinutes}
            error={errors.cutoffMinutes}
            onChange={(event) => setDraft({ ...draft, cutoffMinutes: event.target.value })}
          />
          <div className="space-y-3">
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={draft.acceptsDelivery}
                onChange={(event) => setDraft({ ...draft, acceptsDelivery: event.target.checked })}
              />
              รับงานจัดส่ง
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={editedPause ?? latestPaused}
                onChange={(event) => setEditedPause(event.target.checked)}
              />
              พักรับงานชั่วคราว
            </label>
          </div>
        </fieldset>
        {errors._form && (
          <p role="alert" className="text-danger">
            {errors._form}
          </p>
        )}
        <Button type="submit" loading={busy} disabled={locating}>
          บันทึกโปรไฟล์
        </Button>
      </form>
    </Card>
  );
}

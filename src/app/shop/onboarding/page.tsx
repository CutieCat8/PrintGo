"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { Button, Card, Checkbox, Input, Textarea, useToast } from "@/components/ui";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import { isThaiPhone } from "@/lib/client/format";

type Pos = { lat: number; lng: number };

/** New shop registration (D23): name, phone, address, location from "use current location". */
export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [delivery, setDelivery] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const errors = {
    name: name.trim() ? undefined : "กรอกชื่อร้าน",
    phone: isThaiPhone(phone) ? undefined : "เบอร์โทร 9–10 หลัก ขึ้นต้นด้วย 0",
    address: address.trim() ? undefined : "กรอกที่อยู่ร้าน",
    pos: pos ? undefined : "กดปุ่มเพื่อใช้ตำแหน่งปัจจุบันของร้าน",
  };
  const valid = Object.values(errors).every((e) => e === undefined);

  function locate() {
    if (!navigator.geolocation) {
      setLocError("เบราว์เซอร์นี้หาตำแหน่งไม่ได้");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocError(
          err.code === err.PERMISSION_DENIED
            ? "ไม่ได้อนุญาตตำแหน่ง เปิดสิทธิ์ตำแหน่งให้เว็บนี้ในเบราว์เซอร์ แล้วกดอีกครั้ง"
            : "หาตำแหน่งไม่สำเร็จ ลองอีกครั้งในที่สัญญาณดีขึ้น",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid || !pos || busy) return;
    setBusy(true);
    try {
      await api.registerShop({
        name: name.trim(),
        phone: phone.replace(/[\s-]/g, ""),
        address: address.trim(),
        lat: pos.lat,
        lng: pos.lng,
        acceptsDelivery: delivery,
      });
      toast("สมัครร้านแล้ว รอแอดมินอนุมัติ", "success");
      await mutate("shopMe");
      router.replace("/shop");
    } catch (err) {
      setBusy(false);
      if (isApiClientError(err) && err.code === "ALREADY_REGISTERED") {
        await mutate("shopMe");
        router.replace("/shop");
        return;
      }
      toast(errorMessage(err), "error");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-4">
      <div>
        <p className="text-xl font-bold text-brand">
          Print<span className="text-accent">Go</span>{" "}
          <span className="font-normal">สำหรับร้าน</span>
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-brand">สมัครร้านปริ้น</h1>
        <p className="mt-1 text-ink-muted">
          กรอกข้อมูลร้าน แอดมินจะตรวจและอนุมัติก่อนลูกค้าเห็นร้านคุณ
        </p>
      </div>
      <Card as="section">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Input
            label="ชื่อร้าน"
            required
            maxLength={100}
            value={name}
            error={touched ? errors.name : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="เบอร์โทรร้าน"
            required
            type="tel"
            inputMode="tel"
            value={phone}
            error={touched ? errors.phone : undefined}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Textarea
            label="ที่อยู่ร้าน"
            required
            rows={3}
            maxLength={300}
            value={address}
            error={touched ? errors.address : undefined}
            onChange={(e) => setAddress(e.target.value)}
          />
          <div>
            <p className="font-medium">
              ตำแหน่งร้าน <span className="text-danger">*</span>
            </p>
            <p className="text-sm text-ink-muted">ใช้คำนวณระยะทางให้ลูกค้า กดปุ่มตอนอยู่ที่ร้าน</p>
            <Button
              type="button"
              variant="secondary"
              className="mt-2"
              loading={locating}
              onClick={locate}
            >
              📍 ใช้ตำแหน่งปัจจุบัน
            </Button>
            {pos && (
              <p className="mt-2 text-sm text-success-ink">
                ✓ ได้ตำแหน่งแล้ว ({pos.lat.toFixed(5)}, {pos.lng.toFixed(5)})
              </p>
            )}
            {(locError || (touched && errors.pos)) && (
              <p className="mt-2 text-sm text-danger" role="alert">
                {locError ?? errors.pos}
              </p>
            )}
          </div>
          <Checkbox
            checked={delivery}
            onChange={(e) => setDelivery(e.target.checked)}
            label="รับงานจัดส่ง (ไรเดอร์มารับที่ร้าน)"
          />
          <Button type="submit" size="lg" fullWidth loading={busy}>
            สมัครร้าน
          </Button>
        </form>
      </Card>
      <form action="/auth/signout" method="post" className="text-center">
        <button type="submit" className="text-sm text-ink-muted underline">
          ออกจากระบบ
        </button>
      </form>
    </main>
  );
}

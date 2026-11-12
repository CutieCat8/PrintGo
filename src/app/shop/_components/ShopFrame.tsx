"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import {
  DashboardShell,
  EmptyState,
  ErrorState,
  Spinner,
  buttonClasses,
  Icon,
  cx,
  useToast,
} from "@/components/ui";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import {
  audioBlocked,
  beep,
  setSoundEnabled,
  setTitleCount,
  soundEnabled,
  unlockAudio,
} from "@/lib/client/alert";
import { useChats, useShopMe, useShopOrders } from "@/lib/client/hooks";

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>;
}

/**
 * Wraps every /shop page: loads the shop (GET /api/shop/me) and routes by its state (D23):
 * not signed in -> /login · no_profile -> /shop/onboarding · suspended -> notice ·
 * pending -> banner, queue closed · active -> dashboard with alerts.
 */
export function ShopFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/shop";
  const me = useShopMe();
  const onboarding = pathname.startsWith("/shop/onboarding");
  const state = me.data?.state;

  const unauth = isApiClientError(me.error) && me.error.status === 401;
  useEffect(() => {
    if (unauth) router.replace("/login");
    else if (state === "no_profile" && !onboarding) router.replace("/shop/onboarding");
    else if (state && state !== "no_profile" && onboarding) router.replace("/shop");
  }, [unauth, state, onboarding, router]);

  const redirecting =
    unauth ||
    (state === "no_profile" && !onboarding) ||
    (state !== undefined && state !== "no_profile" && onboarding);

  if (me.isLoading || redirecting) {
    return (
      <Centered>
        <Spinner className="size-8 text-brand" />
      </Centered>
    );
  }

  if (me.error || !me.data) {
    return (
      <Centered>
        <ErrorState description={errorMessage(me.error)} onRetry={() => me.mutate()} />
      </Centered>
    );
  }

  // Registration form: plain page, no dashboard around it
  if (me.data.state === "no_profile") return <>{children}</>;

  if (me.data.state === "suspended") {
    return (
      <Centered>
        <EmptyState
          icon={<Icon name="lock" className="size-7" />}
          title="บัญชีร้านถูกระงับ"
          description="ร้านของคุณถูกระงับการใช้งาน กรุณาติดต่อแอดมิน PrintGo"
          action={
            <form action="/auth/signout" method="post">
              <button type="submit" className={buttonClasses({ variant: "secondary" })}>
                ออกจากระบบ
              </button>
            </form>
          }
        />
      </Centered>
    );
  }

  return <ActiveDashboard>{children}</ActiveDashboard>;
}

function ActiveDashboard({ children }: { children: ReactNode }) {
  const toast = useToast();
  // The queue is a full-height split view: no page padding
  // The chat inbox is a full-height split view: no page padding
  const flush = usePathname() === "/shop/chats";
  const me = useShopMe();
  const shop = me.data!.shop!;
  const active = me.data!.state === "active";

  const orders = useShopOrders(undefined, active);
  const chats = useChats("shop", active);
  const pricing = useSWR(active ? "shopPricing" : null, () => api.getShopPricing());

  const waiting = (orders.data ?? []).filter((o) => o.status === "submitted").length;
  const unread = chats.data?.totalUnread ?? 0;
  const badge = waiting + unread;

  // Sound + toast when a new order arrives
  const seenOrders = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!orders.data) return;
    const before = seenOrders.current;
    seenOrders.current = new Set(orders.data.map((o) => o.id));
    if (!before) return;
    const fresh = orders.data.filter((o) => !before.has(o.id) && o.status === "submitted");
    if (fresh.length) {
      beep();
      toast(`ออเดอร์ใหม่ ${fresh.map((o) => o.orderNo).join(", ")}`, "info");
    }
  }, [orders.data, toast]);

  // Sound when the unread count goes up (a new customer message)
  const seenUnread = useRef<number | null>(null);
  useEffect(() => {
    if (!chats.data) return;
    const prev = seenUnread.current;
    seenUnread.current = chats.data.totalUnread;
    if (prev !== null && chats.data.totalUnread > prev) beep();
  }, [chats.data]);

  useEffect(() => {
    setTitleCount(badge);
    return () => setTitleCount(0);
  }, [badge]);

  const banners: ReactNode[] = [];
  if (!active) {
    banners.push(
      <Banner key="pending" tone="warning">
        ร้านของคุณรอแอดมินอนุมัติ — ตั้งเวลาเปิด-ปิด ราคา และบริการเสริมรอได้เลย
        (ลูกค้าจะเห็นร้านเมื่ออนุมัติและตั้งราคาแล้ว){" "}
        <Link href="/shop/settings" className="font-semibold underline">
          ไปตั้งค่าร้าน
        </Link>
      </Banner>,
    );
  } else if (pricing.data && pricing.data.rules.length === 0) {
    banners.push(
      <Banner key="pricing" tone="warning">
        ยังไม่ตั้งราคา ลูกค้าจะยังไม่เห็นร้านคุณ{" "}
        <Link href="/shop/settings" className="font-semibold underline">
          ตั้งราคา
        </Link>
      </Banner>,
    );
  }
  if (active) banners.push(<SoundBanner key="sound" />);

  return (
    <DashboardShell
      shopName={shop.name}
      queueBadge={waiting}
      chatBadge={unread}
      headerActions={<PauseSwitch />}
      flush={flush}
      banner={banners.length ? <div>{banners}</div> : undefined}
    >
      {children}
    </DashboardShell>
  );
}

function Banner({ tone, children }: { tone: "warning" | "info"; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cx(
        "border-b px-4 py-2 text-sm lg:px-6",
        tone === "warning"
          ? "border-amber-200 bg-warning-50 text-warning-ink"
          : "border-line bg-info-50 text-info-ink",
      )}
    >
      {children}
    </div>
  );
}

/** "คลิกที่นี่เพื่อเปิดเสียงแจ้งเตือน" while the browser blocks sound, plus a mute option. */
function SoundBanner() {
  // Only rendered after /api/shop/me has loaded in the browser, so reading the browser here is safe
  const [blocked, setBlocked] = useState(audioBlocked);
  const [on, setOn] = useState(soundEnabled);

  useEffect(() => {
    const unlockOnce = () => unlockAudio().then((ok) => ok && setBlocked(false));
    window.addEventListener("pointerdown", unlockOnce, { once: true });
    return () => window.removeEventListener("pointerdown", unlockOnce);
  }, []);

  if (!on) {
    return (
      <Banner tone="info">
        ปิดเสียงแจ้งเตือนอยู่{" "}
        <button
          type="button"
          className="font-semibold underline"
          onClick={() => {
            setSoundEnabled(true);
            setOn(true);
            unlockAudio().then((ok) => setBlocked(!ok));
          }}
        >
          เปิดเสียง
        </button>
      </Banner>
    );
  }
  if (!blocked) return null;
  return (
    <Banner tone="info">
      <button
        type="button"
        className="font-semibold underline"
        onClick={() => unlockAudio().then((ok) => setBlocked(!ok))}
      >
        คลิกที่นี่เพื่อเปิดเสียงแจ้งเตือน
      </button>{" "}
      ·{" "}
      <button
        type="button"
        className="underline"
        onClick={() => {
          setSoundEnabled(false);
          setOn(false);
        }}
      >
        ไม่ต้องมีเสียง
      </button>
    </Banner>
  );
}

/** "พักรับงาน" switch: PUT /api/shop/profile with the current profile and isPaused flipped. */
function PauseSwitch() {
  const toast = useToast();
  const me = useShopMe();
  const [busy, setBusy] = useState(false);
  const shop = me.data?.shop;
  if (!shop) return null;

  async function toggle() {
    if (!shop) return;
    setBusy(true);
    try {
      await api.updateShopProfile({
        name: shop.name,
        phone: shop.phone,
        address: shop.address,
        lat: shop.lat,
        lng: shop.lng,
        acceptsDelivery: shop.acceptsDelivery,
        cutoffMinutes: shop.cutoffMinutes,
        isPaused: !shop.isPaused,
      });
      await me.mutate();
      toast(
        shop.isPaused ? "เปิดรับงานแล้ว" : "พักรับงานแล้ว ลูกค้าจะสั่งร้านคุณไม่ได้ชั่วคราว",
        "success",
      );
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const open = !shop.isPaused;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={open}
      disabled={busy}
      onClick={toggle}
      className={cx(
        "flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium ring-1 disabled:opacity-60",
        open ? "bg-white text-brand ring-white" : "bg-warning-50 text-warning-ink ring-amber-300",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "relative h-5 w-9 rounded-full transition",
          open ? "bg-success-ink" : "bg-ink-muted",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 size-4 rounded-full bg-white transition-all",
            open ? "left-[1.125rem]" : "left-0.5",
          )}
        />
      </span>
      <span className="hidden sm:inline">{open ? "รับงานอยู่" : "หยุดรับงาน"}</span>
    </button>
  );
}

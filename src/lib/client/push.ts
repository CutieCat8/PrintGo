import { api } from "./api";

/**
 * Browser side of Web Push for shops (Z12, D17). Call from a click handler: asking for permission
 * outside a user gesture is blocked by browsers (and by iOS, which also needs "Add to Home Screen").
 */
export type PushSupport = "ok" | "unsupported" | "denied" | "no_key";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (!PUBLIC_KEY) return "no_key";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

/** The browser wants the public key as bytes; ours is URL-safe base64. */
export function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  return registration ? registration.pushManager.getSubscription() : null;
}

/** True when this device is already subscribed (the permission was granted earlier). */
export async function isPushOn(): Promise<boolean> {
  if (pushSupport() === "unsupported") return false;
  try {
    return Boolean(await currentSubscription());
  } catch {
    return false;
  }
}

/** Asks permission, subscribes this device and saves it for the shop. Resolves to the final state. */
export async function enablePush(): Promise<PushSupport | "on"> {
  const support = pushSupport();
  if (support !== "ok") return support;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(PUBLIC_KEY),
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("เบราว์เซอร์ไม่ให้ข้อมูลการแจ้งเตือนครบ");
  }
  await api.subscribePush({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return "on";
}

/** Turns alerts off on this device only. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await api.unsubscribePush(endpoint);
}

"use client";

/**
 * In-page alerts for the shop dashboard (Y6): a short beep made with Web Audio (no sound file, so
 * no licensing question) and the tab title "(3) PrintGo".
 * Browsers only allow sound after the user has interacted with the page; `audioBlocked()` tells
 * the UI to show "คลิกที่นี่เพื่อเปิดเสียงแจ้งเตือน".
 */

const SOUND_KEY = "printgo:shop-sound";
let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // ignore: preference just is not remembered
  }
}

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  return ctx;
}

/** true while the browser still refuses to play sound (no click on the page yet). */
export function audioBlocked(): boolean {
  const c = context();
  return c !== null && c.state !== "running";
}

/** Call from a click handler: browsers unlock audio only inside a user gesture. */
export async function unlockAudio(): Promise<boolean> {
  const c = context();
  if (!c) return false;
  try {
    await c.resume();
  } catch {
    return false;
  }
  return c.state === "running";
}

/**
 * Two short tones, repeated `times` times about 1.4 s apart. All tones are scheduled on the audio
 * clock in one go (no timers), so a background tab whose timers are throttled still plays them all.
 * Does nothing when muted or still blocked.
 */
export function beep(times = 1) {
  if (!soundEnabled()) return;
  const c = context();
  if (!c || c.state !== "running") return;
  for (let r = 0; r < times; r++) {
    const start = c.currentTime + r * 1.4;
    [880, 1320].forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = start + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }
}

let lastPushRing = 0;
/** A push arrived (sent by public/sw.js): a new order rings 3 times, a customer message once. */
export function ringForPush(kind: "order_new" | "chat_message") {
  lastPushRing = Date.now();
  beep(kind === "order_new" ? 3 : 1);
}
/** The polling alerts skip their beep when a push already rang a moment ago (no double sound). */
export function pushRangRecently(withinMs = 20_000): boolean {
  return Date.now() - lastPushRing < withinMs;
}

export function setTitleCount(count: number) {
  if (typeof document === "undefined") return;
  document.title = count > 0 ? `(${count > 99 ? "99+" : count}) PrintGo` : "PrintGo";
}

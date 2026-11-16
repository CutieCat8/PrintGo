import { USE_MOCK } from "./api";
import { setCustomerTokenProvider, setDevCustomer } from "./http";

/**
 * Signs the customer in before any /liff page calls the API.
 *
 *   NEXT_PUBLIC_LIFF_ID set  -> liff.init(); not logged in -> liff.login(); API calls carry the ID
 *                               token (kept in memory by the LIFF SDK, never in localStorage by us)
 *   no LIFF ID, development  -> act as the seed customer via `x-dev-user` (mock or local backend)
 *   no LIFF ID, production   -> cannot work: report "not_configured"
 */

export type LiffState =
  | { kind: "ready"; mode: "liff" | "dev"; displayName: string | null }
  | { kind: "redirecting" }
  | { kind: "not_configured" }
  | { kind: "error"; message: string };

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? "";
/** Seed customer from supabase/seed.sql (made-up data). */
const DEV_CUSTOMER_ID = "00000000-0000-4000-8000-0000000000c1";

let started: Promise<LiffState> | null = null;

/** Runs once per page load; later calls get the same answer. */
export function startCustomerSession(): Promise<LiffState> {
  started ??= start();
  return started;
}

async function start(): Promise<LiffState> {
  const dev = process.env.NODE_ENV !== "production";

  if (!LIFF_ID) {
    if (!dev && !USE_MOCK) return { kind: "not_configured" };
    setDevCustomer(DEV_CUSTOMER_ID);
    return { kind: "ready", mode: "dev", displayName: "ลูกค้าตัวอย่าง" };
  }

  try {
    const { default: liff } = await import("@line/liff");
    await liff.init({ liffId: LIFF_ID });

    // Works both inside the LINE app and in a normal desktop/mobile browser (LINE web login).
    // isLoggedIn() only checks the access token (about 12 h) but the ID token we send to the API
    // lasts about 1 h. If it is stale, liff.login() alone returns the same stale token and we
    // loop forever: log out locally first so LINE issues a fresh one.
    if (!liff.isLoggedIn() || idTokenExpired(liff)) {
      if (!reloginAllowed()) {
        return { kind: "error", message: "เข้าสู่ระบบ LINE ไม่สำเร็จ กรุณาปิดแล้วเปิดใหม่อีกครั้ง" };
      }
      relogin(liff);
      return { kind: "redirecting" };
    }

    // The SDK does not renew the ID token: log in again when it expires
    setCustomerTokenProvider(() => {
      if (idTokenExpired(liff)) {
        if (reloginAllowed()) relogin(liff);
        return null;
      }
      return liff.getIDToken();
    });
    const decoded = liff.getDecodedIDToken();
    return { kind: "ready", mode: "liff", displayName: decoded?.name ?? null };
  } catch (e) {
    console.error("LIFF init failed", e);
    return { kind: "error", message: "เปิดระบบ LINE ไม่สำเร็จ กรุณาปิดแล้วเปิดใหม่อีกครั้ง" };
  }
}

type Liff = (typeof import("@line/liff"))["default"];

function idTokenExpired(liff: Liff): boolean {
  const exp = liff.getDecodedIDToken()?.exp;
  return !exp || exp * 1000 < Date.now() + 30_000;
}

function relogin(liff: Liff) {
  if (liff.isLoggedIn()) liff.logout(); // clears the stale tokens kept by the SDK
  liff.login({ redirectUri: window.location.href });
}

const RELOGIN_KEY = "printgo_liff_relogin_at";
const RELOGIN_COOLDOWN_MS = 20_000;

/** Stops an endless LINE login loop: at most one automatic login per 20 seconds. */
function reloginAllowed(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOGIN_KEY) ?? 0);
    if (Date.now() - last < RELOGIN_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOGIN_KEY, String(Date.now()));
  } catch {
    // storage blocked: allow, we cannot guard
  }
  return true;
}

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
  | { kind: "outside_line" }
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

    // Production: only inside the LINE app. Development: a normal browser may log in with LINE.
    if (!liff.isInClient() && !dev) return { kind: "outside_line" };

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return { kind: "redirecting" };
    }

    // The ID token lasts about an hour and the SDK does not renew it: log in again when it expires
    setCustomerTokenProvider(() => {
      const exp = liff.getDecodedIDToken()?.exp;
      if (exp && exp * 1000 < Date.now() + 30_000) {
        liff.login({ redirectUri: window.location.href });
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

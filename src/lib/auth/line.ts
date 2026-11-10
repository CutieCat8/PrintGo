import { ApiError } from "@/lib/errors";

/**
 * Checks a LIFF ID token with LINE (docs: "Verify ID token", POST /oauth2/v2.1/verify) and
 * returns who the customer is. Never trust a user id sent by the browser; only this answer.
 */
const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const REMEMBER_MS = 5 * 60_000; // an app polls every few seconds; one LINE call per 5 minutes is enough
const REMEMBER_MAX = 1000;

export type LineProfile = { lineUserId: string; displayName: string; pictureUrl: string | null };

const remembered = new Map<string, { profile: LineProfile; until: number }>();

function remember(idToken: string, profile: LineProfile, expSeconds: unknown) {
  const tokenEnds = typeof expSeconds === "number" ? expSeconds * 1000 : Infinity;
  const until = Math.min(Date.now() + REMEMBER_MS, tokenEnds);
  if (remembered.size >= REMEMBER_MAX) remembered.delete(remembered.keys().next().value!);
  remembered.set(idToken, { profile, until });
}

export async function verifyLiffIdToken(idToken: string): Promise<LineProfile> {
  const hit = remembered.get(idToken);
  if (hit && hit.until > Date.now()) return hit.profile;
  remembered.delete(idToken);

  const clientId = process.env.LINE_CHANNEL_ID;
  if (!clientId) throw new Error("Missing environment variable LINE_CHANNEL_ID (see .env.example)");

  let res: Response;
  try {
    res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId }).toString(),
    });
  } catch (err) {
    // LINE unreachable: not the user's fault, so do not answer 401 and sign them out
    console.error("LINE verify request failed", err);
    throw new ApiError("INTERNAL", 500);
  }

  if (res.status === 429 || res.status >= 500) throw new ApiError("INTERNAL", 500);
  if (!res.ok) throw new ApiError("UNAUTHENTICATED", 401);

  const body = (await res.json()) as {
    sub?: string;
    name?: string;
    picture?: string;
    exp?: number;
  };
  if (!body.sub) throw new ApiError("UNAUTHENTICATED", 401);

  const profile: LineProfile = {
    lineUserId: body.sub,
    displayName: body.name || "ผู้ใช้ LINE",
    pictureUrl: body.picture ?? null,
  };
  remember(idToken, profile, body.exp);
  return profile;
}

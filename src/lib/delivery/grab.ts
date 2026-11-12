import type { DeliveryStatus } from "@/lib/db/types";
import type { DeliveryProvider, LatLng, Place } from "./types";

/**
 * Z11. Written from developer.grab.com/docs/grab-express and tested with a mocked `fetch` only.
 * It has NOT been run against the real Grab sandbox: the account has no project/credentials yet.
 */

const HOSTS = {
  sandbox: "https://partner-api.grab.com/grab-express-sandbox",
  production: "https://partner-api.grab.com/grab-express",
} as const;
const TOKEN_URL = "https://partner-api.grab.com/grabid/v1/oauth2/token";

export type GrabConfig = {
  clientId: string;
  clientSecret: string;
  env: keyof typeof HOSTS;
};

/** Null when the credentials are not set, so callers can refuse loudly instead of calling out. */
export function readGrabConfig(): GrabConfig | null {
  const clientId = process.env.GRAB_CLIENT_ID?.trim();
  const clientSecret = process.env.GRAB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, env: process.env.GRAB_ENV === "production" ? "production" : "sandbox" };
}

/** Grab statuses -> our `deliveries.status`. Unknown values are refused, never guessed. */
export function mapGrabStatus(status: string): DeliveryStatus {
  switch (status) {
    case "QUEUEING":
    case "ALLOCATING":
    case "PENDING_PICKUP":
    case "PICKING_UP":
      return "booked";
    case "PENDING_DROP_OFF":
    case "IN_DELIVERY":
      return "in_transit";
    case "COMPLETED":
      return "delivered";
    case "CANCELED":
    case "CANCELLED":
      return "cancelled";
    case "FAILED":
    case "IN_RETURN":
    case "RETURNED":
      return "failed";
    default:
      throw new Error(`Unknown Grab delivery status "${status}"`);
  }
}

/** Grab wants E.164 digits without "+" (66812345678), our data has local Thai numbers (0812345678). */
export function toGrabPhone(phone: string | undefined): string | undefined {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return undefined;
  return digits.startsWith("0") ? `66${digits.slice(1)}` : digits;
}

/** Grab's `amount` is in major units (the doc examples show 29000 VND with exponent 0). THB -> satang. */
export function grabAmountToSatang(amount: number, currencyCode: string): number {
  if (currencyCode !== "THB") throw new Error(`Unexpected Grab currency "${currencyCode}"`);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid Grab amount");
  return Math.round(amount * 100);
}

type FetchLike = typeof fetch;
type Deps = { config: GrabConfig; fetch?: FetchLike; now?: () => number };

const PACKAGE = {
  name: "Printed documents",
  description: "PrintGo order",
  quantity: 1,
  dimensions: { height: 0, width: 0, depth: 0, weight: 0 },
};

function point(p: LatLng, address: string) {
  return { address, coordinates: { latitude: p.lat, longitude: p.lng } };
}

function party(p: Place) {
  const phone = toGrabPhone(p.phone);
  return { firstName: p.name?.trim() || "PrintGo", ...(phone ? { phone } : {}), smsEnabled: false };
}

export function createGrabProvider({ config, fetch: fetchImpl = fetch, now = Date.now }: Deps): DeliveryProvider {
  const base = HOSTS[config.env];
  let token: { value: string; expiresAt: number } | null = null;

  async function getToken(force = false): Promise<string> {
    // Refresh a minute early so a token never expires mid-request.
    if (!force && token && token.expiresAt - 60_000 > now()) return token.value;
    const res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "client_credentials",
        scope: "grab_express.partner_deliveries",
      }),
    });
    if (!res.ok) throw new Error(`Grab token request failed (${res.status})`);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error("Grab token response has no access_token");
    token = { value: body.access_token, expiresAt: now() + (body.expires_in ?? 0) * 1000 };
    return token.value;
  }

  /** Errors carry the path and status only: never the body, which can hold customer details. */
  async function call(method: string, path: string, body?: unknown): Promise<Response> {
    const send = async (force: boolean) =>
      fetchImpl(`${base}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken(force)}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    let res = await send(false);
    if (res.status === 401) res = await send(true);
    if (!res.ok) throw new Error(`Grab ${method} ${path} failed (${res.status})`);
    return res;
  }

  return {
    name: "grab",

    async getQuote({ pickup, dropoff }) {
      const res = await call("POST", "/v1/deliveries/quotes", {
        serviceType: "INSTANT",
        vehicleType: "BIKE",
        packages: [PACKAGE],
        // The contract only gives us coordinates here; Grab accepts coordinates with the address text.
        origin: point(pickup, `${pickup.lat},${pickup.lng}`),
        destination: point(dropoff, `${dropoff.lat},${dropoff.lng}`),
      });
      const { quotes } = (await res.json()) as {
        quotes?: { amount: number; currency: { code: string }; estimatedTimeline?: { pickup?: string; dropoff?: string } }[];
      };
      const quote = quotes?.[0];
      if (!quote) throw new Error("Grab returned no quote");
      const { pickup: p, dropoff: d } = quote.estimatedTimeline ?? {};
      const minutes = p && d ? Math.max(0, Math.round((Date.parse(d) - Date.parse(p)) / 60_000)) : null;
      return {
        feeSatang: grabAmountToSatang(quote.amount, quote.currency.code),
        etaMinutes: Number.isFinite(minutes) ? minutes : null,
        // Sandbox prices are test numbers, so the UI must keep the "estimate" label there.
        estimated: config.env !== "production",
      };
    },

    async create({ orderId, pickup, dropoff }) {
      const res = await call("POST", "/v1/deliveries", {
        merchantOrderID: orderId,
        serviceType: "INSTANT",
        vehicleType: "BIKE",
        paymentMethod: "CASHLESS",
        payer: "SENDER",
        packages: [PACKAGE],
        sender: party(pickup),
        recipient: party(dropoff),
        origin: point(pickup, pickup.address),
        destination: point(dropoff, dropoff.address),
      });
      const created = (await res.json()) as { deliveryID?: string; status?: string };
      if (!created.deliveryID) throw new Error("Grab create response has no deliveryID");
      return { providerRef: created.deliveryID, status: mapGrabStatus(created.status ?? "ALLOCATING") };
    },

    async cancel({ providerRef }) {
      await call("DELETE", `/v1/deliveries/${encodeURIComponent(providerRef)}`);
    },
  };
}

let shared: DeliveryProvider | null = null;

/** One instance per server process so the access token (about 7 days) is reused. */
export function getGrabProvider(): DeliveryProvider {
  const config = readGrabConfig();
  if (!config) {
    throw new Error('DELIVERY_PROVIDER "grab" needs GRAB_CLIENT_ID and GRAB_CLIENT_SECRET');
  }
  shared ??= createGrabProvider({ config });
  return shared;
}

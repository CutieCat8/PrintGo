import { describe, expect, it, vi } from "vitest";
import {
  createGrabProvider,
  grabAmountToSatang,
  mapGrabStatus,
  readGrabConfig,
  toGrabPhone,
  type GrabConfig,
} from "./grab";

const config: GrabConfig = { clientId: "id", clientSecret: "secret", env: "sandbox" };
const pickup = { lat: 18.79, lng: 98.98, address: "shop", name: "Shop", phone: "0812345678" };
const dropoff = { lat: 18.8, lng: 99, address: "home", name: "Buyer", phone: "0898765432" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
const tokenReply = () => json({ access_token: "tok", expires_in: 604799 });

describe("mapGrabStatus", () => {
  it("maps every documented status and refuses unknown ones", () => {
    expect(mapGrabStatus("ALLOCATING")).toBe("booked");
    expect(mapGrabStatus("PICKING_UP")).toBe("booked");
    expect(mapGrabStatus("IN_DELIVERY")).toBe("in_transit");
    expect(mapGrabStatus("COMPLETED")).toBe("delivered");
    expect(mapGrabStatus("CANCELED")).toBe("cancelled");
    expect(mapGrabStatus("CANCELLED")).toBe("cancelled");
    expect(mapGrabStatus("FAILED")).toBe("failed");
    expect(() => mapGrabStatus("WHATEVER")).toThrow(/Unknown Grab/);
  });
});

describe("helpers", () => {
  it("converts Thai numbers to E.164 digits and THB amounts to satang", () => {
    expect(toGrabPhone("081-234-5678")).toBe("66812345678");
    expect(toGrabPhone(undefined)).toBeUndefined();
    expect(grabAmountToSatang(65, "THB")).toBe(6500);
    expect(grabAmountToSatang(64.99, "THB")).toBe(6499);
    expect(() => grabAmountToSatang(10, "SGD")).toThrow(/currency/);
  });

  it("reads config only when both credentials are set", () => {
    vi.stubEnv("GRAB_CLIENT_ID", "");
    vi.stubEnv("GRAB_CLIENT_SECRET", "");
    expect(readGrabConfig()).toBeNull();
    vi.stubEnv("GRAB_CLIENT_ID", "a");
    vi.stubEnv("GRAB_CLIENT_SECRET", "b");
    expect(readGrabConfig()).toEqual({ clientId: "a", clientSecret: "b", env: "sandbox" });
    vi.stubEnv("GRAB_ENV", "production");
    expect(readGrabConfig()?.env).toBe("production");
    vi.unstubAllEnvs();
  });
});

describe("GrabProvider (mocked fetch, not the real sandbox)", () => {
  it("gets a token once and reuses it", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenReply())
      .mockImplementation(async () =>
        json({ quotes: [{ amount: 65, currency: { code: "THB" }, estimatedTimeline: {} }] }),
      );
    const grab = createGrabProvider({ config, fetch: f as unknown as typeof fetch });
    await grab.getQuote({ pickup, dropoff });
    await grab.getQuote({ pickup, dropoff });
    const tokenCalls = f.mock.calls.filter((c) => String(c[0]).includes("oauth2/token"));
    expect(tokenCalls).toHaveLength(1);
    expect(JSON.parse(tokenCalls[0][1].body)).toMatchObject({
      grant_type: "client_credentials",
      scope: "grab_express.partner_deliveries",
    });
  });

  it("returns the quote in satang, labelled an estimate on sandbox", async () => {
    const f = vi.fn().mockResolvedValueOnce(tokenReply()).mockResolvedValueOnce(
      json({
        quotes: [
          {
            amount: 65,
            currency: { code: "THB" },
            estimatedTimeline: { pickup: "2026-11-13T10:00:00Z", dropoff: "2026-11-13T10:25:00Z" },
          },
        ],
      }),
    );
    const grab = createGrabProvider({ config, fetch: f as unknown as typeof fetch });
    await expect(grab.getQuote({ pickup, dropoff })).resolves.toEqual({
      feeSatang: 6500,
      etaMinutes: 25,
      estimated: true,
    });
    expect(f.mock.calls[1][0]).toBe(
      "https://partner-api.grab.com/grab-express-sandbox/v1/deliveries/quotes",
    );
  });

  it("creates a delivery with the order id and Grab-formatted people", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenReply())
      .mockResolvedValueOnce(json({ deliveryID: "D123", status: "ALLOCATING" }));
    const grab = createGrabProvider({ config, fetch: f as unknown as typeof fetch });
    await expect(grab.create({ orderId: "o1", pickup, dropoff })).resolves.toEqual({
      providerRef: "D123",
      status: "booked",
    });
    const body = JSON.parse(f.mock.calls[1][1].body);
    expect(body).toMatchObject({
      merchantOrderID: "o1",
      sender: { firstName: "Shop", phone: "66812345678" },
      recipient: { firstName: "Buyer", phone: "66898765432" },
      destination: { address: "home", coordinates: { latitude: 18.8, longitude: 99 } },
    });
    expect(f.mock.calls[1][1].headers.Authorization).toBe("Bearer tok");
  });

  it("refreshes the token once after a 401, then gives up on a second failure", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenReply())
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ access_token: "tok2", expires_in: 604799 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const grab = createGrabProvider({ config, fetch: f as unknown as typeof fetch });
    await expect(grab.cancel({ providerRef: "D123" })).resolves.toBeUndefined();
    expect(f.mock.calls[3][1].headers.Authorization).toBe("Bearer tok2");
  });

  it("throws with path and status only when Grab refuses (e.g. 409 already picked up)", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenReply())
      .mockResolvedValueOnce(json({ secret: "customer address" }, 409));
    const grab = createGrabProvider({ config, fetch: f as unknown as typeof fetch });
    const error = await grab.cancel({ providerRef: "D123" }).catch((e: Error) => e);
    expect((error as Error).message).toBe("Grab DELETE /v1/deliveries/D123 failed (409)");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin, requireAuthUser, requireCustomer, requireShop } from "./index";
import { verifyLiffIdToken } from "./line";
import { getSessionUser } from "./session";
import { findAccess, upsertCustomer } from "./store";

vi.mock("./line", () => ({ verifyLiffIdToken: vi.fn() }));
vi.mock("./session", () => ({ getSessionUser: vi.fn() }));
vi.mock("./store", () => ({ findAccess: vi.fn(), upsertCustomer: vi.fn() }));

const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { headers });

// The real path is the only one in production, so run these as production.
beforeEach(() => vi.stubEnv("NODE_ENV", "production"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("requireCustomer (LIFF ID token)", () => {
  it("is 401 without a bearer token, and does not call LINE", async () => {
    await expect(requireCustomer(req())).rejects.toMatchObject({ status: 401 });
    await expect(requireCustomer(req({ authorization: "Basic abc" }))).rejects.toMatchObject({
      status: 401,
    });
    await expect(requireCustomer(req({ authorization: "Bearer " }))).rejects.toMatchObject({
      status: 401,
    });
    expect(verifyLiffIdToken).not.toHaveBeenCalled();
  });

  it("passes LINE's refusal through", async () => {
    const refusal = Object.assign(new Error("no"), { status: 401 });
    vi.mocked(verifyLiffIdToken).mockRejectedValue(refusal);
    await expect(requireCustomer(req({ authorization: "Bearer bad" }))).rejects.toBe(refusal);
  });

  it("returns the customer row that belongs to the LINE user LINE vouched for", async () => {
    const profile = { lineUserId: "U1", displayName: "ก", pictureUrl: null };
    vi.mocked(verifyLiffIdToken).mockResolvedValue(profile);
    vi.mocked(upsertCustomer).mockResolvedValue({ id: "cust-1" });

    const who = await requireCustomer(req({ authorization: "bearer good" }));

    expect(verifyLiffIdToken).toHaveBeenCalledWith("good");
    expect(upsertCustomer).toHaveBeenCalledWith(profile);
    expect(who).toEqual({ customerId: "cust-1", lineUserId: "U1" });
  });
});

describe("requireAuthUser (Supabase session)", () => {
  it("is 401 when nobody is signed in", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(requireAuthUser(req())).rejects.toMatchObject({ status: 401 });
  });

  it("returns the signed-in user, profile or not", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ authUserId: "u1", email: "a@b.c" });
    await expect(requireAuthUser(req())).resolves.toEqual({ authUserId: "u1", email: "a@b.c" });
    expect(findAccess).not.toHaveBeenCalled();
  });
});

describe("requireShop", () => {
  const signedIn = () =>
    vi.mocked(getSessionUser).mockResolvedValue({ authUserId: "u1", email: "" });

  it("is 401 when signed out", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(requireShop(req())).rejects.toMatchObject({ status: 401 });
  });

  it("is 403 for a signed-in user with no shop", async () => {
    signedIn();
    vi.mocked(findAccess).mockResolvedValue(null);
    await expect(requireShop(req())).rejects.toMatchObject({ status: 403 });
  });

  it("returns the shop of an active shop, looked up from the verified user id", async () => {
    signedIn();
    vi.mocked(findAccess).mockResolvedValue({ role: "shop", shopId: "s1", shopStatus: "active" });
    await expect(requireShop(req())).resolves.toEqual({ authUserId: "u1", shopId: "s1" });
    expect(findAccess).toHaveBeenCalledWith("u1");
  });

  it("keeps a pending shop out except where the endpoint allows it", async () => {
    signedIn();
    vi.mocked(findAccess).mockResolvedValue({ role: "shop", shopId: "s1", shopStatus: "pending" });
    await expect(requireShop(req())).rejects.toMatchObject({ status: 403 });
    await expect(requireShop(req(), { allowPending: true })).resolves.toMatchObject({
      shopId: "s1",
    });
  });
});

describe("requireAdmin", () => {
  it("lets an admin in and turns a shop away", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ authUserId: "u1", email: "" });
    vi.mocked(findAccess).mockResolvedValue({ role: "admin", shopId: null, shopStatus: null });
    await expect(requireAdmin(req())).resolves.toEqual({ authUserId: "u1" });

    vi.mocked(findAccess).mockResolvedValue({ role: "shop", shopId: "s1", shopStatus: "active" });
    await expect(requireAdmin(req())).rejects.toMatchObject({ status: 403 });
  });
});

describe("the dev header in production", () => {
  it("is ignored: a forged x-dev-user opens nothing", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(requireAdmin(req({ "x-dev-user": "admin" }))).rejects.toMatchObject({
      status: 401,
    });
    expect(findAccess).not.toHaveBeenCalled();
  });
});

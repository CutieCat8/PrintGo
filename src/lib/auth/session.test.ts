import { createServerClient } from "@supabase/ssr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionUser } from "./session";

vi.mock("@supabase/ssr", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/ssr")>()),
  createServerClient: vi.fn(),
}));

const withCookie = (cookie?: string) =>
  new Request("http://localhost/api/x", { headers: cookie ? { cookie } : {} });

const claimsAre = (result: { data: unknown; error: unknown }) =>
  vi
    .mocked(createServerClient)
    .mockReturnValue({ auth: { getClaims: async () => result } } as never);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("getSessionUser", () => {
  it("is null, without calling Supabase, when the request carries no Supabase cookie", async () => {
    expect(await getSessionUser(withCookie())).toBeNull();
    expect(await getSessionUser(withCookie("theme=dark; lang=th"))).toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("returns the verified user id and email from the token claims", async () => {
    claimsAre({ data: { claims: { sub: "user-1", email: "shop@example.com" } }, error: null });
    expect(await getSessionUser(withCookie("sb-abc-auth-token=xyz"))).toEqual({
      authUserId: "user-1",
      email: "shop@example.com",
    });
  });

  it("hands the request's cookies to Supabase and never writes cookies back", async () => {
    claimsAre({ data: { claims: { sub: "user-1" } }, error: null });
    await getSessionUser(withCookie("sb-abc-auth-token=xyz; theme=dark"));
    const options = vi.mocked(createServerClient).mock.calls[0][2] as unknown as {
      cookies: { getAll: () => { name: string }[]; setAll: () => void };
    };
    expect(options.cookies.getAll().map((c) => c.name)).toEqual(["sb-abc-auth-token", "theme"]);
    expect(() => options.cookies.setAll()).not.toThrow();
  });

  it("is null when the token does not verify", async () => {
    claimsAre({ data: null, error: new Error("invalid jwt") });
    expect(await getSessionUser(withCookie("sb-abc-auth-token=forged"))).toBeNull();
  });

  it("is null when the claims name nobody", async () => {
    claimsAre({ data: { claims: {} }, error: null });
    expect(await getSessionUser(withCookie("sb-abc-auth-token=xyz"))).toBeNull();
  });
});

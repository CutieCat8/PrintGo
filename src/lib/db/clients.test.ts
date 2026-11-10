import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getServiceClient", () => {
  it("names the missing variable instead of failing later with a vague error", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { getServiceClient } = await import("./server");
    expect(() => getServiceClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("returns a client when both variables are set, and reuses it", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-for-test");
    const { getServiceClient } = await import("./server");
    const client = getServiceClient();
    expect(typeof client.from).toBe("function");
    expect(getServiceClient()).toBe(client);
  });
});

describe("getBrowserClient", () => {
  it("returns a client built from the public variables only", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-for-test");
    const { getBrowserClient } = await import("./browser");
    expect(typeof getBrowserClient().auth.getSession).toBe("function");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ list: vi.fn(), change: vi.fn() }));
vi.mock("./shops", () => ({ createAdminShopsService: () => h }));
import { GET } from "@/app/api/admin/shops/route";
import { POST as approve } from "@/app/api/admin/shops/[id]/approve/route";
import { POST as suspend } from "@/app/api/admin/shops/[id]/suspend/route";
const id = "00000000-0000-4000-8000-000000000001";
function request(user?: string, extra: Record<string, string> = {}) {
  return new Request("https://printgo.example.invalid/api/admin/shops", {
    method: "POST",
    headers: { ...(user ? { "x-dev-user": user } : {}), ...extra },
  });
}
const ctx = () => ({ params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  h.list.mockResolvedValue({ shops: [], pendingShopCount: 0, pendingPaymentCount: 0 });
  h.change.mockResolvedValue({ id, status: "active" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe("admin routes use real requireAdmin (test/dev identity only)", () => {
  it.each([GET, approve, suspend])(
    "rejects anonymous caller before data access",
    async (handler) => {
      expect((await handler(request(), ctx())).status).toBe(401);
      expect(h.list).not.toHaveBeenCalled();
      expect(h.change).not.toHaveBeenCalled();
    },
  );
  it.each(["shop:shop-id", "customer:customer-id"])(
    "rejects %s on every endpoint",
    async (user) => {
      for (const handler of [GET, approve, suspend])
        expect((await handler(request(user), ctx())).status).toBe(403);
      expect(h.list).not.toHaveBeenCalled();
      expect(h.change).not.toHaveBeenCalled();
    },
  );
  it("admin list is private/no-store", async () => {
    const response = await GET(request("admin"), ctx());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each([
    [approve, "approve"],
    [suspend, "suspend"],
  ] as const)("calls only the authorized action", async (handler, action) => {
    expect(
      (await handler(request("admin", { origin: "https://printgo.example.invalid" }), ctx()))
        .status,
    ).toBe(200);
    expect(h.change).toHaveBeenCalledWith(id, action);
  });
  it.each([approve, suspend])(
    "rejects cross-origin mutation despite valid admin identity",
    async (handler) => {
      expect(
        (await handler(request("admin", { origin: "https://evil.example.invalid" }), ctx())).status,
      ).toBe(403);
      expect(h.change).not.toHaveBeenCalled();
    },
  );
  it("rejects cross-site fetch metadata", async () => {
    expect(
      (await approve(request("admin", { "sec-fetch-site": "cross-site" }), ctx())).status,
    ).toBe(403);
  });
  it("malformed shop ID does not reach the data service", async () => {
    expect(
      (await approve(request("admin"), { params: Promise.resolve({ id: "bad" }) })).status,
    ).toBe(404);
    expect(h.change).not.toHaveBeenCalled();
  });
  it("dev admin header cannot grant production access", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await GET(request("admin"), ctx())).status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });
});

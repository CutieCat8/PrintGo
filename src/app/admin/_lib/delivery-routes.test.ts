import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ queue: vi.fn(), overview: vi.fn(), apply: vi.fn(), query: vi.fn() }));
vi.mock("./deliveries", () => ({ loadDeliveryQueue: h.queue, loadOverview: h.overview }));
vi.mock("@/lib/delivery", () => ({ applyDeliveryUpdate: h.apply }));
vi.mock("@/lib/db/server", () => ({
  getServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: h.query }) }) }),
  }),
}));
import { GET as orders } from "@/app/api/admin/orders/route";
import { GET as overview } from "@/app/api/admin/overview/route";
import { POST as update } from "@/app/api/admin/orders/[id]/delivery/route";
const id = "00000000-0000-4000-8000-000000000001";
const ctx = { params: Promise.resolve({ id }) };
function req(
  user?: string,
  body: unknown = { status: "booked", feeSatang: 6500 },
  origin = "https://printgo.example.invalid",
) {
  return new Request("https://printgo.example.invalid/api/admin/orders?queue=delivery", {
    method: "POST",
    headers: { ...(user ? { "x-dev-user": user } : {}), origin },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  h.query.mockResolvedValue({ data: { provider: "manual" }, error: null });
  h.apply.mockResolvedValue({ status: "booked" });
  h.queue.mockResolvedValue({ deliveries: [] });
  h.overview.mockResolvedValue({ ordersToday: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe("A7 routes", () => {
  it.each([undefined, "customer:id", "shop:id"])(
    "rejects unauthorized %s before data access",
    async (user) => {
      for (const handler of [orders, overview, update])
        expect((await handler(req(user), ctx)).status).toBe(user ? 403 : 401);
      expect(h.query).not.toHaveBeenCalled();
      expect(h.queue).not.toHaveBeenCalled();
      expect(h.overview).not.toHaveBeenCalled();
    },
  );
  it("reads queue and overview as admin, private/no-store", async () => {
    for (const handler of [orders, overview]) {
      const r = await handler(req("admin"), ctx);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("private, no-store");
    }
  });
  it("rejects cross origin and invalid amount before write", async () => {
    expect(
      (await update(req("admin", { status: "booked" }, "https://evil.example.invalid"), ctx))
        .status,
    ).toBe(403);
    expect((await update(req("admin", { status: "booked", feeSatang: 1.1 }), ctx)).status).toBe(
      422,
    );
    expect(h.apply).not.toHaveBeenCalled();
  });
  it("refuses Grab rows through the manual endpoint", async () => {
    h.query.mockResolvedValue({ data: { provider: "grab" }, error: null });
    expect((await update(req("admin"), ctx)).status).toBe(409);
    expect(h.apply).not.toHaveBeenCalled();
  });
  it("uses the central delivery operation for admin changes", async () => {
    expect((await update(req("admin"), ctx)).status).toBe(200);
    expect(h.apply).toHaveBeenCalledWith(id, { status: "booked", feeSatang: 6500 });
  });
});

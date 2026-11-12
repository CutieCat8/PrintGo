import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  payments: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  refund: vi.fn(),
  orders: vi.fn(),
  detail: vi.fn(),
  cancel: vi.fn(),
  complete: vi.fn(),
}));
vi.mock("./operations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./operations")>()),
  createAdminOperations: () => h,
}));
import { GET as payments } from "@/app/api/admin/payments/route";
import { GET as orders } from "@/app/api/admin/orders/route";
import { GET as detail } from "@/app/api/admin/orders/[id]/route";
import { POST as approve } from "@/app/api/admin/payments/[id]/approve/route";
import { POST as reject } from "@/app/api/admin/payments/[id]/reject/route";
import { POST as refund } from "@/app/api/admin/payments/[id]/refund/route";
import { POST as cancel } from "@/app/api/admin/orders/[id]/cancel/route";
import { POST as complete } from "@/app/api/admin/orders/[id]/complete/route";
const id = "00000000-0000-4000-8000-000000000001";
const ctx = () => ({ params: Promise.resolve({ id }) });
function req(user?: string, body?: unknown, headers: Record<string, string> = {}, query = "") {
  return new Request(`https://printgo.example.invalid/api/admin/orders${query}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(user ? { "x-dev-user": user } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  for (const fn of Object.values(h)) fn.mockResolvedValue({});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe("A6 endpoint boundaries", () => {
  for (const [name, handler] of Object.entries({
    payments,
    orders,
    detail,
    approve,
    reject,
    refund,
    cancel,
    complete,
  })) {
    it(`${name} rejects anonymous and non-admin before data access`, async () => {
      for (const [user, status] of [
        [undefined, 401],
        ["customer:fake", 403],
        ["shop:fake", 403],
      ] as const)
        expect((await handler(req(user), ctx())).status).toBe(status);
      for (const fn of Object.values(h)) expect(fn).not.toHaveBeenCalled();
    });
  }
  it.each([approve, reject, refund, cancel, complete])(
    "blocks cross-origin mutations",
    async (handler) => {
      expect(
        (
          await handler(
            req("admin", { reason: "ตัวอย่างสมมติ" }, { origin: "https://evil.invalid" }),
            ctx(),
          )
        ).status,
      ).toBe(403);
      for (const fn of Object.values(h)) expect(fn).not.toHaveBeenCalled();
    },
  );
  it.each([reject, refund, cancel, complete])("requires a reason", async (handler) => {
    for (const body of [{}, { reason: "  " }, { reason: "x".repeat(501) }])
      expect((await handler(req("admin", body), ctx())).status).toBe(422);
  });
  it("preserves integer partial refund and rejects invalid inputs", async () => {
    expect(
      (await cancel(req("admin", { reason: "ตัวอย่างสมมติ", refundSatang: 5000 }), ctx())).status,
    ).toBe(200);
    expect(h.cancel).toHaveBeenCalledWith(id, "ตัวอย่างสมมติ", 5000);
    for (const refundSatang of [0, -1, 1.1, "100", 2147483648])
      expect((await cancel(req("admin", { reason: "คืน", refundSatang }), ctx())).status).toBe(422);
  });
  it.each([
    [approve, "approve"],
    [reject, "reject"],
    [refund, "refund"],
    [complete, "complete"],
  ] as const)("dispatches an authenticated mutation", async (handler, name) => {
    expect((await handler(req("admin", { reason: "ตัวอย่างสมมติ" }), ctx())).status).toBe(200);
    expect(h[name]).toHaveBeenCalled();
  });
  it("rejects invalid filters and returns private data", async () => {
    expect((await payments(req("admin", undefined, {}, "?status=oops"), ctx())).status).toBe(422);
    expect((await orders(req("admin", undefined, {}, "?status=oops"), ctx())).status).toBe(422);
    const r = await orders(req("admin", undefined, {}, "?q=ร้าน&status=ready"), ctx());
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(h.orders).toHaveBeenCalledWith("ready", "ร้าน");
  });
});

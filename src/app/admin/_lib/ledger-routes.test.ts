import { beforeEach, afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  settlements: { list: vi.fn(), markPaid: vi.fn() },
  refunds: { list: vi.fn(), markPaid: vi.fn() },
}));
vi.mock("@/lib/payment/settlement", () => ({ createSettlementService: () => h.settlements }));
vi.mock("@/lib/payment/refund", () => ({ createRefundService: () => h.refunds }));
import { GET as settlements } from "@/app/api/admin/settlements/route";
import { POST as payShop } from "@/app/api/admin/settlements/[id]/mark-paid/route";
import { GET as refunds } from "@/app/api/admin/refunds/route";
import { POST as payRefund } from "@/app/api/admin/refunds/[id]/mark-paid/route";
const id = "00000000-0000-4000-8000-000000000001";
const ctx = () => ({ params: Promise.resolve({ id }) });
function req(user?: string, body?: string, headers: Record<string, string> = {}, query = "") {
  return new Request("https://printgo.example.invalid/api/admin/settlements" + query, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(user ? { "x-dev-user": user } : {}), ...headers },
    ...(body === undefined ? {} : { body }),
  });
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  for (const s of Object.values(h)) for (const fn of Object.values(s)) fn.mockResolvedValue({});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
it.each([settlements, refunds, payShop, payRefund])(
  "denies anonymous and other roles before store access",
  async (handler) => {
    for (const [user, status] of [
      [undefined, 401],
      ["customer:fake", 403],
      ["shop:fake", 403],
    ] as const)
      expect((await handler(req(user), ctx())).status).toBe(status);
    for (const s of Object.values(h))
      for (const fn of Object.values(s)) expect(fn).not.toHaveBeenCalled();
  },
);
it.each([payShop, payRefund])(
  "rejects cross-origin, cross-site, invalid ids and malformed JSON",
  async (handler) => {
    expect(
      (await handler(req("admin", "{}", { origin: "https://evil.invalid" }), ctx())).status,
    ).toBe(403);
    expect(
      (await handler(req("admin", "{}", { "sec-fetch-site": "cross-site" }), ctx())).status,
    ).toBe(403);
    expect(
      (await handler(req("admin", "{}"), { params: Promise.resolve({ id: "invalid" }) })).status,
    ).toBe(404);
    expect((await handler(req("admin", "{"), ctx())).status).toBe(422);
    expect(
      (await handler(req("admin", '{"status":"pending","amountSatang":1}'), ctx())).status,
    ).toBe(422);
  },
);
it("uses validated status filters and private no-store", async () => {
  for (const handler of [settlements, refunds]) {
    expect((await handler(req("admin", undefined, {}, "?status=bad"), ctx())).status).toBe(422);
    const r = await handler(req("admin", undefined, {}, "?status=all"), ctx());
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(h.settlements.list).toHaveBeenCalledWith("all");
  expect(h.refunds.list).toHaveBeenCalledWith("all");
});
it("accepts omitted bodies and only optional proof for settlement", async () => {
  expect((await payShop(req("admin", ""), ctx())).status).toBe(200);
  expect(h.settlements.markPaid).toHaveBeenCalledWith(id, undefined);
  expect((await payShop(req("admin", '{"proofPath":"proof/a.png"}'), ctx())).status).toBe(200);
  expect(h.settlements.markPaid).toHaveBeenLastCalledWith(id, "proof/a.png");
  expect((await payRefund(req("admin", ""), ctx())).status).toBe(200);
  expect(h.refunds.markPaid).toHaveBeenCalledWith(id);
  expect((await payRefund(req("admin", '{"proofPath":"proof/a.png"}'), ctx())).status).toBe(422);
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock("web-push", () => ({ default: { sendNotification, setVapidDetails } }));

// A tiny stand-in for the Supabase query builder: records deletes/updates, returns fake rows
const calls: { op: string; table: string; filters: Record<string, string> }[] = [];
let rows: { endpoint: string; p256dh: string; auth: string }[] = [];
let selectError: { code: string } | null = null;

function builder(table: string) {
  let op = "select";
  const filters: Record<string, string> = {};
  const q: Record<string, unknown> = {
    select: () => q,
    update: () => ((op = "update"), q),
    delete: () => ((op = "delete"), q),
    eq: (col: string, val: string) => {
      filters[col] = val;
      return q;
    },
    then: (resolve: (v: unknown) => void) => {
      if (op !== "select") calls.push({ op, table, filters: { ...filters } });
      resolve(op === "select" ? { data: rows, error: selectError } : { error: null });
    },
  };
  return q;
}
vi.mock("@/lib/db/server", () => ({ getServiceClient: () => ({ from: builder }) }));

const ref = { orderId: "order-1", orderNo: "PG-0012" };

async function load() {
  const mod = await import("./notifyShop");
  mod.resetVapidForTests();
  return mod;
}

beforeEach(() => {
  calls.length = 0;
  rows = [{ endpoint: "https://push.example/a", p256dh: "p", auth: "a" }];
  selectError = null;
  sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
  setVapidDetails.mockReset();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("buildPayload", () => {
  it("links to the order and carries no personal data", async () => {
    const { buildPayload } = await load();
    const order = buildPayload("order_new", ref);
    expect(order.title).toBe("ออเดอร์ใหม่ PG-0012");
    expect(order.url).toBe("/shop/orders/order-1");
    const chat = buildPayload("chat_message", ref);
    expect(chat.title).toContain("PG-0012");
    expect(chat.tag).not.toBe(order.tag);
    expect(JSON.stringify([order, chat])).not.toMatch(/\.pdf|@|ที่อยู่|โทร/);
  });

  it("encodes the order id in the link", async () => {
    const { buildPayload } = await load();
    expect(buildPayload("order_new", { ...ref, orderId: "../x?y" }).url).toBe(
      "/shop/orders/..%2Fx%3Fy",
    );
  });
});

describe("notifyShop", () => {
  it("sends to every device of the shop and records success", async () => {
    rows.push({ endpoint: "https://push.example/b", p256dh: "p2", auth: "a2" });
    const { notifyShop } = await load();
    await notifyShop("shop-1", "order_new", ref);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [sub, payload] = sendNotification.mock.calls[0];
    expect(sub).toEqual({ endpoint: "https://push.example/a", keys: { p256dh: "p", auth: "a" } });
    expect(JSON.parse(payload).url).toBe("/shop/orders/order-1");
    expect(calls.filter((c) => c.op === "update")).toHaveLength(2);
    expect(calls.filter((c) => c.op === "delete")).toHaveLength(0);
  });

  it.each([404, 410])("deletes a subscription the push service reports gone (%i)", async (statusCode) => {
    sendNotification.mockRejectedValue(Object.assign(new Error("gone"), { statusCode }));
    const { notifyShop } = await load();
    await notifyShop("shop-1", "order_new", ref);
    expect(calls).toEqual([
      {
        op: "delete",
        table: "push_subscriptions",
        filters: { endpoint: "https://push.example/a", shop_id: "shop-1" },
      },
    ]);
  });

  it("keeps the subscription on other failures and never throws", async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error("https://secret-endpoint"), { statusCode: 500 }));
    const { notifyShop } = await load();
    await expect(notifyShop("shop-1", "order_new", ref)).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
    // The error text can hold the endpoint URL: it must not reach the log
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret-endpoint");
  });

  it("does nothing when the VAPID keys are missing", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const { notifyShop } = await load();
    await expect(notifyShop("shop-1", "order_new", ref)).resolves.toBeUndefined();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not throw when the keys are rejected or the database fails", async () => {
    setVapidDetails.mockImplementation(() => {
      throw new Error("bad key private-key");
    });
    let mod = await load();
    await expect(mod.notifyShop("shop-1", "order_new", ref)).resolves.toBeUndefined();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-key");

    setVapidDetails.mockReset();
    selectError = { code: "XX000" };
    mod = await load();
    await expect(mod.notifyShop("shop-1", "order_new", ref)).resolves.toBeUndefined();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("skips quietly when the shop has no devices", async () => {
    rows = [];
    const { notifyShop } = await load();
    await notifyShop("shop-1", "chat_message", ref);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("secrets stay on the server", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }

  it("VAPID_PRIVATE_KEY is only read by server code", () => {
    const readers = files("src")
      .filter((p) => /\.(ts|tsx)$/.test(p) && !p.endsWith(".test.ts"))
      .filter((p) => readFileSync(p, "utf8").includes("VAPID_PRIVATE_KEY"))
      .map((p) => p.replace(/\\/g, "/"));
    expect(readers).toEqual(["src/lib/push/notifyShop.ts"]);
    expect(readFileSync("src/lib/push/notifyShop.ts", "utf8")).toContain('import "server-only"');
  });

  it("the service worker only opens same-origin links", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain('startsWith("/")');
    expect(sw).toContain('startsWith("//")');
  });
});

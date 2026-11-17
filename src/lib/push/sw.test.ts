import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

/** Runs public/sw.js against a fake service worker scope and returns its event handlers. */
function loadWorker(windows: { postMessage: (m: unknown) => void }[]) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const self = {
    location: { origin: "https://example.test" },
    addEventListener: (name: string, fn: (event: unknown) => void) => {
      handlers[name] = fn;
    },
    skipWaiting: vi.fn(),
    registration: { showNotification },
    clients: { claim: vi.fn(), matchAll: vi.fn().mockResolvedValue(windows), openWindow: vi.fn() },
  };
  const code = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  runInNewContext(code, { self, URL, String, Boolean });
  return { handlers, showNotification };
}

async function push(payload: unknown, windows: { postMessage: (m: unknown) => void }[]) {
  const { handlers, showNotification } = loadWorker(windows);
  const waits: Promise<unknown>[] = [];
  handlers.push!({
    data: { json: () => payload },
    waitUntil: (p: Promise<unknown>) => waits.push(p),
  });
  await Promise.all(waits);
  return showNotification;
}

describe("service worker push", () => {
  it("shows the notification and tells every open tab to ring for a new order", async () => {
    const tabA = { postMessage: vi.fn() };
    const tabB = { postMessage: vi.fn() };
    const show = await push(
      { title: "ออเดอร์ใหม่ PG-1", body: "x", tag: "order-abc", url: "/shop" },
      [tabA, tabB],
    );
    expect(show).toHaveBeenCalledTimes(1);
    expect(tabA.postMessage).toHaveBeenCalledWith({ type: "printgo-push", kind: "order_new" });
    expect(tabB.postMessage).toHaveBeenCalledWith({ type: "printgo-push", kind: "order_new" });
  });

  it("a customer message rings as a chat message and carries no personal data", async () => {
    const tab = { postMessage: vi.fn() };
    await push({ title: "ลูกค้าส่งข้อความ PG-1", body: "x", tag: "chat-abc", url: "/shop" }, [tab]);
    expect(tab.postMessage).toHaveBeenCalledWith({ type: "printgo-push", kind: "chat_message" });
    expect(Object.keys(tab.postMessage.mock.calls[0]![0] as object).sort()).toEqual([
      "kind",
      "type",
    ]);
  });

  it("still shows the notification when no tab is open", async () => {
    const show = await push({ title: "ออเดอร์ใหม่", tag: "order-1" }, []);
    expect(show).toHaveBeenCalledTimes(1);
  });
});

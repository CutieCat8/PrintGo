/* PrintGo service worker: Web Push alerts for shops (Z12, D17).
 * Payload shape comes from src/lib/push/notifyShop.ts (ShopPushPayload). It never has personal data.
 * The alert sound is the operating system's own; we cannot choose it. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = String(data.title || "PrintGo").slice(0, 80);
  const options = {
    body: String(data.body || "").slice(0, 160),
    tag: typeof data.tag === "string" ? data.tag : undefined,
    renotify: Boolean(data.tag),
    data: { url: typeof data.url === "string" ? data.url : "/shop" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Same-origin paths only: a payload must not be able to send the shop to another site
  const raw = (event.notification.data && event.notification.data.url) || "/shop";
  const path = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/shop";
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.navigate(target).then((c) => (c || client).focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

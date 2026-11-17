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
  // Also tell any open dashboard tab (even a background one) so it can play its own sound: the
  // OS notification sound is not ours and may be muted. The message carries no personal data.
  const kind = options.tag && options.tag.startsWith("order-") ? "order_new" : "chat_message";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((windows) => windows.forEach((c) => c.postMessage({ type: "printgo-push", kind }))),
    ]),
  );
});

/** Only a /shop page of this site may be opened: checked AFTER URL parsing, which strips tabs etc. */
function targetFor(raw) {
  const origin = self.location.origin;
  try {
    const url = new URL(typeof raw === "string" ? raw : "/shop", origin);
    if (url.origin === origin && (url.pathname === "/shop" || url.pathname.startsWith("/shop/"))) {
      return url.href;
    }
  } catch {
    // fall through to the dashboard
  }
  return `${origin}/shop`;
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = targetFor(event.notification.data && event.notification.data.url);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const shopWindow = windows.find((c) => {
        const u = new URL(c.url);
        return u.origin === self.location.origin && u.pathname.startsWith("/shop") && "focus" in c;
      });
      if (!shopWindow) return self.clients.openWindow(target);
      // navigate() rejects for a window this worker does not control: open a new one then
      return shopWindow
        .navigate(target)
        .then((c) => (c || shopWindow).focus())
        .catch(() => self.clients.openWindow(target));
    }),
  );
});

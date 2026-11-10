import { describe, expect, it } from "vitest";
import { loginRequired } from "./routes";

describe("loginRequired", () => {
  it.each(["/shop", "/shop/orders/123", "/shop/settings/pricing", "/admin", "/admin/shops"])(
    "protects the page %s",
    (path) => {
      expect(loginRequired(path, false)).toBe(true);
    },
  );

  it.each(["/", "/login", "/auth/callback", "/liff", "/liff/new", "/shopping", "/administrator"])(
    "leaves %s open (customers use LINE; a longer word is not a prefix match)",
    (path) => {
      expect(loginRequired(path, false)).toBe(false);
    },
  );

  it("does not redirect API calls: they answer 401/403 themselves", () => {
    expect(loginRequired("/api/shop/orders", false)).toBe(false);
    expect(loginRequired("/api/admin/shops", false)).toBe(false);
  });

  it("opens everything in mock mode, so pages can be built before sign-in exists", () => {
    expect(loginRequired("/shop", true)).toBe(false);
    expect(loginRequired("/admin/shops", true)).toBe(false);
  });
});

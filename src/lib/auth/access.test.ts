import { describe, expect, it } from "vitest";
import { assertAdminAccess, assertShopAccess, type Access } from "./access";

const shop = (shopStatus: Access["shopStatus"]): Access => ({
  role: "shop",
  shopId: "s1",
  shopStatus,
});

describe("assertShopAccess", () => {
  it("lets an active shop in", () => {
    expect(assertShopAccess(shop("active"))).toEqual({ shopId: "s1" });
  });

  it("refuses someone who has no profile", () => {
    expect(() => assertShopAccess(null)).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it("refuses an admin: shop endpoints are for shops", () => {
    const admin: Access = { role: "admin", shopId: null, shopStatus: null };
    expect(() => assertShopAccess(admin)).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it("keeps a pending shop out unless the endpoint allows pending shops", () => {
    expect(() => assertShopAccess(shop("pending"))).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    expect(assertShopAccess(shop("pending"), { allowPending: true })).toEqual({ shopId: "s1" });
  });

  it("never lets a suspended shop in, even where pending shops are allowed", () => {
    expect(() => assertShopAccess(shop("suspended"), { allowPending: true })).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });
});

describe("assertAdminAccess", () => {
  it("accepts an admin only", () => {
    expect(() =>
      assertAdminAccess({ role: "admin", shopId: null, shopStatus: null }),
    ).not.toThrow();
    expect(() => assertAdminAccess(shop("active"))).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
    expect(() => assertAdminAccess(null)).toThrowError(expect.objectContaining({ status: 403 }));
  });
});

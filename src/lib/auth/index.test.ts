import { afterEach, describe, expect, it, vi } from "vitest";
import { requireAdmin, requireAuthUser, requireCustomer, requireShop } from "./index";

const withDevUser = (value?: string) =>
  new Request("http://localhost/api/test", {
    headers: value ? { "x-dev-user": value } : {},
  });

afterEach(() => vi.unstubAllEnvs());

describe("auth stub (replaced by Z4)", () => {
  it("returns a customer for `customer:<id>`", async () => {
    await expect(requireCustomer(withDevUser("customer:c1"))).resolves.toEqual({
      customerId: "c1",
      lineUserId: "dev-line-c1",
    });
  });

  it("returns a shop for `shop:<id>`, with or without allowPending", async () => {
    const expected = { authUserId: "dev-auth-s1", shopId: "s1" };
    await expect(requireShop(withDevUser("shop:s1"))).resolves.toEqual(expected);
    await expect(requireShop(withDevUser("shop:s1"), { allowPending: true })).resolves.toEqual(
      expected,
    );
  });

  it("returns an admin for `admin`", async () => {
    await expect(requireAdmin(withDevUser("admin"))).resolves.toEqual({ authUserId: "dev-admin" });
  });

  it("lets any dev user through requireAuthUser", async () => {
    await expect(requireAuthUser(withDevUser("customer:c1"))).resolves.toMatchObject({
      authUserId: expect.any(String),
      email: expect.any(String),
    });
  });

  it("answers 401 when the header is missing or malformed", async () => {
    await expect(requireCustomer(withDevUser())).rejects.toMatchObject({ status: 401 });
    await expect(requireCustomer(withDevUser("customer"))).rejects.toMatchObject({ status: 401 });
    await expect(requireCustomer(withDevUser("nobody:1"))).rejects.toMatchObject({ status: 401 });
  });

  it("answers 403 when the dev user has the wrong role", async () => {
    await expect(requireShop(withDevUser("customer:c1"))).rejects.toMatchObject({ status: 403 });
    await expect(requireAdmin(withDevUser("shop:s1"))).rejects.toMatchObject({ status: 403 });
    await expect(requireCustomer(withDevUser("admin"))).rejects.toMatchObject({ status: 403 });
  });

  it("is switched off in production, even with a valid header", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(requireCustomer(withDevUser("customer:c1"))).rejects.toMatchObject({
      status: 401,
    });
    await expect(requireAdmin(withDevUser("admin"))).rejects.toMatchObject({ status: 401 });
  });
});

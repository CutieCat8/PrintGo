import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  incoming: new Headers(),
  redirect: vi.fn((url: string): never => {
    throw new Error(`redirect:${url}`);
  }),
  notFound: vi.fn((): never => {
    throw new Error("not-found");
  }),
}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/headers", () => ({ headers: async () => h.incoming }));
vi.mock("next/navigation", () => ({ redirect: h.redirect, notFound: h.notFound }));
import { requireAdminPage } from "./guard";
import AdminLayout from "../layout";
import AdminPage from "../page";
import AdminShopsPage from "../shops/page";
beforeEach(() => {
  h.incoming = new Headers();
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("server-side admin page guards", () => {
  it("anonymous visitors are redirected to login", async () => {
    await expect(requireAdminPage()).rejects.toThrow("redirect:/login");
  });
  it.each(["shop:shop-id", "customer:customer-id"])(
    "%s cannot render the admin shell",
    async (identity) => {
      h.incoming.set("x-dev-user", identity);
      await expect(AdminLayout({ children: "PRIVATE CONTENT" })).rejects.toThrow("not-found");
    },
  );
  it.each([AdminPage, AdminShopsPage])(
    "each page checks access itself, independent of layout reuse",
    async (page) => {
      h.incoming.set("x-dev-user", "shop:shop-id");
      await expect(page()).rejects.toThrow("not-found");
    },
  );
  it("an admin passes the server gate", async () => {
    h.incoming.set("x-dev-user", "admin");
    await expect(requireAdminPage()).resolves.toMatchObject({ authUserId: "dev-admin" });
  });
  it("production ignores the dev identity header", async () => {
    vi.stubEnv("NODE_ENV", "production");
    h.incoming.set("x-dev-user", "admin");
    await expect(requireAdminPage()).rejects.toThrow("redirect:/login");
  });
});

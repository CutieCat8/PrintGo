import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A coarse safety net, not a proof (the route tests prove the behaviour). It reads the source of
 * every route under /api/liff, /api/shop and /api/cron and fails when a new endpoint:
 *  - does not ask "who is calling" with the right kind of check, before anything else is awaited;
 *  - lets a shop that is still waiting for approval into the order or chat routes;
 *  - is exported without the `handle()` wrapper (its error format and error mapping);
 * and when something new starts writing the `orders` table.
 */
const API = join(process.cwd(), "src", "app", "api");

function listFiles(dir: string, accept: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listFiles(path, accept);
    return accept(name) ? [path] : [];
  });
}

const rel = (p: string) => p.slice(process.cwd().length + 1).replace(/\\/g, "/");
/** Comments are removed first, so a word in a comment cannot satisfy a check. */
const code = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const routes = ["liff", "shop", "cron"].flatMap((root) =>
  listFiles(join(API, root), (n) => n === "route.ts").map((file) => ({
    file,
    name: rel(file),
    root,
    path: rel(file).replace("src/app/api/", ""),
  })),
);

// Which "who is calling" function each kind of route must use.
const REQUIRED: Record<string, RegExp> = {
  liff: /\brequireCustomer\(/,
  shop: /\b(requireShop|requireAuthUser)\(/,
  cron: /\brequireCronSecret\(/,
};
const ANY_AUTH = /\b(requireCustomer|requireShop|requireAuthUser|requireCronSecret)\(/;

const SETUP_FOLDERS = ["shop/profile", "shop/hours", "shop/pricing", "shop/services", "shop/push"];
const NO_PENDING_FOLDERS = ["shop/orders", "shop/chats"];

describe("API routes of liff, shop and cron", () => {
  it("finds the routes (so this test cannot pass by scanning nothing)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(30);
  });

  it.each(routes.map((r) => [r.name, r] as const))(
    "%s asks who is calling, with the right check, before anything else",
    (_name, route) => {
      const parts = code(route.file)
        .split(/\bhandle\(/)
        .slice(1);
      expect(parts.length, "no handle(...) found").toBeGreaterThan(0);
      for (const part of parts) {
        const at = part.search(REQUIRED[route.root]);
        expect(at, `${route.root} route must call ${REQUIRED[route.root]}`).toBeGreaterThanOrEqual(
          0,
        );
        // The first thing awaited must be the check itself (a cron check is synchronous).
        const otherAwait = part.search(/\bawait\s+(?!require)/);
        if (otherAwait >= 0)
          expect(at, "something is awaited before the check").toBeLessThan(otherAwait);
      }
    },
  );

  it.each(routes.map((r) => [r.name, r] as const))(
    "%s exports only handlers wrapped in handle()",
    (_name, route) => {
      const source = code(route.file);
      expect(source).not.toMatch(/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/);
      expect(source).not.toMatch(/export\s+default\b/);
      expect(source).not.toMatch(/export\s*\{/); // `export { x as GET }` would hide the handler
      const aliases = new Set<string>();
      for (const [, name, value] of source.matchAll(/^const\s+(\w+)\s*=\s*handle\(/gm)) {
        aliases.add(name);
        void value;
      }
      for (const [, method, value] of source.matchAll(
        /export const (GET|POST|PUT|PATCH|DELETE)\s*=\s*([^;\n]+)/g,
      )) {
        const v = value.trim();
        const ok = v.startsWith("handle(") || aliases.has(v);
        expect(ok, `${method} is not wrapped in handle()`).toBe(true);
      }
    },
  );

  it("order and chat routes never let a shop that waits for approval in", () => {
    const checked = routes.filter((r) => NO_PENDING_FOLDERS.some((f) => r.path.startsWith(f)));
    expect(checked.length).toBeGreaterThan(10);
    for (const route of checked) {
      expect(code(route.file), route.name).not.toMatch(/allowPending/);
    }
  });

  it("the shop setup routes allow a pending shop (as CONTRACTS 6.2 says), and nothing else does", () => {
    for (const route of routes.filter((r) => r.root === "shop")) {
      const allows = /allowPending:\s*true/.test(code(route.file));
      const isSetup = SETUP_FOLDERS.some((f) => route.path.startsWith(f));
      expect(allows, route.name).toBe(isSetup);
    }
  });

  it("only the known code writes the orders table (a new writer must be reviewed)", () => {
    const writers = listFiles(
      join(process.cwd(), "src"),
      (n) => /\.(ts|tsx|mjs)$/.test(n) && !/\.test\.ts$/.test(n),
    )
      .flatMap((file) =>
        [
          ...code(file).matchAll(
            /from\(\s*["']orders["']\s*\)\s*\.(update|upsert|delete|insert)\(/g,
          ),
        ].map((m) => `${rel(file)}:${m[1]}`),
      )
      .sort();
    expect(writers).toEqual([
      "src/lib/domain/orders/create.ts:insert", // a new order, status "submitted"
      "src/lib/domain/orders/shop.ts:update", // the ready time (never the status)
      "src/lib/domain/orders/transition.ts:update", // every status change
    ]);
  });

  it("every route is covered by an auth call somewhere (no route file is empty of checks)", () => {
    for (const route of routes) expect(code(route.file), route.name).toMatch(ANY_AUTH);
  });
});

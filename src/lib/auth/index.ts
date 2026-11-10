import { ApiError } from "@/lib/errors";

/**
 * STUB. Task Z4 replaces the bodies with real checks (LIFF ID token / Supabase session);
 * the signatures below are fixed by docs/CONTRACTS.md section 7 and must not change.
 *
 * Until then, outside production, a request identifies itself with the header `x-dev-user`:
 *   customer:<customerId>   shop:<shopId>   admin
 * In production the stub refuses everything, so it can never grant access by accident.
 */

type DevRole = "customer" | "shop" | "admin";
type DevUser = { role: DevRole; id: string };

const ROLES: readonly string[] = ["customer", "shop", "admin"];

function readDevUser(req: Request): DevUser {
  if (process.env.NODE_ENV === "production") throw new ApiError("UNAUTHENTICATED", 401);

  const [role, id = ""] = (req.headers.get("x-dev-user") ?? "").split(":");
  if (!ROLES.includes(role)) throw new ApiError("UNAUTHENTICATED", 401);
  if (role !== "admin" && id === "") throw new ApiError("UNAUTHENTICATED", 401);
  return { role: role as DevRole, id: role === "admin" ? "admin" : id };
}

function readDevUserAs(req: Request, role: DevRole): DevUser {
  const user = readDevUser(req);
  if (user.role !== role) throw new ApiError("FORBIDDEN", 403);
  return user;
}

export async function requireCustomer(req: Request) {
  const { id } = readDevUserAs(req, "customer");
  return { customerId: id, lineUserId: `dev-line-${id}` };
}

/** Signed in, but not necessarily registered as a shop yet (used by /api/shop/me and /register). */
export async function requireAuthUser(req: Request) {
  const { role, id } = readDevUser(req);
  const authUserId = role === "admin" ? "dev-admin" : `dev-auth-${id}`;
  return { authUserId, email: `${authUserId}@dev.printgo.test` };
}

/** Shop must be `active`; `allowPending` also lets a shop that is still waiting for approval in. */
export type ShopAuthOptions = { allowPending?: boolean };

export async function requireShop(req: Request, _opts?: ShopAuthOptions) {
  const { id } = readDevUserAs(req, "shop");
  return { authUserId: `dev-auth-${id}`, shopId: id };
}

export async function requireAdmin(req: Request) {
  readDevUserAs(req, "admin");
  return { authUserId: "dev-admin" };
}

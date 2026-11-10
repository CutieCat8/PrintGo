import { ApiError } from "@/lib/errors";

/**
 * Development shortcut: outside production, `x-dev-user` stands in for a real sign-in so the team
 * can build and call APIs before shops, admins and LINE are set up.
 *   customer:<customerId>   shop:<shopId>   admin
 * In production the header is not even looked at.
 */
export type DevRole = "customer" | "shop" | "admin";
export type DevUser = { role: DevRole; id: string };

const ROLES: readonly string[] = ["customer", "shop", "admin"];

/** The dev identity, or null when the shortcut does not apply (production, or no header). */
export function readDevUser(req: Request): DevUser | null {
  if (process.env.NODE_ENV === "production") return null;
  const header = req.headers.get("x-dev-user");
  if (header === null) return null;

  const [role, id = ""] = header.split(":");
  if (!ROLES.includes(role) || (role !== "admin" && id === "")) {
    throw new ApiError("UNAUTHENTICATED", 401);
  }
  return { role: role as DevRole, id: role === "admin" ? "admin" : id };
}

/** Like readDevUser, but the identity must have the wanted role. */
export function readDevUserAs(req: Request, role: DevRole): DevUser | null {
  const user = readDevUser(req);
  if (user && user.role !== role) throw new ApiError("FORBIDDEN", 403);
  return user;
}

/** Same shape as a real auth user, for requireAuthUser. */
export function devAuthUser({ role, id }: DevUser) {
  const authUserId = role === "admin" ? "dev-admin" : `dev-auth-${id}`;
  return { authUserId, email: `${authUserId}@dev.printgo.test` };
}

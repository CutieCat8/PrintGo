import { ApiError } from "@/lib/errors";
import { assertAdminAccess, assertShopAccess } from "./access";
import { devAuthUser, readDevUser, readDevUserAs } from "./dev";
import { verifyLiffIdToken } from "./line";
import { getSessionUser } from "./session";
import { findAccess, upsertCustomer } from "./store";

/**
 * Who is calling? The four functions below are the only way an API route learns that.
 * Signatures are fixed by docs/CONTRACTS.md section 7. Every id they return comes from a
 * verified token or session, never from the request body.
 *
 *   customers  -> LIFF ID token in `Authorization: Bearer ...`, verified with LINE
 *   shops/admins -> Supabase Auth session cookie
 *
 * (Outside production `x-dev-user` can stand in for both, see dev.ts.)
 */

function bearerToken(req: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

export async function requireCustomer(req: Request) {
  const dev = readDevUserAs(req, "customer");
  if (dev) return { customerId: dev.id, lineUserId: `dev-line-${dev.id}` };

  const token = bearerToken(req);
  if (!token) throw new ApiError("UNAUTHENTICATED", 401);
  const line = await verifyLiffIdToken(token);
  const customer = await upsertCustomer(line);
  return { customerId: customer.id, lineUserId: line.lineUserId };
}

/** Signed in with Supabase Auth, but not necessarily registered as a shop yet. */
export async function requireAuthUser(req: Request) {
  const dev = readDevUser(req);
  if (dev) return devAuthUser(dev);

  const user = await getSessionUser(req);
  if (!user) throw new ApiError("UNAUTHENTICATED", 401);
  return user;
}

export type ShopAuthOptions = { allowPending?: boolean };

/** The shop must be `active`; `allowPending` also admits a shop that is waiting for approval. */
export async function requireShop(req: Request, opts: ShopAuthOptions = {}) {
  const dev = readDevUserAs(req, "shop");
  if (dev) return { authUserId: devAuthUser(dev).authUserId, shopId: dev.id };

  const { authUserId } = await requireAuthUser(req);
  const { shopId } = assertShopAccess(await findAccess(authUserId), opts);
  return { authUserId, shopId };
}

export async function requireAdmin(req: Request) {
  const dev = readDevUserAs(req, "admin");
  if (dev) return { authUserId: devAuthUser(dev).authUserId };

  const { authUserId } = await requireAuthUser(req);
  assertAdminAccess(await findAccess(authUserId));
  return { authUserId };
}

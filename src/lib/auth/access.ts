import { ApiError } from "@/lib/errors";
import type { Role, ShopStatus } from "@/lib/db/types";

/** What the database says a signed-in person may be (one `profiles` row, plus their shop's status). */
export type Access = { role: Role; shopId: string | null; shopStatus: ShopStatus | null };

const forbidden = () => new ApiError("FORBIDDEN", 403);

/**
 * A shop needs to be `active`. `allowPending` is for the few endpoints a shop may use while it
 * waits for approval (CONTRACTS 6.2: profile, hours, pricing, services ...). Suspended never passes.
 */
export function assertShopAccess(access: Access | null, opts: { allowPending?: boolean } = {}) {
  if (access?.role !== "shop" || access.shopId === null) throw forbidden();
  const allowed =
    access.shopStatus === "active" || (opts.allowPending && access.shopStatus === "pending");
  if (!allowed) throw forbidden();
  return { shopId: access.shopId };
}

export function assertAdminAccess(access: Access | null) {
  if (access?.role !== "admin") throw forbidden();
}

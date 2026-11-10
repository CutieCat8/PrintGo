/**
 * Pages that need a signed-in shop or admin. This is a convenience (send people to /login instead
 * of showing a broken page), not the lock: every API route still checks access itself.
 * "/shop" must match "/shop" and "/shop/...", but not "/shopping".
 */
const PROTECTED_ROOTS = ["/shop", "/admin"];

/** `mockMode`: the frontend is running on its mock API, so there is no real sign-in to ask for. */
export function loginRequired(pathname: string, mockMode: boolean): boolean {
  if (mockMode) return false;
  return PROTECTED_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

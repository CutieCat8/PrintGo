import { createServerClient, parseCookieHeader } from "@supabase/ssr";

/**
 * Who is signed in with Supabase Auth (shops and admins), read from the request's cookies.
 * `getClaims()` verifies the token's signature; the raw cookie is never trusted on its own.
 * Cookies are never written here: refreshing an expiring session is the job of src/proxy.ts.
 */
export async function getSessionUser(req: Request) {
  const cookies = parseCookieHeader(req.headers.get("cookie") ?? "");
  // No Supabase cookie means nobody signed in: skip the call
  if (!cookies.some((c) => c.name.startsWith("sb-"))) return null;

  // Written out in full: Next.js only inlines `process.env.NEXT_PUBLIC_*` when the name is literal.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookies, setAll: () => {} } },
  );

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string } | undefined;
  if (error || !claims?.sub) return null;
  return { authUserId: claims.sub, email: claims.email ?? "" };
}

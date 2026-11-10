import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { loginRequired } from "@/lib/auth/routes";

/**
 * Runs before every request (Next.js 16 calls this file `proxy`, formerly `middleware`).
 * 1. Keeps a shop/admin's Supabase session fresh: an expired token is refreshed here, because
 *    route handlers cannot write cookies back.
 * 2. Sends signed-out visitors of /shop and /admin to /login. API routes are NOT guarded here;
 *    each one calls requireShop / requireAdmin itself.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let signedIn = false;

  // Customers (LINE) and visitors have no Supabase cookie: nothing to refresh, no call to make
  if (request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(cookiesToSet, headers) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
            Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
          },
        },
      },
    );
    const { data } = await supabase.auth.getClaims(); // verifies the token, refreshing it if needed
    signedIn = Boolean(data?.claims);
  }

  const mockMode =
    process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_USE_MOCK === "true";
  if (!signedIn && loginRequired(request.nextUrl.pathname, mockMode)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  // everything except static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

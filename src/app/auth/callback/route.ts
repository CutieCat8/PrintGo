import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/auth/next-client";
import { findAccess } from "@/lib/auth/store";

/**
 * Where the magic link in the e-mail lands. Swaps the one-time `code` for a session cookie,
 * then sends admins to /admin and everyone else to /shop (new shops fill in their details there).
 * The destination is fixed on purpose: a `next=` parameter would be an open redirect.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createAuthClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const access = await findAccess(data.user.id);
      return NextResponse.redirect(new URL(access?.role === "admin" ? "/admin" : "/shop", url));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url));
}

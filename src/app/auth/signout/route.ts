import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/auth/next-client";

/** POST only (a link could be triggered by any page): clears the session, back to /login. */
export async function POST(request: Request) {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}

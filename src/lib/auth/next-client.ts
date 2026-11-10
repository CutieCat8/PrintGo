import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for route handlers that sign someone in or out: unlike session.ts it can
 * write the session cookies. Use it only in /auth/* handlers.
 */
export async function createAuthClient() {
  const cookieStore = await cookies();
  // Written out in full: Next.js only inlines `process.env.NEXT_PUBLIC_*` when the name is literal.
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) =>
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    },
  );
}

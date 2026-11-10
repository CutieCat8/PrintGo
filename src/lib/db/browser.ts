import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client with the public (anon) key. In this project it exists for Supabase Auth only
 * (magic-link sign-in for shops and admins): the database grants it no table access (see the
 * migration), and all data goes through our own API routes instead.
 */
export function getBrowserClient() {
  // Written out in full: Next.js only inlines `process.env.NEXT_PUBLIC_*` when the name is literal.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)",
    );
  }
  return createBrowserClient(url, anonKey);
}

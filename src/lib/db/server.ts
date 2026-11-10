import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The only door to the database for server code (route handlers, cron, scripts called by the server).
 * It uses the service role key, which bypasses RLS, so every caller must check who is asking
 * (requireCustomer / requireShop / requireAdmin) before touching data. `server-only` makes the
 * build fail if a browser bundle ever imports this file.
 */
let client: SupabaseClient | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

export function getServiceClient(): SupabaseClient {
  client ??= createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }, // a server has no user session
  );
  return client;
}

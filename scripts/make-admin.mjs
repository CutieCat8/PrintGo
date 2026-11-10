// Gives an existing account the admin role.
//   npm run make-admin -- someone@example.com
// The person must have signed in once at /login, so that their Supabase account exists.
import { createClient } from "@supabase/supabase-js";

class UserError extends Error {}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new UserError("Usage: npm run make-admin -- <email>");

  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
  if (!url || !key) {
    throw new UserError(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (see .env.local)",
    );
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const userId = await findUserId(db, email);
  if (!userId)
    throw new UserError(`No account for ${email}. Ask them to sign in once at /login first.`);

  const { data: existing, error: lookupError } = await db
    .from("profiles")
    .select("role")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (lookupError) throw new UserError(lookupError.message);
  if (existing?.role === "shop") {
    throw new UserError(`${email} owns a shop; use a different account for the admin.`);
  }

  const { error } = await db
    .from("profiles")
    .upsert({ auth_user_id: userId, role: "admin", shop_id: null }, { onConflict: "auth_user_id" });
  if (error) throw new UserError(error.message);
  console.log(`${email} is now an admin.`);
}

async function findUserId(db, wanted) {
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw new UserError(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (hit) return hit.id;
    if (data.users.length < perPage) return null;
  }
}

// Set the exit code instead of calling process.exit(): on Windows, exiting while the HTTP
// connection is still closing aborts Node with a libuv assertion.
main().catch((error) => {
  console.error(error instanceof UserError ? error.message : error);
  process.exitCode = 1;
});

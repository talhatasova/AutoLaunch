import { createClient } from "@supabase/supabase-js";
import type { Database } from "@directorylaunch/shared";

/**
 * THE ONE AUDITED SERVICE-ROLE PATH IN apps/web. Do not add a second.
 *
 * Everything else in this app runs under the user's session with RLS as the tenant
 * boundary, and `no-service-role.test.ts` fails the build if the key appears anywhere but
 * this file. That guard is deliberately narrow rather than absolute, because one operation
 * genuinely cannot be done under the user's own credentials.
 *
 * WHY THIS EXISTS
 *
 * `submissions.consent_granted_at` authorises the worker to tick a third party's terms
 * checkbox. It is supposed to be evidence that we displayed that directory's terms first.
 * While clients held INSERT on `submissions`, it was not evidence: a user could POST
 * straight to PostgREST with the timestamp set and never see the terms. RLS could not help
 * - it checks who owns the app, not whether a consent claim is true.
 *
 * So `submissions` INSERT was revoked from `authenticated` entirely (migration 0007), and
 * rows are created here instead. Consent becomes something only server code can assert.
 *
 * THE TRADE, STATED PLAINLY
 *
 * This client bypasses RLS. Any caller MUST establish ownership in code first - see
 * `assertOwnsApp`. RLS is not a backstop on this path; there is no backstop but the check.
 */

let cached: ReturnType<typeof createClient<Database>> | null = null;

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) {
    // Failing loudly beats degrading to the user client, which would silently
    // reintroduce the forgeable-consent hole this module exists to close.
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. It is required to create submissions; " +
        "see supabase/migrations/20260825000007_lock_consent_columns.sql.",
    );
  }

  cached ??= createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/**
 * Proves the signed-in user owns this app BEFORE any service-role write touches it.
 *
 * Read through the caller's own RLS-bound client, never the admin one: if the app is not
 * theirs, RLS returns no row and this throws. That keeps the tenancy decision inside the
 * policy layer even though the write that follows bypasses it.
 */
export async function assertOwnsApp(
  userScoped: { from: (t: "apps") => any },
  appId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await userScoped.from("apps").select("id,user_id").eq("id", appId).single();

  if (error || !data || data.user_id !== userId) {
    throw new Error(`app ${appId} is not owned by the current user`);
  }
}

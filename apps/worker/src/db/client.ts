import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client.
 *
 * This key BYPASSES RLS. The worker has to: `submissions` grants no UPDATE to any client
 * role by design, because status transitions after enqueue belong here and nowhere else.
 *
 * SUPABASE_SERVICE_ROLE_KEY must never appear in apps/web, must never be prefixed
 * NEXT_PUBLIC_, and must never reach a browser.
 */
export function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  if (/^NEXT_PUBLIC_/.test(serviceRoleKey)) {
    throw new Error("Refusing to start: service role key looks like a public env var.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "directorylaunch-worker" } },
  });
}

export type ServiceClient = SupabaseClient;

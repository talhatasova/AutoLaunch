"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@directorylaunch/shared";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * The browser client. Anon key only - it is the only key that may ever exist in
 * a bundle, and RLS is what actually protects the data behind it.
 *
 * `createBrowserClient` is internally a singleton, so calling this from every
 * component that needs it is correct and cheap. Do not hoist the result into a
 * module-level constant: that would capture a client built during SSR of a
 * client component, and its cookie view would be a snapshot rather than live.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}

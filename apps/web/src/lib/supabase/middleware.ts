import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@directorylaunch/shared";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Session refresh, run on every matched request.
 *
 * Server Components cannot write cookies. Without this proxy, a token that
 * expires mid-session is refreshed in memory, the new token is discarded, and
 * the user is signed out an hour later with no error and nothing in the logs.
 * This is the single most common way a Supabase SSR integration breaks.
 *
 * The three things that must all happen, in this order:
 *
 *  1. Write refreshed cookies back onto the REQUEST, so Server Components
 *     rendering later in this same request see the new token rather than the
 *     expired one they would otherwise try to refresh again.
 *  2. Rebuild the response from the mutated request, so the updated cookies are
 *     part of the outgoing request context.
 *  3. Write the cookies onto the RESPONSE, so the browser replaces its copy.
 *
 * Skipping (1) causes a duplicate refresh and a race that can invalidate the
 * refresh token. Skipping (3) means the browser keeps the stale token forever.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // This call is the point of the proxy: it is what triggers the refresh whose
  // cookies `setAll` above then persists. `getClaims` verifies the JWT
  // signature against the project's published keys, so unlike `getSession` its
  // answer can be trusted on the server. Do not remove it, and do not run any
  // logic between `createServerClient` and here - an early return in between
  // would silently disable session refresh for that path.
  const { error } = await supabase.auth.getClaims();

  if (error) {
    // Not fatal, and not swallowed. An unauthenticated visitor hitting a public
    // page produces this routinely, so it is a debug-level line rather than an
    // error - but if sessions start dropping, this is where the evidence is.
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[auth] no valid session on ${request.nextUrl.pathname}: ${error.message}`);
    }
  }

  return response;
}

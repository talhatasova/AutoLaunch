import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@directorylaunch/shared";
import { UnauthorizedError } from "@/lib/http/errors";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * The server client, for Server Components, Server Actions and Route Handlers.
 *
 * Cookie handling is the entire subtlety of `@supabase/ssr`, and getting it
 * wrong drops sessions silently - the user appears signed in, then is not, with
 * no error anywhere. Two rules:
 *
 *  1. A new client per request. It closes over THIS request's cookies. A
 *     module-level singleton would serve one user's session to another.
 *  2. `getAll` / `setAll` as a pair. The older get/set/remove shims cannot
 *     express the chunked cookies a large JWT is split across, so a session
 *     that spans `sb-...-auth-token.0` and `.1` silently loses half of itself.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch (error) {
          // A Server Component cannot write cookies, and a refresh triggered
          // during render lands here every time. This is genuinely benign -
          // and ONLY because the proxy in `middleware.ts` refreshes the token
          // and writes it on every request, so the refreshed token is not lost.
          //
          // Not swallowed: if the proxy is ever removed or its matcher stops
          // covering a route, this log is the thread that leads to "users get
          // signed out after an hour".
          if (process.env.NODE_ENV !== "production") {
            console.debug(
              "[supabase] cookie write skipped in a render context; middleware is responsible for persisting it",
              error instanceof Error ? error.message : error,
            );
          }
        }
      },
    },
  });
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface AuthedContext {
  supabase: SupabaseServerClient;
  userId: string;
  email: string;
  /** The founder's own name from their Google profile. Never invented. */
  fullName: string | null;
}

/**
 * Resolve the caller, or throw `UnauthorizedError`.
 *
 * Uses `getUser()`, not `getSession()`. `getSession` reads the cookie and
 * decodes it without contacting the auth server, so on the server - where the
 * cookie is attacker-supplied input - its user object is a claim, not a fact.
 * `getUser` validates. The extra round trip is the price of the identity we are
 * about to write into a `user_id` column.
 */
export async function requireUser(supabase: SupabaseServerClient): Promise<AuthedContext> {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw new UnauthorizedError("Your session has expired. Sign in again to continue.");
  }
  const user = data.user;
  if (!user) {
    throw new UnauthorizedError();
  }
  if (!user.email) {
    // contact_email in the submission payload is the founder's OWN address. If
    // Google gave us no email we have nothing to put there, and we will not
    // invent one.
    throw new UnauthorizedError(
      "Your account has no email address, which we need before submitting anything on your behalf.",
    );
  }

  const metadata = user.user_metadata ?? {};
  const rawName = metadata.full_name ?? metadata.name ?? null;

  return {
    supabase,
    userId: user.id,
    email: user.email,
    // user_metadata is user-editable and is NEVER used for authorization here -
    // only as a display name to type into a "your name" form field.
    fullName: typeof rawName === "string" && rawName.trim().length > 0 ? rawName.trim() : null,
  };
}

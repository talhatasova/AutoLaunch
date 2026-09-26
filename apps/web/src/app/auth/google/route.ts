import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";
import { safeNextPath } from "@/lib/http/next-path";

/**
 * Start the Google OAuth flow.
 *
 * A route handler rather than a client call so the PKCE verifier is written as
 * an httpOnly cookie by the server. Doing this from the browser puts the
 * verifier in localStorage, where any XSS can read it.
 */
async function start(request: NextRequest) {
  const supabase = await createClient();
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  // Built from the configured site URL, never from the request Host header - a
  // forged Host would otherwise let an attacker point our own OAuth redirect at
  // their domain and collect the code.
  const callback = new URL("/auth/callback", siteUrl());
  callback.searchParams.set("next", next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      // Only what we actually use: identity and an email address to put in the
      // contact field of submissions the founder has asked us to make.
      scopes: "openid email profile",
    },
  });

  if (error || !data.url) {
    console.error(`[auth/sign-in] could not start Google OAuth: ${error?.message ?? "no redirect URL returned"}`);
    const failure = new URL("/auth/auth-code-error", siteUrl());
    failure.searchParams.set("reason", "start_failed");
    return NextResponse.redirect(failure, { status: 303 });
  }

  return NextResponse.redirect(data.url, { status: 303 });
}

export async function GET(request: NextRequest) {
  return await start(request);
}

/** POST so a sign-in button can be a real form submission and get CSRF-safe semantics. */
export async function POST(request: NextRequest) {
  return await start(request);
}

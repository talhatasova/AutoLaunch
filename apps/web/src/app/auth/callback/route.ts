import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";
import { safeNextPath } from "@/lib/http/next-path";

/**
 * The OAuth callback. Google sends the user back here with a one-time code.
 *
 * `exchangeCodeForSession` is what turns that code into a session, and - because
 * this client is built with the request's cookie store - it is also what writes
 * the session cookies. Doing the exchange anywhere other than a route handler or
 * the proxy means the cookies are computed and then thrown away.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));

  // The provider reports refusal (user pressed Cancel, or the app is not
  // approved) as query parameters, not as a missing code. Distinguish them so a
  // cancelled sign-in does not look like a broken one.
  const providerError = params.get("error");
  if (providerError) {
    const description = params.get("error_description") ?? "";
    console.warn(`[auth/callback] provider returned ${providerError}: ${description}`);
    return redirectToError(providerError === "access_denied" ? "cancelled" : "provider_error");
  }

  const code = params.get("code");
  if (!code) {
    console.warn("[auth/callback] hit with neither a code nor an error - probably a stale or replayed link");
    return redirectToError("missing_code");
  }

  const supabase = await createClient();

  // When several PKCE flows are in flight (two tabs), the flow id says which
  // stored verifier belongs to this code. Guessing would consume the single-use
  // code against the wrong verifier and fail both flows.
  const flowId = params.get("sb_flow_id");

  const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);

  if (error) {
    // The usual causes are a reused code, an expired code, or a verifier cookie
    // that never arrived because the callback host differs from the host that
    // started the flow. All three are worth naming in the log.
    console.error(`[auth/callback] code exchange failed: ${error.message}`, {
      status: error.status,
      hadFlowId: Boolean(flowId),
    });
    return redirectToError("exchange_failed");
  }

  // Redirect off the configured site URL rather than the request's own origin,
  // so a forged Host header cannot bounce a freshly-authenticated user off-site.
  return NextResponse.redirect(new URL(next, siteUrl()), { status: 303 });
}

function redirectToError(reason: string): NextResponse {
  const url = new URL("/auth/auth-code-error", siteUrl());
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url, { status: 303 });
}

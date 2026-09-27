import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL;
  // Next normalizes nextUrl.origin to localhost in development; Host preserves
  // the domain the visitor actually used (and Railway forwards that host).
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const path = request.nextUrl.pathname;
  const appHost = appUrl && new URL(appUrl).host;
  const marketingHost = marketingUrl && new URL(marketingUrl).host;

  if (appUrl && appHost !== marketingHost && host === appHost && path === "/") {
    return NextResponse.redirect(new URL("/dashboard", appUrl));
  }
  if (
    appUrl && appHost !== marketingHost &&
    host === marketingHost &&
    /^(\/dashboard|\/auth)(\/|$)/.test(path)
  ) {
    return NextResponse.redirect(new URL(path + request.nextUrl.search, appUrl));
  }
  if (marketingHost && marketingHost !== appHost && host === marketingHost) {
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  /**
   * Run everywhere except static assets.
   *
   * The temptation is to narrow this to `/dashboard` and `/api`, but the
   * matcher must cover every route that reads a session - including the ones
   * that only read it to decide whether to show a "Sign in" link. A route left
   * out of the matcher gets no token refresh, so a user browsing there for an
   * hour is silently signed out.
   *
   * Excluded: Next's build output, the favicon, and image files, none of which
   * touch Supabase.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};

import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
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

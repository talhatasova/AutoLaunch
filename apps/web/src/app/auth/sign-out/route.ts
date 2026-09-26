import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";

/**
 * Sign out.
 *
 * POST only. A GET sign-out is triggerable by any `<img src>` on any page, which
 * makes logging a user out a one-line cross-site attack. It is a state change,
 * so it takes a state-changing method.
 */
export async function POST() {
  const supabase = await createClient();

  // `signOut` revokes the refresh token server-side and clears the cookies via
  // this client's cookie adapter. Clearing cookies without revoking would leave
  // a working refresh token in anyone's hands who had already copied it.
  const { error } = await supabase.auth.signOut();

  if (error) {
    // Not fatal - the cookies are still cleared below by the redirect response -
    // but a revocation that failed is exactly the thing you want to know about
    // when investigating a session that outlived its sign-out.
    console.error(`[auth/sign-out] revoke failed: ${error.message}`);
  }

  return NextResponse.redirect(new URL("/", siteUrl()), { status: 303 });
}

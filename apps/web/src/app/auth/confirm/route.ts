import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  if (!tokenHash) {
    return NextResponse.redirect(new URL("/auth/auth-code-error?reason=missing_code", siteUrl()));
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error) {
    console.error("[auth/confirm] token exchange failed:", error.message);
    return NextResponse.redirect(new URL("/auth/auth-code-error?reason=exchange_failed", siteUrl()));
  }
  return NextResponse.redirect(new URL("/dashboard", siteUrl()), { status: 303 });
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/env";

const emailSchema = z.string().trim().email();

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) {
    return NextResponse.redirect(new URL("/auth/sign-in?error=email", siteUrl()), { status: 303 });
  }

  const supabase = await createClient();
  const callback = new URL("/auth/callback", siteUrl());
  callback.searchParams.set("next", "/dashboard");
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: callback.toString() },
  });
  if (error) {
    console.error("[auth/email] sign-in link request failed:", error.message);
    return NextResponse.redirect(new URL("/auth/sign-in?error=send", siteUrl()), { status: 303 });
  }
  return NextResponse.redirect(new URL("/auth/sign-in?sent=1", siteUrl()), { status: 303 });
}

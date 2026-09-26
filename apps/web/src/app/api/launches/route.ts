import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toErrorResponse } from "@/lib/http/errors";
import { loadLatestLaunch } from "@/lib/launch/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/launches - the caller's most recent launch.
 *
 * The dashboard has no app id in its URL, so it needs a "what am I looking at"
 * entry point. `data` is null rather than a 404 when the founder has never
 * launched anything: having no launches is a normal state for a new account,
 * not an error, and the UI renders an empty state for it.
 */
export async function GET() {
  const supabase = await createClient();

  try {
    const snapshot = await loadLatestLaunch(supabase);
    return NextResponse.json(
      { data: snapshot },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return toErrorResponse(error, "GET /api/launches");
  }
}

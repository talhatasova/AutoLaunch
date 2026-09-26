import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toErrorResponse, ValidationError } from "@/lib/http/errors";
import { loadLaunch } from "@/lib/launch/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/launches/:appId
 *
 * Returns a `LaunchSnapshot` - the exact shape `LaunchSource.getLaunch` is
 * declared to return in `src/lib/data/types.ts`, so a Supabase-backed source is
 * a drop-in for the fixture source with no component changes.
 */
export async function GET(_request: Request, context: { params: Promise<{ appId: string }> }) {
  const supabase = await createClient();

  try {
    const { appId } = await context.params;

    // A non-UUID would make PostgREST return a 22P02 cast error, which would
    // surface as an opaque 500. Reject it here as the bad input it is.
    if (!UUID.test(appId)) {
      throw new ValidationError("That is not a valid launch id.", { appId });
    }

    const snapshot = await loadLaunch(supabase, appId);
    return NextResponse.json(
      { data: snapshot },
      // A launch changes as the worker moves it. Never let a CDN or the browser
      // serve a stale board - and never let a shared cache hold one user's
      // launch where another could be served it.
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return toErrorResponse(error, "GET /api/launches/[appId]");
  }
}

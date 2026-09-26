import { NotFoundError, DatabaseError } from "@/lib/http/errors";
import { requireUser, type SupabaseServerClient } from "@/lib/supabase/server";
import type { LaunchSnapshot } from "@/lib/data/types";
import { SUBMISSION_SELECT, buildSnapshot, type SubmissionWithDirectory } from "./snapshot";
import type { Tables } from "@directorylaunch/shared";

/**
 * Load one launch as the `LaunchSnapshot` the dashboard consumes.
 *
 * Shared by `GET /api/launches/[appId]` and the server-rendered dashboard page,
 * so the initial HTML and the first client fetch cannot disagree about shape.
 *
 * There is no ownership filter in this file. That is intentional: RLS is the
 * tenant boundary, and adding a `.eq("user_id", ...)` here would create a second
 * place where tenancy is enforced - one that could drift from the policy and
 * give a false sense that the policy is optional. A row belonging to someone
 * else simply does not come back, and that surfaces as a 404.
 */

const EVENT_LIMIT = 200;

export async function loadLaunch(
  supabase: SupabaseServerClient,
  appId: string,
): Promise<LaunchSnapshot> {
  const { email } = await requireUser(supabase);

  const { data: app, error: appError } = await supabase
    .from("apps")
    .select("*")
    .eq("id", appId)
    .maybeSingle<Tables<"apps">>();

  if (appError) {
    throw new DatabaseError("load app", `${appError.code}: ${appError.message}`, { appId });
  }
  if (!app) {
    // Could be a missing row or one RLS refused. Both are 404 to the caller:
    // telling the difference would confirm the existence of another user's app.
    throw new NotFoundError("Launch", appId);
  }

  const { data: submissions, error: submissionsError } = await supabase
    .from("submissions")
    .select(SUBMISSION_SELECT)
    .eq("app_id", appId)
    .order("created_at", { ascending: true })
    .returns<SubmissionWithDirectory[]>();

  if (submissionsError) {
    throw new DatabaseError("load submissions", `${submissionsError.code}: ${submissionsError.message}`, { appId });
  }

  const rows = submissions ?? [];

  // Fetch the timeline in one query keyed on the submission ids we just read,
  // rather than one query per row.
  const submissionIds = rows.map((row) => row.id);
  let events: Tables<"submission_events">[] = [];

  if (submissionIds.length > 0) {
    const { data, error } = await supabase
      .from("submission_events")
      .select("*")
      .in("submission_id", submissionIds)
      // Newest first for the LIMIT, so a long-running launch keeps its most
      // recent activity rather than its first 200 lines. `buildSnapshot` sorts
      // back into chronological order.
      .order("created_at", { ascending: false })
      .limit(EVENT_LIMIT);

    if (error) {
      throw new DatabaseError("load submission events", `${error.code}: ${error.message}`, { appId });
    }
    events = data ?? [];
  }

  return buildSnapshot(app, rows, events, { contactEmail: email });
}

/**
 * The caller's most recent launch, or null if they have never started one.
 * The dashboard uses this when no app id is in the URL.
 */
export async function loadLatestLaunch(supabase: SupabaseServerClient): Promise<LaunchSnapshot | null> {
  await requireUser(supabase);

  const { data, error } = await supabase
    .from("apps")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new DatabaseError("find latest app", `${error.code}: ${error.message}`);
  }
  if (!data) return null;

  return await loadLaunch(supabase, data.id);
}

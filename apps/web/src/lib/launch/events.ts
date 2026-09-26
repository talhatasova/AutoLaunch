import type { Json, SubmissionEventKind, TablesInsert } from "@directorylaunch/shared";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/**
 * Writing to the append-only submission timeline.
 *
 * `submission_events` is the audit trail the ADR promises in place of a managed
 * queue's dashboard. Every failure path in this codebase writes here, with
 * enough detail to debug from the dashboard rather than by reproducing the
 * request. There is no UPDATE or DELETE policy on the table by design.
 */

export interface EventDraft {
  submission_id: string;
  kind: SubmissionEventKind;
  message: string;
  payload?: Record<string, unknown> | null;
}

/**
 * Append events.
 *
 * Never throws. This is the one place where swallowing looks tempting and is
 * still wrong: if the timeline write fails we cannot report it *into* the
 * timeline, so it goes to the server log instead, loudly and with the events it
 * failed to write. What we must not do is fail the caller's request - the
 * submissions rows are already committed and the founder's launch is real
 * whether or not we managed to narrate it.
 */
export async function recordEvents(
  supabase: SupabaseServerClient,
  events: readonly EventDraft[],
): Promise<{ written: number; failure: string | null }> {
  if (events.length === 0) return { written: 0, failure: null };

  const rows: TablesInsert<"submission_events">[] = events.map((event) => ({
    submission_id: event.submission_id,
    kind: event.kind,
    message: event.message.slice(0, 2000),
    payload: (event.payload ?? null) as Json,
  }));

  const { error } = await supabase.from("submission_events").insert(rows);

  if (error) {
    console.error(
      `[events] could not append ${rows.length} event(s): ${error.code ?? "?"} ${error.message}`,
      { hint: error.hint, details: error.details, submissionIds: events.map((e) => e.submission_id) },
    );
    return { written: 0, failure: `${error.code ?? "unknown"}: ${error.message}` };
  }

  return { written: rows.length, failure: null };
}

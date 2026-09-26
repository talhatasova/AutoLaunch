import { createClient } from "@/lib/supabase/browser";
import {
  buildFixtureEvents,
  buildFixtureLaunch,
  FIXTURE_LAUNCH_ID,
  OPENING_STATE,
} from "./fixtures";
import type {
  Launch,
  LaunchEvent,
  LaunchRow,
  LaunchSnapshot,
  LaunchSource,
  LaunchSubscription,
  SubmissionEventKind,
  SubmissionStatus,
} from "./types";

/**
 * THE SEAM.
 *
 * Everything the dashboard knows about data goes through a `LaunchSource`.
 * There are two implementations and they are chosen by the caller, not by a
 * global: the landing page demo runs `FixtureSource`, and a signed-in dashboard
 * with a real launch runs `SupabaseSource`. No component knows which it got.
 */

/** One scheduled transition in the fixture replay. */
interface Beat {
  at: number;
  slug: string;
  status: SubmissionStatus;
  kind: SubmissionEventKind;
  detail: string;
  message: string;
  result?: string;
}

/**
 * The demo replay, rebuilt for the real catalog.
 *
 * The honest shape of a run is 2 automated submissions and 21 payloads handed
 * back, so the script shows exactly that. `HELD_BACK` rows start queued and
 * settle to the terminal state and reason recorded in `OPENING_STATE`, so the
 * demo never invents an outcome the research does not support - it only changes
 * WHEN the founder sees it.
 */
const HELD_BACK = [
  "startup-collections",
  "product-hunt",
  "alternativeto",
  "softwaresuggest",
  "future-tools",
  "fazier",
  "uneed",
  "betalist",
] as const;

const SCRIPT: Beat[] = [
  {
    at: 700,
    slug: "startup-collections",
    status: "running",
    kind: "started",
    detail: "Filling the submission form.",
    message: "Opened the submission form.",
  },
  {
    at: 2200,
    slug: "startup-collections",
    status: "running",
    kind: "field_filled",
    detail: "Filled every mapped field. Submitting now.",
    message: "Filled 6 of 6 fields, including your own contact email.",
  },
  {
    at: 4000,
    slug: "startup-collections",
    status: "succeeded",
    kind: "succeeded",
    detail: "Submitted and accepted. Startup Collections publishes after an editorial pass.",
    message: "Submitted. Their confirmation copy came back on the page.",
  },

  {
    at: 1500,
    slug: "product-hunt",
    status: "needs_manual",
    kind: "manual_required",
    detail: OPENING_STATE["product-hunt"]?.detail ?? "",
    message: "Cloudflare challenge, and the public API cannot create posts. Payload assembled for you.",
  },
  {
    at: 3100,
    slug: "alternativeto",
    status: "needs_manual",
    kind: "challenge_detected",
    detail: OPENING_STATE.alternativeto?.detail ?? "",
    message: "Cloudflare challenge on the submission page. Stopped - we do not solve challenges.",
  },
  {
    at: 4400,
    slug: "uneed",
    status: "needs_manual",
    kind: "challenge_detected",
    detail: OPENING_STATE.uneed?.detail ?? "",
    message: "Turnstile on the form. Stopped, and prepared the listing for you.",
  },
  {
    at: 5600,
    slug: "betalist",
    status: "needs_manual",
    kind: "manual_required",
    detail: OPENING_STATE.betalist?.detail ?? "",
    message: "Submission is gated behind a signed-in account. Payload ready.",
  },
  {
    at: 6900,
    slug: "future-tools",
    status: "needs_manual",
    kind: "challenge_detected",
    detail: OPENING_STATE["future-tools"]?.detail ?? "",
    message: "Turnstile injected after render. Stopped before submitting.",
  },
  {
    at: 8200,
    slug: "fazier",
    status: "needs_manual",
    kind: "manual_required",
    detail: OPENING_STATE.fazier?.detail ?? "",
    message: "No submission form rendered on the page. Prepared for you instead.",
  },
  {
    at: 9600,
    slug: "softwaresuggest",
    status: "needs_manual",
    kind: "manual_required",
    detail: OPENING_STATE.softwaresuggest?.detail ?? "",
    message:
      "Asks for phone, employee count, customer count and competitors. Complete your profile and we can run this one.",
  },
];

class FixtureSource implements LaunchSource {
  /** Kept per-launch so a remount resumes from the current board, not the top. */
  private launches = new Map<string, Launch>();
  private eventLogs = new Map<string, LaunchEvent[]>();
  private cursors = new Map<string, number>();

  private ensure(launchId: string): { launch: Launch; events: LaunchEvent[] } {
    let launch = this.launches.get(launchId);
    if (!launch) {
      launch = buildFixtureLaunch();
      launch.id = launchId;

      // Staging for the replay lives here, not in the fixture: the fixture is
      // the researched truth about each directory, and this only decides which
      // of those truths arrive after the founder is already looking.
      for (const row of launch.rows) {
        if ((HELD_BACK as readonly string[]).includes(row.directory.slug)) {
          row.status = "queued";
          row.detail = "Queued. A worker picks this up next.";
          row.result_url = null;
        }
      }
      launch.status = "launching";

      this.launches.set(launchId, launch);
      this.eventLogs.set(launchId, buildFixtureEvents(launch));
      this.cursors.set(launchId, 0);
    }
    return { launch, events: this.eventLogs.get(launchId) ?? [] };
  }

  async getLaunch(launchId: string): Promise<LaunchSnapshot> {
    const { launch, events } = this.ensure(launchId);
    // A touch of latency so the loading state is a real state, not a flash.
    await new Promise((r) => setTimeout(r, 220));
    return {
      launch: { ...launch, rows: launch.rows.map((r) => ({ ...r })) },
      events: [...events],
    };
  }

  subscribe(launchId: string, handlers: LaunchSubscription): () => void {
    const { launch } = this.ensure(launchId);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const startCursor = this.cursors.get(launchId) ?? 0;
    const t0 = Date.now();

    for (const beat of SCRIPT) {
      if (beat.at <= startCursor) continue;

      timers.push(
        setTimeout(() => {
          const row = launch.rows.find((r) => r.directory.slug === beat.slug);
          if (!row) return;

          row.status = beat.status;
          row.detail = beat.detail;
          row.updated_at = new Date().toISOString();
          const opening = OPENING_STATE[beat.slug];
          if (beat.result) row.result_url = beat.result;
          else if (beat.status === "succeeded" && opening?.result) row.result_url = opening.result;
          if (beat.kind === "retry_scheduled") row.attempt += 1;

          if (launch.rows.every((r) => r.status !== "queued" && r.status !== "running")) {
            launch.status = "done";
          }

          const event: LaunchEvent = {
            id: `evt_${beat.slug}_${beat.at}`,
            submission_id: row.id,
            directory_slug: row.directory.slug,
            directory_name: row.directory.name,
            kind: beat.kind,
            message: beat.message,
            at: row.updated_at,
          };
          this.eventLogs.get(launchId)?.push(event);
          this.cursors.set(launchId, beat.at);

          handlers.onRow({ ...row });
          handlers.onEvent(event);
        }, beat.at - startCursor),
      );
    }

    return () => {
      this.cursors.set(launchId, (this.cursors.get(launchId) ?? 0) + (Date.now() - t0));
      for (const t of timers) clearTimeout(t);
    };
  }
}

/* ---------------------------------------------------------------------------
   Supabase
   ------------------------------------------------------------------------ */

/**
 * The subset of `submissions` Realtime hands us. Realtime payloads are the ROW,
 * with no embedded join - so a change carries `directory_id` and nothing about
 * the directory. The row's directory is resolved from the snapshot we already
 * loaded rather than by firing a follow-up select per event.
 */
interface SubmissionChange {
  id: string;
  directory_id: string;
  status: SubmissionStatus;
  result_url: string | null;
  error_message: string | null;
  attempt_count: number | null;
  submitted_at: string | null;
  next_attempt_at: string | null;
  created_at: string;
}

interface EventChange {
  id: string;
  submission_id: string;
  kind: SubmissionEventKind;
  message: string;
  created_at: string;
}

/**
 * Live launch state over Supabase Realtime.
 *
 * Two rules this class exists to keep:
 *
 *  1. NO POLLING. `submissions` and `submission_events` are both in the
 *     publication, so a worker writing a row is what moves the board. There is
 *     no interval anywhere in this file.
 *  2. Anon key and RLS only. The browser client carries the publishable key;
 *     Realtime authorises the channel with the same session, so a founder can
 *     only ever receive their own rows. The service role key is never imported
 *     here - see `lib/supabase/no-service-role.test.ts`.
 *
 * The initial snapshot comes from the server render (`loadLatestLaunch`), so
 * `getLaunch` re-reads through the same route the page used rather than
 * duplicating the query shape.
 */
export class SupabaseSource implements LaunchSource {
  /**
   * The server-rendered snapshot is handed out exactly once. After that every
   * read goes to the network, so "Reload the board" after an error genuinely
   * reloads instead of replaying the HTML the founder is already looking at.
   */
  private served = false;

  constructor(private readonly initial?: LaunchSnapshot) {}

  async getLaunch(launchId: string): Promise<LaunchSnapshot> {
    if (!this.served && this.initial && this.initial.launch.id === launchId) {
      this.served = true;
      return this.initial;
    }

    const response = await fetch(`/api/launches/${launchId}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(body?.error?.message ?? `The board could not be read (${response.status}).`);
    }
    const body = (await response.json()) as { data: LaunchSnapshot };
    return body.data;
  }

  subscribe(launchId: string, handlers: LaunchSubscription): () => void {
    const supabase = createClient();

    // Directory metadata by submission id, seeded from the snapshot. A row we
    // have never seen is skipped rather than rendered with a blank directory -
    // an unnamed row on the board would be worse than a row that appears on the
    // next load.
    const directories = new Map(
      (this.initial?.launch.rows ?? []).map((row) => [row.id, row.directory]),
    );

    const channel = supabase
      .channel(`launch:${launchId}`)
      .on(
        "postgres_changes",
        // No filter on app_id: `submissions` has no such index guarantee for
        // Realtime filters and RLS already scopes the stream to this founder.
        // Rows for another launch of theirs are dropped below by lookup miss.
        { event: "UPDATE", schema: "public", table: "submissions" },
        (payload) => {
          const change = payload.new as SubmissionChange;
          const directory = directories.get(change.id);
          if (!directory) return;

          handlers.onRow({
            id: change.id,
            directory,
            status: change.status,
            result_url: change.result_url,
            detail: change.error_message?.trim() || fallbackDetail(change.status, directory.name),
            attempt: change.attempt_count ?? 0,
            updated_at: change.submitted_at ?? change.next_attempt_at ?? change.created_at,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "submission_events" },
        (payload) => {
          const change = payload.new as EventChange;
          const directory = directories.get(change.submission_id);
          if (!directory) return;

          handlers.onEvent({
            id: change.id,
            submission_id: change.submission_id,
            directory_slug: directory.slug,
            directory_name: directory.name,
            kind: change.kind,
            message: change.message,
            at: change.created_at,
          });
        },
      )
      .subscribe((status) => {
        // CLOSED is a normal unmount. The other two mean the stream is gone and
        // the board would silently freeze on stale rows, which is the one
        // failure mode worth interrupting the founder about.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          handlers.onError(
            new Error(
              "The live connection dropped. Your submissions keep running server-side - reload to catch up.",
            ),
          );
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }
}

/**
 * Used only when a worker wrote no message. `error_message` is the specific
 * sentence and is always preferred; this exists so no row ever renders blank.
 */
function fallbackDetail(status: SubmissionStatus, name: string): string {
  switch (status) {
    case "queued":
      return `Queued for ${name}.`;
    case "running":
      return `Submitting to ${name} now.`;
    case "succeeded":
      return `Submitted to ${name}.`;
    case "needs_manual":
      return `${name} is ready for you. The payload is assembled - one click submits it.`;
    case "failed":
      return `The submission to ${name} did not go through. The log has the details.`;
    case "pending_review":
      return `${name} sent a receipt and is reviewing the listing.`;
    case "unconfirmed":
      return `${name} may have received the submission; investigate before retrying.`;
    case "live":
      return `${name} has a verified public listing.`;
  }
}

/** The landing-page demo. Deterministic, offline, and never touches Supabase. */
export const launchSource: LaunchSource = new FixtureSource();
export const DEMO_LAUNCH_ID = FIXTURE_LAUNCH_ID;

/** Live source for a signed-in dashboard, seeded with the server render. */
export function createLaunchSource(initial?: LaunchSnapshot): LaunchSource {
  return initial ? new SupabaseSource(initial) : launchSource;
}

export type { LaunchRow };

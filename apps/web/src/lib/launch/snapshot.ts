import { isTerminal, type Tables, type Tier } from "@directorylaunch/shared";
import type {
  DirectoryView,
  Launch,
  LaunchEvent,
  LaunchRow,
  LaunchSnapshot,
} from "@/lib/data/types";

type AppRow = Tables<"apps">;
type EventRow = Tables<"submission_events">;

/**
 * Row shapes as they come back from PostgREST.
 *
 * The directory is embedded rather than joined manually because the dashboard
 * needs both halves for every row, and 23 follow-up queries per launch is the
 * N+1 this avoids.
 */
export type EmbeddedDirectory = Pick<
  Tables<"directories">,
  | "id"
  | "slug"
  | "name"
  | "url"
  | "submission_url"
  | "tier"
  | "submission_method"
  | "requires_captcha"
  | "category"
  | "domain_rating"
  | "status"
>;

export type SubmissionWithDirectory = Tables<"submissions"> & {
  directories: EmbeddedDirectory;
};

/** The select string. Kept next to the type it produces so the two cannot drift. */
export const SUBMISSION_SELECT =
  "id, app_id, directory_id, status, submitted_at, result_url, error_message, attempt_count, next_attempt_at, created_at, " +
  "directories!inner(id, slug, name, url, submission_url, tier, submission_method, requires_captcha, category, domain_rating, status)";

function toDirectoryView(directory: EmbeddedDirectory): DirectoryView {
  return {
    slug: directory.slug,
    name: directory.name,
    url: directory.url,
    submission_url: directory.submission_url,
    // The column is a smallint with CHECK (tier in (1,2,3)); the view model wants
    // the literal union. The constraint is what makes this cast honest.
    tier: directory.tier as Tier,
    submission_method: directory.submission_method,
    requires_captcha: directory.requires_captcha,
    category: directory.category,
    domain_rating: directory.domain_rating,
    // Renamed from `status` so a reader can never confuse directory health with
    // submission state - they are different enums with overlapping vocabulary.
    health: directory.status,
  };
}

/**
 * The one sentence the founder reads for a row.
 *
 * `error_message` is written by whoever last touched the row - this route on
 * fan-out, the worker afterwards - and is always preferred, because it is
 * specific. The fallbacks exist so that no row ever renders blank.
 *
 * A `needs_manual` row is never described as a failure. It is the terminal state
 * for 21 of 23 directories and describing it as failure would misrepresent the
 * product to the person paying for it.
 */
export function detailFor(submission: SubmissionWithDirectory): string {
  const stored = submission.error_message?.trim();
  const name = submission.directories.name;

  switch (submission.status) {
    case "queued":
      if (submission.attempt_count > 0) {
        const next = submission.attempt_count + 1;
        return stored
          ? `${stored} Retrying - attempt ${next}.`
          : `Waiting to retry ${name} - attempt ${next}.`;
      }
      return stored ?? `Queued for ${name}.`;

    case "running":
      return stored ?? `Submitting to ${name} now.`;

    case "succeeded":
      if (submission.result_url) return stored ?? `Published. Live at ${submission.directories.url}.`;
      return stored ?? `Submitted to ${name}. Awaiting their review.`;

    case "needs_manual":
      if (stored) return stored;
      if (submission.directories.requires_captcha) {
        return `${name} shows a CAPTCHA on submit. We stopped rather than solving it - your listing is ready for one click.`;
      }
      return `${name} needs a signed-in account or a human reviewer. Your listing is assembled and ready to submit.`;

    case "failed":
      return stored ?? `The submission to ${name} did not go through. We have kept the details in the log.`;

    default:
      return stored ?? `Waiting on ${name}.`;
  }
}

function toLaunchRow(submission: SubmissionWithDirectory): LaunchRow {
  return {
    id: submission.id,
    directory: toDirectoryView(submission.directories),
    status: submission.status,
    result_url: submission.result_url,
    detail: detailFor(submission),
    attempt: submission.attempt_count,
    // submissions has no updated_at column, so the most recent thing that
    // actually happened to the row is the best available answer.
    updated_at: submission.submitted_at ?? submission.next_attempt_at ?? submission.created_at,
  };
}

export interface SnapshotOptions {
  /** The authenticated founder's own email. Never invented, never another user's. */
  contactEmail?: string;
}

/**
 * Assemble the `LaunchSnapshot` the dashboard consumes.
 *
 * The `LaunchSource` contract in `src/lib/data/types.ts` is owned by the
 * frontend and is not modified here; this function exists to satisfy it exactly,
 * so a Supabase-backed source is a drop-in for the fixture source.
 */
export function buildSnapshot(
  app: AppRow,
  submissions: readonly SubmissionWithDirectory[],
  events: readonly EventRow[],
  options: SnapshotOptions = {},
): LaunchSnapshot {
  const rows = submissions.map(toLaunchRow);

  const byId = new Map(submissions.map((s) => [s.id, s.directories]));

  const launchEvents: LaunchEvent[] = events
    .filter((event) => byId.has(event.submission_id))
    .map((event) => {
      const directory = byId.get(event.submission_id) as EmbeddedDirectory;
      return {
        id: event.id,
        submission_id: event.submission_id,
        directory_slug: directory.slug,
        directory_name: directory.name,
        kind: event.kind,
        message: event.message,
        at: event.created_at,
      };
    })
    // Oldest first. `useLaunch` reverses this into a newest-first live tail, so
    // returning it the other way round would silently invert the log.
    .sort((a, b) => a.at.localeCompare(b.at));

  // An app with no rows yet has not started, so its stored status is the truth.
  // Claiming `done` for an empty board would be a lie the UI would render.
  const settled = rows.length > 0 && rows.every((row) => isTerminal(row.status));
  const status = rows.length === 0 ? app.status : settled ? "done" : "launching";

  const launch: Launch = {
    // One app is one launch. There is no separate launches table, and inventing
    // an id here would break every subsequent lookup.
    id: app.id,
    app: {
      id: app.id,
      name: app.name,
      // The view model requires strings. Empty beats the literal text "null"
      // appearing in the UI.
      tagline: app.tagline ?? "",
      url: app.url,
      category: firstCategory(submissions),
      contact_email: options.contactEmail ?? "",
    },
    status,
    started_at: app.created_at,
    rows,
  };

  return { launch, events: launchEvents };
}

/**
 * The app's own category.
 *
 * `apps` has no category column, so the closest honest answer is the category of
 * the directories it was fanned out to - which is derived from the same catalog
 * the founder's listing was matched against.
 */
function firstCategory(submissions: readonly SubmissionWithDirectory[]): string {
  const counts = new Map<string, number>();
  for (const submission of submissions) {
    const category = submission.directories.category;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}

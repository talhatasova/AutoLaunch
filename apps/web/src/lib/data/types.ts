import type {
  AppStatus,
  CompanyProfile,
  CompanyProfileField,
  Directory,
  SubmissionEventKind,
  SubmissionStatus,
  Tier,
} from "@directorylaunch/shared";

/**
 * View models for the dashboard.
 *
 * These are deliberately NOT the raw row shapes. The UI renders exactly these
 * types; the data source is responsible for producing them. When Phase 2 swaps
 * the fixture source for Supabase Realtime, every component here keeps working
 * because nothing outside `src/lib/data` knows where a LaunchRow came from.
 */

/** The subset of a directory the dashboard actually renders. */
export type DirectoryView = Pick<
  Directory,
  | "slug"
  | "name"
  | "url"
  | "submission_url"
  | "tier"
  | "submission_method"
  | "requires_captcha"
  | "category"
  | "domain_rating"
> & {
  health: Directory["status"];
  /**
   * Both optional on purpose. `SUBMISSION_SELECT` in `lib/launch/snapshot.ts`
   * does not embed these two columns, so a Supabase-built row legitimately has
   * neither. `requirementsFor()` in `./fixtures` fills the gap from the seeded
   * catalog by slug, which means the consent and profile UI works identically
   * whether a row came from the fixture or from Postgres.
   */
  requires_consent?: boolean;
  requires_profile_fields?: readonly CompanyProfileField[];
};

/** One app-to-directory submission, as a board row. */
export interface LaunchRow {
  /** submissions.id */
  id: string;
  directory: DirectoryView;
  status: SubmissionStatus;
  /** Where the published listing lives, once it exists. */
  result_url: string | null;
  /** The one sentence we show the founder about this row's current state. */
  detail: string;
  attempt: number;
  updated_at: string;
}

export interface LaunchApp {
  id: string;
  name: string;
  tagline: string;
  url: string;
  category: string;
  contact_email: string;
  /**
   * The founder's own name, as it will appear on any form that asks for one.
   * Optional because `buildSnapshot` reads it from the session and Google does
   * not always supply it - we render "not on file" rather than inventing a
   * persona. Never a display handle we made up.
   */
  founder_name?: string | null;
}

export interface Launch {
  id: string;
  app: LaunchApp;
  status: AppStatus;
  started_at: string;
  rows: LaunchRow[];
}

/** A line in the running log. Mirrors `submission_events`. */
export interface LaunchEvent {
  id: string;
  submission_id: string;
  directory_slug: string;
  directory_name: string;
  kind: SubmissionEventKind;
  message: string;
  at: string;
}

export interface LaunchSnapshot {
  launch: Launch;
  events: LaunchEvent[];
}

export interface LaunchSubscription {
  onRow: (row: LaunchRow) => void;
  onEvent: (event: LaunchEvent) => void;
  onError: (error: Error) => void;
}

/**
 * The single seam between the UI and its data.
 *
 * Phase 1: `FixtureSource` replays a scripted timeline.
 * Phase 2: `SupabaseSource` does the same shape over a Realtime channel on
 * `submissions` + `submission_events`. No component changes.
 */
export interface LaunchSource {
  getLaunch(launchId: string): Promise<LaunchSnapshot>;
  subscribe(launchId: string, handlers: LaunchSubscription): () => void;
}

export type { AppStatus, CompanyProfile, CompanyProfileField, SubmissionStatus, SubmissionEventKind, Tier };

/** Board grouping. Tier 3 is a first-class group, never a hidden overflow. */
export const TIER_LABEL: Record<Tier, string> = {
  1: "Direct API",
  2: "Automated form",
  3: "Manual review",
};

export const TIER_DESCRIPTION: Record<Tier, string> = {
  1: "A directory that publishes a create-listing API. We would post your listing and get a URL back.",
  2: "A plain HTML form with no challenge. Our browser fills it in exactly as you would.",
  3: "A CAPTCHA, a login wall, or a human reviewer. We assemble the payload and hand it to you.",
};

/**
 * Shown wherever a tier has no directories in it.
 *
 * Tier 1 is the live case and it is empty: we checked all 23 and not one
 * publishes a create-listing API. The board renders this sentence instead of a
 * group, because a "Tier 1 - 0 directories" heading reads like a loading state
 * and a fabricated count would be worse. Never show a number here.
 */
export const TIER_EMPTY_NOTE: Record<Tier, string> = {
  1: "None yet. We checked every directory in the catalog and none of them publishes a create-listing API. If one ships, its rows appear here.",
  2: "None yet. No directory in the catalog currently accepts a plain unauthenticated form post.",
  3: "None yet.",
};

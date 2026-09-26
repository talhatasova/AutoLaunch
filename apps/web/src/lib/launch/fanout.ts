import {
  formSchemaSchema,
  apiConfigSchema,
  companyProfileFieldSchema,
  profileSatisfies,
  type CompanyProfile,
  type CompanyProfileField,
  type SubmissionEventKind,
  type SubmissionStatus,
  type Tables,
} from "@directorylaunch/shared";

type DirectoryRow = Tables<"directories">;

/**
 * Decide what happens to each directory for one app.
 *
 * This is a pure function on purpose. Fan-out policy is the part of `POST
 * /api/apps` most likely to be wrong and most expensive to be wrong about, so it
 * is decided without a database, a network, or a clock in scope.
 *
 * The governing rule: EVERY active directory gets a `submissions` row. Tier 3 is
 * 21 of our 23 directories - it is the product's main path, not an exception.
 * Those rows resolve to `needs_manual`, which is a terminal SUCCESS-ADJACENT
 * state: we assembled the payload and the founder does one click. Omitting them
 * would make the dashboard show 2 rows instead of 23 and misrepresent the work.
 */

export interface FanoutInput {
  /**
   * Directory slugs whose terms the founder explicitly agreed to in the UI.
   *
   * We never tick a consent checkbox on someone's behalf. A consent-gated
   * directory without agreement stays needs_manual - not failed, and not
   * silently submitted.
   */
  consentedSlugs: readonly string[];
  /**
   * The founder's company profile, or null until they complete that optional
   * step. A directory needing a field they have not filled in stays
   * needs_manual; we do not guess a headcount on someone's behalf, because it
   * gets published under their name.
   */
  companyProfile?: CompanyProfile | null;
  /** Injectable so the timestamp written into `consent_granted_at` is testable. */
  now?: () => Date;
}

export interface FanoutItem {
  directory: DirectoryRow;
  status: Extract<SubmissionStatus, "queued" | "needs_manual">;
  /** The event kind written alongside the row so the timeline starts populated. */
  eventKind: Extract<SubmissionEventKind, "queued" | "manual_required">;
  /** One sentence for the founder. Becomes submissions.error_message and the event message. */
  reason: string;
  /** Whether a pg-boss job should be created for this row. */
  enqueue: boolean;
  /**
   * Written to `submissions.consent_granted_at`. Non-null ONLY when this
   * directory asked for consent and the founder explicitly gave it. It is the
   * only source of consent the worker will accept, and there is no UPDATE
   * policy on `submissions`, so it cannot be back-filled by a client later.
   */
  consentGrantedAt: string | null;
}

function manual(directory: DirectoryRow, reason: string): FanoutItem {
  return {
    directory,
    status: "needs_manual",
    eventKind: "manual_required",
    reason,
    enqueue: false,
    // No automated attempt, so no consent is recorded. Recording it anyway
    // would leave a grant on file for work we never did.
    consentGrantedAt: null,
  };
}

function queued(directory: DirectoryRow, reason: string, consentGrantedAt: string | null): FanoutItem {
  return { directory, status: "queued", eventKind: "queued", reason, enqueue: true, consentGrantedAt };
}

/**
 * True when this directory's form carries a terms/consent control.
 *
 * `directories.requires_consent` is authoritative. The form_schema fallback
 * exists for a row seeded before that column landed, so a stale row fails
 * toward asking the founder rather than toward ticking a box unasked.
 */
export function requiresConsent(directory: DirectoryRow): boolean {
  if (directory.requires_consent) return true;
  const parsed = formSchemaSchema.safeParse(directory.form_schema);
  if (!parsed.success) return false;
  return parsed.data.extra_fields.some((field) => field.source === "consent");
}

/** The company-profile fields this directory needs, ignoring anything unrecognised. */
export function requiredProfileFields(directory: DirectoryRow): CompanyProfileField[] {
  const raw = directory.requires_profile_fields ?? [];
  const out: CompanyProfileField[] = [];
  for (const value of raw) {
    const parsed = companyProfileFieldSchema.safeParse(value);
    // An unknown field name is a catalog bug, not a reason to block a launch.
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function planOne(directory: DirectoryRow, input: FanoutInput): FanoutItem {
  // A CAPTCHA or bot-detection challenge ends the conversation. We do not solve
  // them, evade them, or retry hoping to slip through. The DB CHECK already
  // forces tier 3 here, but the rule is stated where the decision is made.
  if (directory.requires_captcha) {
    return manual(
      directory,
      `${directory.name} puts a CAPTCHA on its submission form. We do not solve challenges, so your listing is ready for you to paste in.`,
    );
  }

  if (directory.tier === 3) {
    return manual(
      directory,
      `${directory.name} needs a signed-in account or a human reviewer. Your listing is assembled and ready to submit.`,
    );
  }

  if (directory.tier === 1 || directory.tier === 2) {
    if (directory.tier === 1 && !apiConfigSchema.safeParse(directory.api_config).success) {
      // A CHECK constraint makes this unreachable from a valid seed. If a row
      // ever does get here, handing it to the founder beats handing the worker
      // a config it cannot use.
      return manual(
        directory,
        `${directory.name} is marked as an API integration but its configuration is unreadable, so we have not attempted it automatically.`,
      );
    }

    if (directory.tier === 2 && !formSchemaSchema.safeParse(directory.form_schema).success) {
      return manual(
        directory,
        `${directory.name} is marked as an automated form but its form mapping is missing or invalid, so we have not attempted it automatically.`,
      );
    }

    // Consent is per-directory and is never inferred, never defaulted, and
    // never carried across from another directory.
    const needsConsent = requiresConsent(directory);
    const consented = input.consentedSlugs.includes(directory.slug);
    if (needsConsent && !consented) {
      return manual(
        directory,
        `${directory.name} requires agreeing to its terms. We do not accept terms on your behalf, so this one is ready for you to confirm.`,
      );
    }

    // A directory asking for company-profile fields the founder has not filled
    // in is NOT a failure. Nothing is broken - an optional section is empty,
    // and we will not invent its contents.
    const required = requiredProfileFields(directory);
    if (!profileSatisfies(input.companyProfile ?? null, required)) {
      const missing = required.filter((field) => {
        const value = input.companyProfile?.[field];
        return Array.isArray(value) ? value.length === 0 : value === null || value === undefined || value === "";
      });
      return manual(
        directory,
        `${directory.name} asks for ${missing.join(", ")}, which we do not have yet. Add them to your company profile and we can submit this one automatically.`,
      );
    }

    const consentGrantedAt = needsConsent ? (input.now?.() ?? new Date()).toISOString() : null;

    return queued(
      directory,
      directory.tier === 1
        ? `Queued for the ${directory.name} listing API.`
        : `Queued for the ${directory.name} submission form.`,
      consentGrantedAt,
    );
  }

  // Unknown tier. Fail toward the founder, never toward an automated attempt.
  return manual(
    directory,
    `${directory.name} is not classified for automation, so we have prepared the listing for you to submit.`,
  );
}

/**
 * Build the fan-out plan for a set of directories.
 *
 * `broken` directories are excluded entirely: an integration we know has stopped
 * working would produce a row that can only ever fail, and a row that can only
 * fail is worse than no row.
 */
export function planFanout(directories: readonly DirectoryRow[], input: FanoutInput): FanoutItem[] {
  return directories.filter((d) => d.status === "active").map((d) => planOne(d, input));
}

import { z } from "zod";
import { submissionStatusSchema } from "./status";

/**
 * The payload assembled from the founder's app and handed to a submission driver.
 *
 * `contact_email` is the AUTHENTICATED FOUNDER'S OWN email. We never fabricate an
 * identity to create an account on a directory. Where a form requires an email, this is
 * what goes in it, and the UI discloses that before submission.
 */
/**
 * Sales-qualification fields that some directories require and a product listing does not.
 *
 * Collected once in an optional onboarding step, never invented. A directory needing any
 * of these stays `needs_manual` until the founder has filled the relevant field - we do
 * not guess a headcount or a competitor list on someone's behalf, because these get
 * published under their name.
 *
 * Exists because SoftwareSuggest and its class are free and un-CAPTCHA'd but ask for
 * phone / employee count / customer count / competitors. Carrying these promotes that
 * whole class from Tier 3 to Tier 2.
 */
export const companyProfileSchema = z.object({
  phone: z.string().min(1).nullable().default(null),
  employee_count: z.string().min(1).nullable().default(null),
  customer_count: z.string().min(1).nullable().default(null),
  competitors: z.array(z.string()).default([]),
  founded_year: z.number().int().min(1900).max(2100).nullable().default(null),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;

/** Which profile fields a directory needs before it can be automated. */
export const companyProfileFieldSchema = companyProfileSchema.keyof();
export type CompanyProfileField = z.infer<typeof companyProfileFieldSchema>;

/**
 * True when every profile field this directory requires is populated. A directory whose
 * requirements are unmet is NOT a failure - it stays needs_manual and the UI prompts the
 * founder to complete that section.
 */
export function profileSatisfies(
  profile: CompanyProfile | null,
  required: readonly CompanyProfileField[],
): boolean {
  if (required.length === 0) return true;
  if (!profile) return false;
  return required.every((f) => {
    const v = profile[f];
    return Array.isArray(v) ? v.length > 0 : v !== null && v !== "";
  });
}

export const submissionPayloadSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().min(1).max(200),
  description: z.string().min(1),
  url: z.string().url(),
  category: z.string().min(1),
  tags: z.array(z.string()).default([]),
  logo_url: z.string().url().nullable(),
  screenshot_url: z.string().url().nullable(),
  contact_email: z.string().email(),
  /**
   * The authenticated founder's own name, from their profile. Present because real forms
   * ask for it. This is not a fabricated identity - it is the user's real name, used with
   * their knowledge, same rule as contact_email.
   */
  founder_name: z.string().min(1),
  /** Null until the founder completes the optional company-profile step. */
  company_profile: companyProfileSchema.nullable().default(null),
});
export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;

/** The pg-boss job body. Small on purpose - the worker reads current state from the DB. */
export const submissionJobSchema = z.object({
  submission_id: z.string().uuid(),
  app_id: z.string().uuid(),
  directory_id: z.string().uuid(),
  attempt: z.number().int().min(0).default(0),
});
export type SubmissionJob = z.infer<typeof submissionJobSchema>;

export const SUBMISSION_QUEUE = "directory-submission" as const;

/**
 * Why a job ended where it did. `challenge_detected` is the honest, load-bearing one:
 * we saw a CAPTCHA or bot-detection challenge and STOPPED. It resolves to needs_manual,
 * never to a retry and never to a solve attempt.
 */
export const submissionOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("succeeded"), result_url: z.string().url().nullable() }),
  z.object({ kind: z.literal("challenge_detected"), detail: z.string() }),
  z.object({ kind: z.literal("manual_required"), detail: z.string() }),
  z.object({ kind: z.literal("selector_missing"), selector: z.string(), detail: z.string() }),
  z.object({ kind: z.literal("transient_error"), detail: z.string() }),
  z.object({ kind: z.literal("permanent_error"), detail: z.string() }),
]);
export type SubmissionOutcome = z.infer<typeof submissionOutcomeSchema>;

/** Single place mapping a driver outcome to the row status the dashboard renders. */
export function outcomeToStatus(outcome: SubmissionOutcome) {
  switch (outcome.kind) {
    case "succeeded":
      return "succeeded" as const;
    // A refused challenge is not a failure - the payload is ready for one click.
    case "challenge_detected":
    case "manual_required":
      return "needs_manual" as const;
    // The form changed underneath us. Retrying blindly cannot help.
    case "selector_missing":
    case "permanent_error":
      return "failed" as const;
    case "transient_error":
      return "queued" as const;
  }
}

/** Only genuinely transient failures are worth another attempt. */
export function isRetryable(outcome: SubmissionOutcome): boolean {
  return outcome.kind === "transient_error";
}

export const MAX_ATTEMPTS = 3;

/** Exponential backoff with jitter. We are a guest on these sites. */
export function backoffSeconds(attempt: number): number {
  const base = Math.min(60 * 2 ** attempt, 900);
  return Math.round(base * (0.5 + Math.random() * 0.5));
}

export const submissionEventKindSchema = z.enum([
  "queued",
  "started",
  "field_filled",
  "submitted",
  "succeeded",
  "challenge_detected",
  "manual_required",
  "selector_missing",
  "retry_scheduled",
  "failed",
  "receipt",
  "unconfirmed",
  "live",
]);
export type SubmissionEventKind = z.infer<typeof submissionEventKindSchema>;

export const submissionEventSchema = z.object({
  submission_id: z.string().uuid(),
  kind: submissionEventKindSchema,
  message: z.string(),
  payload: z.record(z.unknown()).nullable(),
});
export type SubmissionEvent = z.infer<typeof submissionEventSchema>;

export { submissionStatusSchema };

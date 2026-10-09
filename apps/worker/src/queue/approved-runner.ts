import type { SubmissionOutcome, SubmissionPayload } from "@directorylaunch/shared";
import { submissionPayloadSchema } from "@directorylaunch/shared";
import * as repo from "../db/repository";
import type { Db, DirectoryRow, EventKind, Job, SubmissionRow } from "../db/repository";
import { loadPlatformAccount, openPlatformPage } from "../drivers/platform-session";
import { parseRecipe } from "../drivers/recipe";
import type { Recipe } from "../drivers/recipe";
import { postToSocial } from "../drivers/social";
import { Tier2FormDriver } from "../drivers/tier2-form";
import { buildManualHandoff } from "../drivers/tier3-manual";
import type { DriverReporter, SubmissionContext } from "../drivers/types";
import { classifyUnknownError } from "../errors";
import { plusAddress, waitForVerificationLink } from "../inbox/inbox";
import { liveCheckSchedule } from "../live/detector";
import { describeError, log } from "../logger";
import type { Logger } from "../logger";
import { PlaywrightPool } from "../net/browser";
import { DomainRateLimiter } from "../net/rate-limit";
import { finalOutcome, targetStillEligible } from "./approved";

const DEFAULT_VERIFICATION_TIMEOUT_MS = 5 * 60_000;

/** The catalog says a challenge guards this channel, so meeting one is not breakage. */
function challengeExpected(row: DirectoryRow): boolean {
  return row.requires_captcha || row.challenge_kind !== "none";
}

/**
 * Form email fields get the platform plus-address (verification mail lands in our inbox);
 * a separate public-contact field gets the founder's public_contact_email. Without an
 * inbox both fall back to public_contact_email.
 */
function contextFor(row: DirectoryRow, recipe: Recipe | null, submission: SubmissionRow, payload: SubmissionPayload, inbox: string | null): SubmissionContext {
  const directory = repo.toDirectory(row);
  return {
    submission_id: submission.id,
    directory: {
      ...directory,
      form_schema: recipe?.form ?? directory.form_schema,
      // A catalog challenge stops in preflight, before any request to the site.
      requires_captcha: challengeExpected(row),
    },
    payload: { ...payload, contact_email: inbox ?? payload.public_contact_email, inbox_address: inbox },
    consent: submission.consent_granted_at
      ? { directory_slug: directory.slug, granted_at: submission.consent_granted_at.toISOString() }
      : null,
  };
}

/** Waits for the directory's verification email and opens its link. Returns a failure reason or null. */
async function completeEmailVerification(
  row: DirectoryRow, recipe: Recipe | null, inbox: string | null, pool: PlaywrightPool, limiter: DomainRateLimiter,
  event: (kind: EventKind, message: string, payload?: Record<string, unknown>) => Promise<void>, jlog: Logger,
): Promise<string | null> {
  if (!inbox) return "The directory asked for email verification, but the platform inbox is not configured.";
  await event("started", "Waiting for the directory's verification email.", { step: "email_verification" });
  let link: string | null;
  try {
    link = await waitForVerificationLink({
      to: inbox,
      directoryHost: new URL(row.url).hostname,
      fromContains: recipe?.email_verification?.from_contains,
      timeoutMs: recipe?.email_verification?.timeout_ms ?? DEFAULT_VERIFICATION_TIMEOUT_MS,
      log: jlog,
    });
  } catch (cause) {
    jlog.warn("inbox wait failed", describeError(cause));
    return "The platform inbox could not be read, so the verification email was not opened.";
  }
  if (!link) return "The directory's verification email did not arrive in time.";
  const host = new URL(link).hostname;
  return await limiter.run(link, async () => {
    const page = await pool.newPage();
    try {
      const nav = await page.goto(link);
      if (nav.status !== null && nav.status >= 400) return `The verification link on ${host} returned HTTP ${nav.status}.`;
    } finally {
      await page.close().catch(() => undefined);
    }
    // The link itself carries a token, so only its host is recorded.
    await event("started", `Opened the verification link from ${host}.`, { step: "email_verification", host });
    return null;
  });
}

export async function runApprovedJob(db: Db, job: Job, pool: PlaywrightPool, limiter: DomainRateLimiter): Promise<void> {
  const { submission, directory: row } = await repo.loadJob(db, job);
  const raw = (submission.approved_payload ?? {}) as Record<string, unknown>;
  const jlog = log.child({
    job_id: job.job_id, submission_id: job.submission_id, directory: row.slug,
    ...(typeof raw.request_id === "string" ? { request_id: raw.request_id } : {}),
  });
  jlog.info("job started");
  let clicked = false;

  async function event(kind: EventKind, message: string, payload: Record<string, unknown> | null = null) {
    jlog.info(message, { event: kind }); // message only: payloads may carry the founder's listing
    await repo.recordEvent(db, job.submission_id, kind, message, payload);
  }

  const reporter: DriverReporter = {
    async submitAttempted() {
      clicked = true;
      await event("submitted", "Submit action started; awaiting a reliable receipt.");
    },
    async fieldFilled(_selector, payloadKey) {
      await event("field_filled", `Filled ${payloadKey}.`);
    },
    async submitted(detail) {
      clicked = true;
      await event("submitted", detail);
    },
    async note(_kind, message, payload) {
      await event("started", message, payload ?? null);
    },
  };

  let outcome: SubmissionOutcome;
  let ctx: SubmissionContext | null = null;
  let frozen: SubmissionPayload | null = null;
  let social = false;
  let verificationFailure: string | null = null;
  if (!targetStillEligible(row) || (row.obligation && !submission.obligation_confirmed_at)) {
    outcome = { kind: "permanent_error", detail: "Directory certification expired or its requirement was not confirmed." };
  } else {
    try {
      const recipe = parseRecipe(row.recipe, row.slug);
      frozen = submissionPayloadSchema.parse(submission.approved_payload);
      const inbox = plusAddress(job.submission_id);
      if (inbox) await repo.updateSubmission(db, job.submission_id, { inbox_address: inbox });
      else jlog.warn("platform inbox not configured; form email fields use public_contact_email");
      ctx = contextFor(row, recipe, submission, frozen, inbox);
      const runCtx = ctx;
      if (recipe?.social) {
        social = true;
        const account = await loadPlatformAccount(db, row.id);
        outcome = await limiter.run(recipe.social.base_url, () => postToSocial(recipe.social!, account, runCtx, reporter));
      } else {
        const openPage = row.needs_platform_account
          ? () => openPlatformPage(db, pool, row.id, row.url, recipe?.login, (message, payload) => event("started", message, payload))
          : () => pool.newPage();
        jlog.info("navigating", { host: new URL(runCtx.directory.submission_url).hostname });
        outcome = await limiter.run(runCtx.directory.submission_url, () => new Tier2FormDriver(openPage).run(runCtx, reporter));
        if (outcome.kind === "succeeded" && (recipe?.email_verification || row.needs_email_verification)) {
          verificationFailure = await completeEmailVerification(row, recipe, inbox, pool, limiter, event, jlog);
        }
      }
    } catch (error) {
      outcome = classifyUnknownError(error);
    }
  }

  const final = verificationFailure
    ? { status: "unconfirmed" as const, event: "unconfirmed" as const, message: `The directory returned a receipt, but email verification did not complete: ${verificationFailure} Investigate before retrying.` }
    : finalOutcome(outcome, clicked, social);
  jlog.info("job outcome", { outcome: outcome.kind, status: final.status });
  const now = new Date();
  const resultUrl = outcome.kind === "succeeded" ? outcome.result_url : null;
  await repo.updateSubmission(db, job.submission_id, {
    status: final.status,
    submitted_at: clicked ? now : null,
    receipt_evidence: resultUrl ? { observed_url: resultUrl } : null,
    error_message: outcome.kind === "succeeded" ? verificationFailure : "detail" in outcome ? outcome.detail : final.message,
    attempt_count: submission.attempt_count + 1,
    ...(final.status === "live" ? { result_url: resultUrl, live_checked_at: now } : {}),
    ...(outcome.kind === "succeeded" && final.status !== "live" ? liveCheckSchedule(row.live_lookup, now) : {}),
  });

  // The founder pastes manually with their own details, so the handoff uses the frozen snapshot.
  const handoff = final.status === "needs_manual" && ctx && frozen
    ? buildManualHandoff({ ...ctx, payload: frozen }, final.message) : null;
  await event(final.event, final.message, {
    outcome: outcome.kind,
    ...(resultUrl ? { url: resultUrl } : {}),
    ...(handoff ? { handoff } : {}),
  });

  // Form changed, or a challenge appeared where the catalog promised none: pause the channel.
  const breakage = outcome.kind === "selector_missing" ||
    (outcome.kind === "challenge_detected" && !challengeExpected(row));
  if (breakage) {
    jlog.warn("directory marked broken", { outcome: outcome.kind });
    await repo.markDirectoryBroken(db, job.directory_id, "detail" in outcome ? outcome.detail : outcome.kind);
  }
  await repo.finishJob(db, job.job_id);
}

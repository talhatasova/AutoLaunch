import type { SubmissionJob, SubmissionOutcome } from "@directorylaunch/shared";
import { EventRecorder } from "../db/events";
import { Repository, toConsentGrant, toDirectory } from "../db/repository";
import { Tier1ApiDriver } from "../drivers/tier1-api";
import { Tier2FormDriver } from "../drivers/tier2-form";
import { Tier3ManualDriver } from "../drivers/tier3-manual";
import { buildManualHandoff } from "../drivers/tier3-manual";
import type { Driver, DriverReporter, SubmissionContext } from "../drivers/types";
import { classifyUnknownError } from "../errors";
import { log, describeError } from "../logger";
import { DomainRateLimiter } from "../net/rate-limit";
import { buildPayload, extractIdentity } from "../payload/build";
import { planOutcome } from "./outcome";

export interface ProcessDeps {
  repo: Repository;
  makeRecorder: (submissionId: string) => EventRecorder;
  limiter: DomainRateLimiter;
  drivers: { tier1: Driver; tier2: Driver; tier3: Driver };
  /** Re-enqueues the job after a backoff. Supplied by the pg-boss layer. */
  scheduleRetry: (job: SubmissionJob, delaySeconds: number) => Promise<void>;
  now?: () => Date;
}

/**
 * Runs one submission end to end.
 *
 * The shape is deliberately: load state -> assemble payload -> pick a driver -> plan the
 * outcome -> write events and status. Nothing decides policy here; policy lives in the
 * drivers (what we refuse to do) and in planOutcome (what an outcome means).
 *
 * Nothing is swallowed. If this function throws, the job fails visibly in pg-boss and the
 * error is logged with its stack; but it should not throw, because everything reachable is
 * classified into an outcome and written to submission_events first.
 */
export async function processSubmission(deps: ProcessDeps, job: SubmissionJob): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const recorder = deps.makeRecorder(job.submission_id);

  const submission = await deps.repo.loadSubmission(job.submission_id);
  const directoryRow = await deps.repo.loadDirectory(job.directory_id);
  const directory = toDirectory(directoryRow);

  await deps.repo.markRunning(job.submission_id, job.attempt);
  await recorder.record("started", `Starting submission to ${directory.name}.`, {
    directory_slug: directory.slug,
    tier: directory.tier,
    attempt: job.attempt,
  });

  // ---- Assemble the payload from the founder's own app row and auth identity.
  const app = await deps.repo.loadApp(job.app_id);
  const authUser = await deps.repo.loadAuthUser(app.user_id);

  const identity = extractIdentity(authUser);
  if (!identity.ok) {
    // Missing identity is needs_manual, never a fabricated persona and never a failure.
    await finishWithoutContext(deps, recorder, job, directory, identity.reason);
    return;
  }

  const built = buildPayload(app, identity.identity, directory.category);
  if (!built.ok) {
    await finishWithoutContext(deps, recorder, job, directory, built.reason);
    return;
  }

  const ctx: SubmissionContext = {
    submission_id: job.submission_id,
    directory,
    payload: built.payload,
    consent: toConsentGrant(submission, directory),
  };

  const driver = pickDriver(deps.drivers, directory.tier);
  const reporter = makeReporter(deps.repo, recorder, job.submission_id, now);

  let outcome: SubmissionOutcome;
  try {
    // Rate limiting is keyed on the directory host: we never hit the same site twice at
    // once, and consecutive requests are spaced. Tier 3 does no network I/O but goes
    // through the same path so the accounting stays honest.
    outcome = await deps.limiter.run(directory.submission_url, () => driver.run(ctx, reporter));
  } catch (e) {
    log.error("driver threw", {
      submission_id: job.submission_id,
      directory_slug: directory.slug,
      ...describeError(e),
    });
    outcome = classifyUnknownError(e);
  }

  const plan = planOutcome(outcome, ctx, job.attempt, now());

  for (const event of plan.events) {
    await recorder.record(event.kind, event.message, event.payload);
  }

  if (plan.markDirectoryBroken) {
    await deps.repo.markDirectoryBroken(directoryRow.id, plan.markDirectoryBroken.reason);
    log.warn("directory marked broken", {
      directory_slug: directory.slug,
      reason: plan.markDirectoryBroken.reason,
    });
  }

  await deps.repo.finalize(job.submission_id, {
    status: plan.status,
    error_message: plan.errorMessage,
    result_url: plan.resultUrl,
    attempt_count: job.attempt + 1,
    next_attempt_at:
      plan.retryInSeconds === null
        ? null
        : new Date(now().getTime() + plan.retryInSeconds * 1000).toISOString(),
  });

  if (plan.retryInSeconds !== null) {
    await deps.scheduleRetry({ ...job, attempt: job.attempt + 1 }, plan.retryInSeconds);
  }

  log.info("submission resolved", {
    submission_id: job.submission_id,
    directory_slug: directory.slug,
    status: plan.status,
    outcome: outcome.kind,
    dropped_events: recorder.dropped,
  });
}

/**
 * Resolves needs_manual before a full payload could be assembled.
 *
 * The handoff still carries whatever we do have, and the reason names the exact gap, so
 * the user gets an actionable instruction rather than "something went wrong".
 */
async function finishWithoutContext(
  deps: ProcessDeps,
  recorder: EventRecorder,
  job: SubmissionJob,
  directory: ReturnType<typeof toDirectory>,
  reason: string,
): Promise<void> {
  await recorder.record("manual_required", reason, {
    directory_slug: directory.slug,
    submission_url: directory.submission_url,
    reason: "incomplete_profile",
  });
  await deps.repo.finalize(job.submission_id, {
    status: "needs_manual",
    error_message: null,
    attempt_count: job.attempt + 1,
    next_attempt_at: null,
  });
  log.info("submission resolved", {
    submission_id: job.submission_id,
    directory_slug: directory.slug,
    status: "needs_manual",
    outcome: "manual_required",
  });
}

export function pickDriver(
  drivers: ProcessDeps["drivers"],
  tier: number,
): Driver {
  switch (tier) {
    case 1:
      return drivers.tier1;
    case 2:
      return drivers.tier2;
    default:
      // Anything we do not recognise is handled as manual. Defaulting to "try to automate"
      // would be the wrong direction to guess in.
      return drivers.tier3;
  }
}

function makeReporter(
  repo: Repository,
  recorder: EventRecorder,
  submissionId: string,
  now: () => Date,
): DriverReporter {
  return {
    async fieldFilled(selector: string, payloadKey: string) {
      await recorder.record("field_filled", `Filled ${payloadKey}.`, { selector, payloadKey });
    },
    async submitted(detail: string) {
      // submitted_at is set the moment we actually click, independently of whether the
      // success signal later confirms. If the signal turns out to be wrong, the record
      // still says truthfully that we submitted.
      await repo.markSubmittedAt(submissionId, now().toISOString());
      await recorder.record("submitted", detail, null);
    },
    async note(kind, message, payload) {
      await recorder.record(kind, message, payload ?? null);
    },
  };
}

export { Tier1ApiDriver, Tier2FormDriver, Tier3ManualDriver, buildManualHandoff };

import { submissionPayloadSchema } from "@directorylaunch/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { directoryRowSchema } from "../db/rows";
import { toDirectory } from "../db/repository";
import { Tier2FormDriver } from "../drivers/tier2-form";
import type { DriverReporter, SubmissionContext } from "../drivers/types";
import { classifyUnknownError } from "../errors";
import { PlaywrightPool } from "../net/browser";
import { DomainRateLimiter } from "../net/rate-limit";
import { finalOutcome, targetStillEligible } from "./approved";

type Job = { job_id: string; submission_id: string; app_id: string; directory_id: string };

export async function runApprovedJob(
  db: SupabaseClient, job: Job, pool: PlaywrightPool, limiter: DomainRateLimiter,
): Promise<void> {
  const [submissionResult, directoryResult] = await Promise.all([
    db.from("submissions").select("*").eq("id", job.submission_id).single(),
    db.from("directories").select("*").eq("id", job.directory_id).single(),
  ]);
  if (submissionResult.error || directoryResult.error || !submissionResult.data || !directoryResult.data) {
    throw new Error(`Claimed job ${job.job_id} has missing submission or directory`);
  }
  const submission = submissionResult.data;
  const row = directoryResult.data;
  const directory = toDirectory(directoryRowSchema.parse(row));
  let clicked = false;

  async function event(kind: string, message: string, payload: Record<string, unknown> | null = null) {
    const { error } = await db.from("submission_events").insert({
      submission_id: job.submission_id, kind, message, payload,
    });
    if (error) throw new Error(`Could not record ${kind}: ${error.message}`);
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

  let outcome;
  if (!targetStillEligible(row) || (row.obligation && !submission.obligation_confirmed_at)) {
    outcome = { kind: "permanent_error" as const, detail: "Directory certification expired or its requirement was not confirmed." };
  } else {
    try {
      const ctx: SubmissionContext = {
        submission_id: job.submission_id,
        directory,
        payload: submissionPayloadSchema.parse(submission.approved_payload),
        consent: submission.consent_granted_at
          ? { directory_slug: directory.slug, granted_at: submission.consent_granted_at }
          : null,
      };
      outcome = await limiter.run(directory.submission_url, () =>
        new Tier2FormDriver(() => pool.newPage()).run(ctx, reporter),
      );
    } catch (error) {
      outcome = classifyUnknownError(error);
    }
  }

  const final = finalOutcome(outcome, clicked);
  const { error: updateError } = await db.from("submissions").update({
    status: final.status,
    submitted_at: clicked ? new Date().toISOString() : null,
    receipt_evidence: outcome.kind === "succeeded" ? { observed_url: outcome.result_url } : null,
    error_message: outcome.kind === "succeeded" ? null : "detail" in outcome ? outcome.detail : final.message,
    attempt_count: submission.attempt_count + 1,
  }).eq("id", job.submission_id);
  if (updateError) throw new Error(`Could not finalize ${job.submission_id}: ${updateError.message}`);
  await event(final.event, final.message, { outcome: outcome.kind });
  if (outcome.kind === "selector_missing" || outcome.kind === "challenge_detected") {
    await db.from("directories").update({ status: "broken" }).eq("id", job.directory_id);
  }
  const { error: finishError } = await db.from("submission_jobs")
    .update({ finished_at: new Date().toISOString() }).eq("id", job.job_id);
  if (finishError) throw new Error(`Could not finish job ${job.job_id}: ${finishError.message}`);
}

import {
  MAX_ATTEMPTS,
  backoffSeconds,
  isRetryable,
  outcomeToStatus,
} from "@directorylaunch/shared";
import type { SubmissionOutcome, SubmissionStatus } from "@directorylaunch/shared";
import { buildManualHandoff } from "../drivers/tier3-manual";
import type { SubmissionContext } from "../drivers/types";
import { UNCONFIRMED_REASON } from "../drivers/success";

/**
 * Turns a driver outcome into the row status, the events the user sees, and a retry
 * decision. One place, so "what does this outcome mean" cannot drift between the dashboard
 * and the worker.
 *
 * Every branch writes at least one event. A transition with no event is a step that never
 * happened as far as the user is concerned, because submission_events is the only record
 * the dashboard has.
 */
export interface EventWrite {
  kind:
    | "succeeded"
    | "failed"
    | "manual_required"
    | "challenge_detected"
    | "selector_missing"
    | "retry_scheduled";
  message: string;
  payload: Record<string, unknown> | null;
}

export interface OutcomePlan {
  status: SubmissionStatus;
  events: EventWrite[];
  /** Non-null when the job should be re-enqueued after this many seconds. */
  retryInSeconds: number | null;
  /** Set when a selector no longer matches: the form changed under us. */
  markDirectoryBroken: { reason: string } | null;
  resultUrl: string | null;
  errorMessage: string | null;
}

/**
 * @param attempt zero-based index of the attempt that just ran.
 */
export function planOutcome(
  outcome: SubmissionOutcome,
  ctx: SubmissionContext,
  attempt: number,
  now: Date = new Date(),
): OutcomePlan {
  const base: OutcomePlan = {
    status: outcomeToStatus(outcome),
    events: [],
    retryInSeconds: null,
    markDirectoryBroken: null,
    resultUrl: null,
    errorMessage: null,
  };

  switch (outcome.kind) {
    case "succeeded":
      return {
        ...base,
        status: "succeeded",
        resultUrl: outcome.result_url,
        events: [
          {
            kind: "succeeded",
            message: `Submitted to ${ctx.directory.name}.`,
            payload: { result_url: outcome.result_url, directory_slug: ctx.directory.slug },
          },
        ],
      };

    case "challenge_detected": {
      // We saw a CAPTCHA or bot-detection challenge and STOPPED. Not a retry, not a solve,
      // not an evasion. Two events: the refusal, then the pre-filled handoff, because the
      // user needs to see both what happened and what to do about it.
      const handoff = buildManualHandoff(ctx, outcome.detail);
      return {
        ...base,
        status: "needs_manual",
        errorMessage: null,
        events: [
          {
            kind: "challenge_detected",
            message: outcome.detail,
            payload: {
              directory_slug: ctx.directory.slug,
              policy: "we do not solve, evade, or retry past challenges",
            },
          },
          {
            kind: "manual_required",
            message: `Your listing for ${ctx.directory.name} is assembled and ready to paste.`,
            payload: { handoff },
          },
        ],
      };
    }

    case "manual_required": {
      const unconfirmed = outcome.detail.startsWith(UNCONFIRMED_REASON);
      const handoff = buildManualHandoff(ctx, outcome.detail);
      return {
        ...base,
        status: "needs_manual",
        events: [
          {
            kind: "manual_required",
            message: outcome.detail,
            payload: {
              handoff,
              directory_slug: ctx.directory.slug,
              // The ambiguous case gets its own marker so the dashboard can say
              // "submitted, not confirmed" rather than implying either success or failure.
              ...(unconfirmed ? { reason: UNCONFIRMED_REASON, submitted: true } : {}),
            },
          },
        ],
      };
    }

    case "selector_missing":
      // The form changed. Retrying blindly against a form that no longer exists cannot
      // help, so the directory is marked broken and no other founder hits the same wall.
      return {
        ...base,
        status: "failed",
        errorMessage: `${outcome.selector}: ${outcome.detail}`,
        markDirectoryBroken: {
          reason: `Selector "${outcome.selector}" no longer matches (${outcome.detail}).`,
        },
        events: [
          {
            kind: "selector_missing",
            message:
              `${ctx.directory.name} changed its form - "${outcome.selector}" no longer ` +
              `matches. We have flagged the directory for re-verification rather than ` +
              `retrying into a form that no longer exists.`,
            payload: { selector: outcome.selector, detail: outcome.detail },
          },
          {
            kind: "failed",
            message: `Could not submit to ${ctx.directory.name}: the form has changed.`,
            payload: { directory_slug: ctx.directory.slug },
          },
        ],
      };

    case "transient_error": {
      const nextAttempt = attempt + 1;
      if (isRetryable(outcome) && nextAttempt < MAX_ATTEMPTS) {
        const delay = backoffSeconds(attempt);
        const at = new Date(now.getTime() + delay * 1000).toISOString();
        return {
          ...base,
          status: "queued",
          retryInSeconds: delay,
          errorMessage: outcome.detail,
          events: [
            {
              kind: "retry_scheduled",
              message:
                `${ctx.directory.name} had a temporary problem (${outcome.detail}). ` +
                `Retrying in ${delay}s - attempt ${nextAttempt + 1} of ${MAX_ATTEMPTS}.`,
              payload: { attempt: nextAttempt, next_attempt_at: at, delay_seconds: delay },
            },
          ],
        };
      }
      // Out of attempts. This is a real failure and is reported as one - never quietly
      // downgraded to needs_manual to make the dashboard look tidier.
      return {
        ...base,
        status: "failed",
        errorMessage: outcome.detail,
        events: [
          {
            kind: "failed",
            message:
              `Gave up on ${ctx.directory.name} after ${MAX_ATTEMPTS} attempts. ` +
              `Last error: ${outcome.detail}`,
            payload: { attempts: MAX_ATTEMPTS, detail: outcome.detail },
          },
        ],
      };
    }

    case "permanent_error":
      return {
        ...base,
        status: "failed",
        errorMessage: outcome.detail,
        events: [
          {
            kind: "failed",
            message: `Could not submit to ${ctx.directory.name}: ${outcome.detail}`,
            payload: { detail: outcome.detail, retryable: false },
          },
        ],
      };
  }
}

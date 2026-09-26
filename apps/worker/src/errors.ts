import type { SubmissionOutcome } from "@directorylaunch/shared";
import { describeError } from "./logger";

/**
 * Typed worker errors.
 *
 * Every one of these carries the SubmissionOutcome it should resolve to, so classification
 * happens where the failure is understood rather than in a catch block far away guessing
 * from a string. `classifyUnknownError` is the last resort and is deliberately
 * conservative: anything we cannot positively identify as transient becomes a PERMANENT
 * error, because a wrong "transient" guess means we hammer a third-party site.
 */
export abstract class WorkerError extends Error {
  abstract readonly outcome: SubmissionOutcome;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A selector in form_schema matched nothing: the form changed under us. */
export class SelectorMissingError extends WorkerError {
  constructor(
    public readonly selector: string,
    public readonly detail: string,
  ) {
    super(`Selector not found: ${selector} (${detail})`);
  }
  get outcome(): SubmissionOutcome {
    return { kind: "selector_missing", selector: this.selector, detail: this.detail };
  }
}

/**
 * A CAPTCHA or bot-detection challenge was present. We STOP. We do not solve it, call a
 * solving service, patch the browser to evade detection, or retry hoping to slip through.
 */
export class ChallengeDetectedError extends WorkerError {
  constructor(public readonly detail: string) {
    super(`Challenge detected, refusing to proceed: ${detail}`);
  }
  get outcome(): SubmissionOutcome {
    return { kind: "challenge_detected", detail: this.detail };
  }
}

/** Not a failure. The payload is assembled and the user does one click. */
export class ManualRequiredError extends WorkerError {
  constructor(public readonly detail: string) {
    super(detail);
  }
  get outcome(): SubmissionOutcome {
    return { kind: "manual_required", detail: this.detail };
  }
}

/** 5xx, timeouts, connection resets. The only class worth another attempt. */
export class TransientError extends WorkerError {
  constructor(public readonly detail: string) {
    super(detail);
  }
  get outcome(): SubmissionOutcome {
    return { kind: "transient_error", detail: this.detail };
  }
}

/** 4xx, malformed config, contract violations. Retrying cannot help. */
export class PermanentError extends WorkerError {
  constructor(public readonly detail: string) {
    super(detail);
  }
  get outcome(): SubmissionOutcome {
    return { kind: "permanent_error", detail: this.detail };
  }
}

/**
 * A honeypot field was found non-empty. This is a HARD STOP.
 *
 * A filled bot-trap gets the submission silently discarded while the page still looks like
 * success - the worst possible failure mode, because the user believes they launched when
 * they did not. We abort before submitting rather than send something we know is doomed.
 */
export class HoneypotViolationError extends WorkerError {
  constructor(
    public readonly selector: string,
    public readonly observed: string,
  ) {
    super(
      `Honeypot ${selector} is non-empty (${JSON.stringify(observed)}). Aborting before submit: ` +
        `a filled bot trap is silently discarded while looking like success.`,
    );
  }
  get outcome(): SubmissionOutcome {
    // Not transient and not the site's fault - our own fill logic touched a trap.
    return { kind: "permanent_error", detail: this.message };
  }
}

const TRANSIENT_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /EAI_AGAIN/,
  /ENOTFOUND/,
  /socket hang up/i,
  /network error/i,
  /net::ERR_(CONNECTION|NETWORK|NAME_NOT_RESOLVED|TIMED_OUT)/i,
  /Target (page|closed)/i,
  /browser has been closed/i,
];

export function isTransientMessage(message: string): boolean {
  return TRANSIENT_PATTERNS.some((p) => p.test(message));
}

/** HTTP status -> outcome. 429 and 5xx are worth waiting on; 4xx is not. */
export function outcomeForHttpStatus(status: number, detail: string): SubmissionOutcome {
  if (status === 429 || status >= 500) return { kind: "transient_error", detail };
  return { kind: "permanent_error", detail };
}

/**
 * Last resort classification. Never swallows: the caller always gets a concrete outcome
 * and the original message is preserved verbatim in `detail`.
 */
export function classifyUnknownError(e: unknown): SubmissionOutcome {
  if (e instanceof WorkerError) return e.outcome;
  const { name, message } = describeError(e);
  const detail = `${name}: ${message}`;
  if (isTransientMessage(message)) return { kind: "transient_error", detail };
  return { kind: "permanent_error", detail };
}

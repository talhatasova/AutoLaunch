import type { SubmissionEventKind } from "@directorylaunch/shared";
import type { ServiceClient } from "./client";
import { log } from "../logger";

/**
 * Writer for `submission_events` - the ONLY user-facing record of what happened.
 *
 * The dashboard renders this table over Realtime. There is no other log the user can see,
 * so an event we fail to write is a step that, for them, never happened. That makes event
 * writing a first-class operation rather than instrumentation.
 *
 * Failure policy, and it is deliberately not "log and move on":
 *   - Terminal events (the ones that explain the final status) are CRITICAL. If we cannot
 *     write one, we throw. A submission whose outcome was never recorded must not be
 *     reported as finished.
 *   - Progress events retry, and if they still fail we count the drop and attach the count
 *     to the terminal event, so the timeline says "3 steps could not be recorded" instead
 *     of quietly having a hole in it.
 */
const CRITICAL_KINDS: readonly SubmissionEventKind[] = [
  "succeeded",
  "failed",
  "manual_required",
  "challenge_detected",
  "selector_missing",
  "retry_scheduled",
];

export class EventRecorder {
  private droppedEvents = 0;

  constructor(
    private readonly db: ServiceClient,
    private readonly submissionId: string,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  get dropped(): number {
    return this.droppedEvents;
  }

  async record(
    kind: SubmissionEventKind,
    message: string,
    payload: Record<string, unknown> | null = null,
  ): Promise<void> {
    const isCritical = CRITICAL_KINDS.includes(kind);
    const body = {
      submission_id: this.submissionId,
      kind,
      message,
      payload:
        this.droppedEvents > 0 && isCritical
          ? { ...(payload ?? {}), dropped_events: this.droppedEvents }
          : payload,
    };

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await this.db.from("submission_events").insert(body);
      if (!error) return;
      lastError = error;
      log.warn("submission_events insert failed", {
        submission_id: this.submissionId,
        kind,
        attempt,
        error: error.message,
      });
      if (attempt < 2) await this.sleep(200 * (attempt + 1));
    }

    if (isCritical) {
      // Loud. A terminal state the user cannot see is worse than a crashed job.
      throw new Error(
        `Could not write the terminal "${kind}" event for submission ${this.submissionId}: ` +
          `${lastError instanceof Error ? lastError.message : String(lastError)}`,
      );
    }

    this.droppedEvents += 1;
    log.error("dropped a progress event; it will be reported on the terminal event", {
      submission_id: this.submissionId,
      kind,
      dropped_total: this.droppedEvents,
    });
  }
}

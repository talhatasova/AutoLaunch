import type { SubmissionOutcome } from "@directorylaunch/shared";

export type CertifiedTarget = {
  status: string;
  automation?: string;
  automation_verified_at?: string | Date | null;
  last_verified_at?: string | Date | null;
};

/** Contract eligibility: automated, active, certified, and rechecked within seven days. */
export function targetStillEligible(target: CertifiedTarget, now = Date.now()): boolean {
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  return target.automation === "automated" && target.status === "active" &&
    !!target.automation_verified_at &&
    !!target.last_verified_at && new Date(target.last_verified_at).getTime() >= sevenDaysAgo;
}

export type FinalStatus = "pending_review" | "live" | "unconfirmed" | "needs_manual" | "failed";

/**
 * Maps a driver outcome to the row status and its terminal event. Order matters: once a
 * send may have happened, nothing but a receipt clears it, so the job is never retried.
 */
export function finalOutcome(outcome: SubmissionOutcome, clicked: boolean, publicOnAccept = false): {
  status: FinalStatus;
  event: "receipt" | "live" | "unconfirmed" | "challenge_detected" | "manual_required" | "failed";
  message: string;
} {
  if (outcome.kind === "succeeded") {
    return publicOnAccept
      ? { status: "live", event: "live", message: "Posted publicly. The post is live now." }
      : { status: "pending_review", event: "receipt", message: "The directory returned a submission receipt. Publication is pending." };
  }
  if (clicked) {
    return { status: "unconfirmed", event: "unconfirmed", message: "The form may have been sent, but no reliable receipt was found. Investigate before retrying." };
  }
  if (outcome.kind === "challenge_detected") {
    return { status: "needs_manual", event: "challenge_detected", message: `${outcome.detail} Your listing is assembled and ready to paste.` };
  }
  if (outcome.kind === "manual_required") {
    return { status: "needs_manual", event: "manual_required", message: outcome.detail };
  }
  return { status: "failed", event: "failed", message: "The directory could not be submitted before sending. Review the reason before retrying." };
}

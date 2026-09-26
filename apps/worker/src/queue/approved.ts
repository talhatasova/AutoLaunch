import type { SubmissionOutcome } from "@directorylaunch/shared";

export type CertifiedTarget = {
  status: string;
  tier: number;
  price_kind: string;
  requires_captcha: boolean;
  receipt_verified: boolean;
  rules_permit_automation: boolean;
  automation_verified_at: string | null;
  last_verified_at: string | null;
};

export function targetStillEligible(target: CertifiedTarget, now = Date.now()): boolean {
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  return target.status === "active" && target.tier === 2 && target.price_kind === "free" &&
    !target.requires_captcha && target.receipt_verified && target.rules_permit_automation &&
    target.automation_verified_at !== null &&
    target.last_verified_at !== null && Date.parse(target.last_verified_at) >= sevenDaysAgo;
}

export function finalOutcome(outcome: SubmissionOutcome, clicked: boolean): {
  status: "pending_review" | "unconfirmed" | "failed";
  event: "receipt" | "unconfirmed" | "failed";
  message: string;
} {
  if (outcome.kind === "succeeded") {
    return { status: "pending_review", event: "receipt", message: "The directory returned a submission receipt. Publication is pending." };
  }
  if (clicked) {
    return { status: "unconfirmed", event: "unconfirmed", message: "The form may have been sent, but no reliable receipt was found. Investigate before retrying." };
  }
  return { status: "failed", event: "failed", message: "The directory could not be submitted before sending. Review the reason before retrying." };
}

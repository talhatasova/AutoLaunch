import type { SuccessSignal } from "./form-schema";

export interface PostSubmitObservation {
  url: string;
  visibleText: string;
  /** Resolved presence of the success selector, when the signal is selector_present. */
  selectorPresent: boolean;
}

/**
 * `confirmed`  - the directory told us it worked.
 * `unconfirmed`- we clicked submit and the page did not show the signal we expected.
 *
 * `unconfirmed` is an EXPLICIT third outcome, never collapsed into either success or
 * failure. It exists because a `success_signal` can be wrong: startup-collections'
 * `text_present: "Thank you"` was never verified against a real submission - research
 * could not confirm it without submitting live data - so the first real run may well land
 * here even though the submission went through.
 *
 * Reporting that as success would tell a founder they launched when they may not have.
 * Reporting it as failure would invite a duplicate submission. So we say exactly what
 * happened: submitted, not confirmed, please check.
 */
export type SuccessEvaluation =
  | { kind: "confirmed"; evidence: string }
  | { kind: "unconfirmed"; expected: string; observedUrl: string };

export function describeSignal(signal: SuccessSignal): string {
  switch (signal.kind) {
    case "url_contains":
      return `URL containing "${signal.value}"`;
    case "selector_present":
      return `element matching "${signal.value}"`;
    case "text_present":
      return `text "${signal.value}"`;
  }
}

export function evaluateSuccessSignal(
  signal: SuccessSignal,
  obs: PostSubmitObservation,
): SuccessEvaluation {
  switch (signal.kind) {
    case "url_contains":
      return obs.url.includes(signal.value)
        ? { kind: "confirmed", evidence: `url "${obs.url}" contains "${signal.value}"` }
        : { kind: "unconfirmed", expected: describeSignal(signal), observedUrl: obs.url };
    case "selector_present":
      return obs.selectorPresent
        ? { kind: "confirmed", evidence: `selector "${signal.value}" present after submit` }
        : { kind: "unconfirmed", expected: describeSignal(signal), observedUrl: obs.url };
    case "text_present":
      // Case-insensitive: directories capitalise confirmation copy inconsistently, and a
      // case mismatch would produce a false `unconfirmed` on a submission that worked.
      return obs.visibleText.toLowerCase().includes(signal.value.toLowerCase())
        ? { kind: "confirmed", evidence: `page text contains "${signal.value}"` }
        : { kind: "unconfirmed", expected: describeSignal(signal), observedUrl: obs.url };
  }
}

/** Marker the dashboard can key off to render "submitted, awaiting confirmation". */
export const UNCONFIRMED_REASON = "success_signal_unconfirmed" as const;

export function unconfirmedDetail(evalResult: {
  expected: string;
  observedUrl: string;
}): string {
  return (
    `Submitted, but could not confirm it landed: expected ${evalResult.expected} and did ` +
    `not find it (ended on ${evalResult.observedUrl || "the same page"}). The submission ` +
    `may well have gone through - check the directory before submitting again so you do ` +
    `not create a duplicate.`
  );
}

import { describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS,
  backoffSeconds,
  isRetryable,
  outcomeToStatus,
} from "@directorylaunch/shared";
import type { SubmissionOutcome } from "@directorylaunch/shared";
import { planOutcome } from "../queue/outcome";
import { UNCONFIRMED_REASON } from "../drivers/success";
import { loadSeedDirectory, makeContext } from "./fake-page";

const ctx = makeContext(loadSeedDirectory("the-startup-project"));
const NOW = new Date("2026-08-24T12:00:00.000Z");

describe("outcome -> status mapping", () => {
  it("treats a refused challenge as needs_manual, never as failure", () => {
    expect(outcomeToStatus({ kind: "challenge_detected", detail: "turnstile" })).toBe(
      "needs_manual",
    );
  });

  it("maps every outcome kind exactly once", () => {
    const cases: Array<[SubmissionOutcome, string]> = [
      [{ kind: "succeeded", result_url: null }, "succeeded"],
      [{ kind: "challenge_detected", detail: "x" }, "needs_manual"],
      [{ kind: "manual_required", detail: "x" }, "needs_manual"],
      [{ kind: "selector_missing", selector: "#a", detail: "x" }, "failed"],
      [{ kind: "permanent_error", detail: "x" }, "failed"],
      [{ kind: "transient_error", detail: "x" }, "queued"],
    ];
    for (const [outcome, expected] of cases) {
      expect(outcomeToStatus(outcome)).toBe(expected);
    }
  });

  it("retries ONLY transient errors", () => {
    expect(isRetryable({ kind: "transient_error", detail: "503" })).toBe(true);
    for (const o of [
      { kind: "challenge_detected", detail: "x" },
      { kind: "manual_required", detail: "x" },
      { kind: "selector_missing", selector: "#a", detail: "x" },
      { kind: "permanent_error", detail: "x" },
      { kind: "succeeded", result_url: null },
    ] as SubmissionOutcome[]) {
      expect(isRetryable(o)).toBe(false);
    }
  });
});

describe("backoffSeconds", () => {
  it("grows exponentially and is always jittered downward from the base", () => {
    for (const attempt of [0, 1, 2, 3, 4]) {
      const base = Math.min(60 * 2 ** attempt, 900);
      for (let i = 0; i < 200; i++) {
        const s = backoffSeconds(attempt);
        expect(s).toBeGreaterThanOrEqual(Math.round(base * 0.5));
        expect(s).toBeLessThanOrEqual(base);
      }
    }
  });

  it("caps so a retry never parks a job for longer than 15 minutes", () => {
    for (let i = 0; i < 200; i++) expect(backoffSeconds(20)).toBeLessThanOrEqual(900);
  });

  it("actually jitters - two calls are not reliably identical", () => {
    const values = new Set(Array.from({ length: 50 }, () => backoffSeconds(3)));
    // Without jitter this collapses to a single value and a fleet of workers would
    // stampede a recovering site in lockstep.
    expect(values.size).toBeGreaterThan(1);
  });
});

describe("planOutcome", () => {
  it("writes a succeeded event and records the result URL", () => {
    const plan = planOutcome(
      { kind: "succeeded", result_url: "https://startupproject.org/s/acme" },
      ctx,
      0,
      NOW,
    );
    expect(plan.status).toBe("succeeded");
    expect(plan.resultUrl).toBe("https://startupproject.org/s/acme");
    expect(plan.events.map((e) => e.kind)).toEqual(["succeeded"]);
  });

  it("emits BOTH a challenge_detected event and a pre-filled handoff", () => {
    const plan = planOutcome({ kind: "challenge_detected", detail: "Turnstile" }, ctx, 0, NOW);
    expect(plan.status).toBe("needs_manual");
    expect(plan.events.map((e) => e.kind)).toEqual(["challenge_detected", "manual_required"]);
    expect(plan.retryInSeconds).toBeNull(); // never retried in the hope of slipping through
    const handoff = plan.events[1]!.payload!.handoff as Record<string, unknown>;
    expect(handoff).toBeTruthy();
    // needs_manual is a success state precisely because the payload comes with it.
    expect((handoff.listing as Record<string, unknown>).title).toBe("Acme Analytics");
    expect((handoff.contact as Record<string, unknown>).contact_email).toBe("dana@acme.example");
  });

  it("marks the directory broken on a selector miss and does not retry", () => {
    const plan = planOutcome(
      { kind: "selector_missing", selector: "#companyName", detail: "not found" },
      ctx,
      0,
      NOW,
    );
    expect(plan.status).toBe("failed");
    expect(plan.retryInSeconds).toBeNull();
    expect(plan.markDirectoryBroken?.reason).toContain("#companyName");
    expect(plan.events.map((e) => e.kind)).toEqual(["selector_missing", "failed"]);
    expect(plan.errorMessage).toContain("#companyName");
  });

  it("schedules a retry for a transient error while attempts remain", () => {
    const plan = planOutcome({ kind: "transient_error", detail: "HTTP 503" }, ctx, 0, NOW);
    expect(plan.status).toBe("queued");
    expect(plan.retryInSeconds).toBeGreaterThan(0);
    expect(plan.events.map((e) => e.kind)).toEqual(["retry_scheduled"]);
  });

  it("fails loudly once attempts are exhausted rather than dressing it up", () => {
    const plan = planOutcome(
      { kind: "transient_error", detail: "HTTP 503" },
      ctx,
      MAX_ATTEMPTS - 1,
      NOW,
    );
    expect(plan.status).toBe("failed");
    expect(plan.retryInSeconds).toBeNull();
    expect(plan.events[0]!.kind).toBe("failed");
    expect(plan.events[0]!.message).toContain("Gave up");
  });

  it("flags the ambiguous submitted-but-unconfirmed case distinctly", () => {
    const plan = planOutcome(
      { kind: "manual_required", detail: `${UNCONFIRMED_REASON}: could not confirm` },
      ctx,
      0,
      NOW,
    );
    expect(plan.status).toBe("needs_manual");
    expect(plan.events[0]!.payload).toMatchObject({
      reason: UNCONFIRMED_REASON,
      submitted: true,
    });
  });

  it("does not mark submitted for an ordinary manual handoff", () => {
    const plan = planOutcome({ kind: "manual_required", detail: "Tier 3" }, ctx, 0, NOW);
    expect(plan.events[0]!.payload).not.toHaveProperty("submitted");
  });

  it("never produces a state transition without an event", () => {
    const outcomes: SubmissionOutcome[] = [
      { kind: "succeeded", result_url: null },
      { kind: "challenge_detected", detail: "x" },
      { kind: "manual_required", detail: "x" },
      { kind: "selector_missing", selector: "#a", detail: "x" },
      { kind: "transient_error", detail: "x" },
      { kind: "permanent_error", detail: "x" },
    ];
    // The dashboard is driven entirely off submission_events. A transition with no event
    // is a step the user never sees.
    for (const o of outcomes) {
      expect(planOutcome(o, ctx, 0, NOW).events.length).toBeGreaterThan(0);
    }
  });
});

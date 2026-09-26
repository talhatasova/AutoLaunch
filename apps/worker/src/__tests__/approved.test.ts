import { describe, expect, it } from "vitest";
import { finalOutcome, targetStillEligible } from "../queue/approved";

describe("approved submission boundary", () => {
  it("stops stale targets and never treats a receipt as live", () => {
    const now = Date.now();
    const target = {
      status: "active", tier: 2, price_kind: "free", requires_captcha: false,
      receipt_verified: true, rules_permit_automation: true,
      automation_verified_at: new Date(now).toISOString(), last_verified_at: new Date(now).toISOString(),
    };
    expect(targetStillEligible(target, now)).toBe(true);
    expect(targetStillEligible({ ...target, last_verified_at: new Date(now - 8 * 86400000).toISOString() }, now)).toBe(false);
    expect(finalOutcome({ kind: "succeeded", result_url: "https://example.test/receipt" }, true).status).toBe("pending_review");
    expect(finalOutcome({ kind: "transient_error", detail: "timeout" }, true).status).toBe("unconfirmed");
    expect(finalOutcome({ kind: "selector_missing", selector: "#submit", detail: "missing" }, false).status).toBe("failed");
  });
});

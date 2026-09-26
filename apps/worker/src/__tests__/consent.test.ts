import { describe, expect, it } from "vitest";
import { consentDecision } from "../drivers/consent";
import { Tier3ManualDriver, buildManualHandoff } from "../drivers/tier3-manual";
import { DomainRateLimiter } from "../net/rate-limit";
import { extractIdentity } from "../payload/build";
import { loadSeedDirectory, makeContext, recordingReporter } from "./fake-page";

const GRANT = { directory_slug: "the-startup-project", granted_at: "2026-08-24T12:00:00Z" };
const consentControl = [
  { selector: "#consent", type: "checkbox" as const, source: "consent" as const, required: true },
];

describe("consentDecision", () => {
  it("permits a tick only with an explicit grant for THAT directory", () => {
    const d = consentDecision(
      { slug: "the-startup-project", requires_consent: true },
      { extra_fields: consentControl },
      GRANT,
    );
    expect(d).toEqual({ ok: true, required: true });
  });

  it("refuses when no consent was recorded", () => {
    const d = consentDecision(
      { slug: "the-startup-project", requires_consent: true },
      { extra_fields: consentControl },
      null,
    );
    expect(d.ok).toBe(false);
    expect(!d.ok && d.reason).toMatch(/will not accept terms on your behalf/i);
  });

  it("refuses a grant belonging to a different directory", () => {
    const d = consentDecision(
      { slug: "the-startup-project", requires_consent: true },
      { extra_fields: consentControl },
      { directory_slug: "some-other-site", granted_at: "2026-08-24T12:00:00Z" },
    );
    expect(d.ok).toBe(false);
    expect(!d.ok && d.reason).toMatch(/never carried across/i);
  });

  it("treats a consent control in extra_fields as requiring consent even if the flag is false", () => {
    // The flag can drift; the control is the ground truth. The fallback is always the
    // cautious direction.
    const d = consentDecision(
      { slug: "the-startup-project", requires_consent: false },
      { extra_fields: consentControl },
      null,
    );
    expect(d.ok).toBe(false);
  });

  it("refuses when consent is required but there is no control to express it", () => {
    const d = consentDecision(
      { slug: "somewhere", requires_consent: true },
      { extra_fields: [] },
      GRANT,
    );
    expect(d.ok).toBe(false);
    expect(!d.ok && d.reason).toMatch(/nothing we could legitimately tick/i);
  });

  it("is a no-op for a directory with no terms box", () => {
    expect(
      consentDecision({ slug: "startup-collections", requires_consent: false }, { extra_fields: [] }, null),
    ).toEqual({ ok: true, required: false });
  });
});

describe("Tier 3 handoff", () => {
  it("resolves needs_manual with the payload assembled, without opening a browser", async () => {
    const ph = loadSeedDirectory("product-hunt");
    const outcome = await new Tier3ManualDriver().run(makeContext(ph), recordingReporter());
    expect(outcome.kind).toBe("manual_required");
    expect(outcome.kind === "manual_required" && outcome.detail).toMatch(/never solve or evade/i);
    expect(outcome.kind === "manual_required" && outcome.detail).toContain(ph.submission_url);
  });

  it("carries the founder's real identity and never a generated one", () => {
    const handoff = buildManualHandoff(makeContext(loadSeedDirectory("betalist")), "manual review");
    expect(handoff.contact).toEqual({
      founder_name: "Dana Okafor",
      contact_email: "dana@acme.example",
    });
    expect(handoff.listing.title).toBe("Acme Analytics");
    expect(handoff.directory.submission_url).toMatch(/^https:\/\//);
  });
});

describe("identity extraction", () => {
  it("uses the authenticated user's own email and name", () => {
    const r = extractIdentity({
      email: "dana@acme.example",
      user_metadata: { full_name: "Dana Okafor" },
    });
    expect(r.ok && r.identity.email).toBe("dana@acme.example");
    expect(r.ok && r.identity.founder_name).toBe("Dana Okafor");
  });

  it("asks rather than inventing a name when the profile has none", () => {
    const r = extractIdentity({ email: "dana@acme.example", user_metadata: {} });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/will not make up a name/i);
  });

  it("asks rather than substituting an address when the account has no email", () => {
    const r = extractIdentity({ email: null, user_metadata: { full_name: "Dana" } });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/will not submit under an address you did not give us/i);
  });
});

describe("DomainRateLimiter", () => {
  it("serialises requests to the same host", async () => {
    const limiter = new DomainRateLimiter(0);
    const order: string[] = [];
    const task = (id: string) => async () => {
      order.push(`start:${id}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end:${id}`);
    };
    await Promise.all([
      limiter.run("https://a.test/x", task("1")),
      limiter.run("https://a.test/y", task("2")),
    ]);
    expect(order).toEqual(["start:1", "end:1", "start:2", "end:2"]);
  });

  it("allows different hosts to proceed in parallel", async () => {
    const limiter = new DomainRateLimiter(0);
    const order: string[] = [];
    await Promise.all([
      limiter.run("https://a.test/x", async () => {
        order.push("a-start");
        await new Promise((r) => setTimeout(r, 10));
        order.push("a-end");
      }),
      limiter.run("https://b.test/x", async () => {
        order.push("b-start");
      }),
    ]);
    expect(order.slice(0, 2)).toEqual(["a-start", "b-start"]);
  });

  it("spaces consecutive requests to one host by the configured interval", async () => {
    const waits: number[] = [];
    let clock = 0;
    const limiter = new DomainRateLimiter(
      5_000,
      async (ms) => {
        waits.push(ms);
        clock += ms;
      },
      () => clock,
    );
    await limiter.run("https://a.test/1", async () => undefined);
    await limiter.run("https://a.test/2", async () => undefined);
    expect(waits).toEqual([5_000]);
  });

  it("releases the slot even when the task throws", async () => {
    const limiter = new DomainRateLimiter(0);
    await expect(
      limiter.run("https://a.test/x", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // A poisoned chain would deadlock every later submission to this host.
    await expect(limiter.run("https://a.test/y", async () => "ok")).resolves.toBe("ok");
  });
});

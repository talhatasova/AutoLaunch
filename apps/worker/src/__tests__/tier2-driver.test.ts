import { describe, expect, it } from "vitest";
import { Tier2FormDriver } from "../drivers/tier2-form";
import { UNCONFIRMED_REASON } from "../drivers/success";
import type { FormSchema } from "../drivers/form-schema";
import {
  FakePage,
  loadSeedDirectory,
  makeContext,
  recordingReporter,
  samplePayload,
} from "./fake-page";
import type { FakeControl, FakePageSpec } from "./fake-page";

/**
 * The generic driver, exercised against the REAL seed rows for the two Tier 2 directories.
 *
 * Nothing here is directory-specific: the same driver object is handed two different
 * form_schemas and behaves correctly for both. That is the whole design constraint - a new
 * directory is a seed-file row, never a code change.
 */
const STARTUP_PROJECT = loadSeedDirectory("the-startup-project");
const STARTUP_COLLECTIONS = loadSeedDirectory("startup-collections");

function controlsFor(schema: FormSchema, extra: string[] = []): Record<string, FakeControl> {
  const controls: Record<string, FakeControl> = {};
  for (const f of schema.fields) controls[f.selector] = { value: "" };
  for (const f of schema.extra_fields) {
    controls[f.selector] = f.type === "checkbox" ? { checked: false, value: "" } : { value: "" };
  }
  controls[schema.submit_selector] = {};
  for (const h of schema.honeypots) controls[h] = { value: "" };
  for (const s of extra) controls[s] = { value: "" };
  return controls;
}

function driverFor(spec: FakePageSpec): { driver: Tier2FormDriver; page: FakePage } {
  const page = new FakePage(spec);
  return { driver: new Tier2FormDriver(async () => page, 0), page };
}

describe("Tier2FormDriver - the-startup-project (consent + honeypot)", () => {
  const schema = STARTUP_PROJECT.form_schema!;

  it("submits successfully when consent was explicitly granted", async () => {
    const { driver, page } = driverFor({
      url: STARTUP_PROJECT.submission_url,
      controls: controlsFor(schema),
      textAfterSubmit: "Your startup has been submitted! We'll review it shortly.",
    });

    const outcome = await driver.run(
      makeContext(STARTUP_PROJECT, {
        consent: { directory_slug: "the-startup-project", granted_at: "2026-08-24T12:00:00Z" },
      }),
      recordingReporter(),
    );

    expect(outcome.kind).toBe("succeeded");
    // The consent box was ticked, and only because a grant existed for THIS directory.
    expect(page.checked).toContainEqual({ selector: "#consent", value: true });
    // The founder's real name, from their profile.
    expect(page.filled).toContainEqual({ selector: "#founderName", value: "Dana Okafor" });
    expect(page.filled).toContainEqual({ selector: "#email", value: "dana@acme.example" });
  });

  it("refuses to tick the terms box when no consent was recorded", async () => {
    const { driver, page } = driverFor({
      url: STARTUP_PROJECT.submission_url,
      controls: controlsFor(schema),
      textAfterSubmit: "Your startup has been submitted!",
    });

    const outcome = await driver.run(
      makeContext(STARTUP_PROJECT, { consent: null }),
      recordingReporter(),
    );

    expect(outcome.kind).toBe("manual_required");
    expect(outcome.kind === "manual_required" && outcome.detail).toMatch(
      /will not accept terms on your behalf/i,
    );
    // Nothing was ticked, nothing was typed, and the form was never even opened.
    expect(page.checked).toHaveLength(0);
    expect(page.clicks).toHaveLength(0);
  });

  it("refuses consent granted for a DIFFERENT directory", async () => {
    const { driver } = driverFor({
      url: STARTUP_PROJECT.submission_url,
      controls: controlsFor(schema),
    });
    const outcome = await driver.run(
      makeContext(STARTUP_PROJECT, {
        consent: { directory_slug: "startup-collections", granted_at: "2026-08-24T12:00:00Z" },
      }),
      recordingReporter(),
    );
    expect(outcome.kind).toBe("manual_required");
    expect(outcome.kind === "manual_required" && outcome.detail).toMatch(/per-directory/i);
  });

  it("leaves the fax_number honeypot untouched on a successful run", async () => {
    const controls = controlsFor(schema);
    const { driver, page } = driverFor({
      url: STARTUP_PROJECT.submission_url,
      controls,
      textAfterSubmit: "Your startup has been submitted!",
    });

    const outcome = await driver.run(
      makeContext(STARTUP_PROJECT, {
        consent: { directory_slug: "the-startup-project", granted_at: "2026-08-24T12:00:00Z" },
      }),
      recordingReporter(),
    );

    expect(outcome.kind).toBe("succeeded");
    const honeypot = schema.honeypots[0]!;
    expect(honeypot).toBe('input[name="fax_number"]');
    // The assertion that matters: the bot trap is still empty after a full fill+submit.
    expect(await page.readValue(honeypot)).toBe("");
    expect(page.filled.map((f) => f.selector)).not.toContain(honeypot);
  });

  it("aborts BEFORE submitting if a honeypot somehow carries a value", async () => {
    // A filled honeypot means the submission is silently discarded while the page still
    // looks like success - the worst failure mode, because the founder believes they
    // launched. We refuse to send it.
    const controls = controlsFor(schema);
    controls['input[name="fax_number"]'] = { value: "555-0100" };

    const { driver, page } = driverFor({
      url: STARTUP_PROJECT.submission_url,
      controls,
      textAfterSubmit: "Your startup has been submitted!",
    });

    const outcome = await driver.run(
      makeContext(STARTUP_PROJECT, {
        consent: { directory_slug: "the-startup-project", granted_at: "2026-08-24T12:00:00Z" },
      }),
      recordingReporter(),
    );

    expect(outcome.kind).toBe("permanent_error");
    expect(outcome.kind === "permanent_error" && outcome.detail).toMatch(/honeypot/i);
    expect(page.clicks).toHaveLength(0);
  });

  it("marks the form changed when a required selector is gone", async () => {
    const controls = controlsFor(schema);
    delete controls["#companyName"];

    const { driver, page } = driverFor({
      url: STARTUP_PROJECT.submission_url,
      controls,
      textAfterSubmit: "Your startup has been submitted!",
    });

    const outcome = await driver.run(
      makeContext(STARTUP_PROJECT, {
        consent: { directory_slug: "the-startup-project", granted_at: "2026-08-24T12:00:00Z" },
      }),
      recordingReporter(),
    );

    expect(outcome.kind).toBe("selector_missing");
    expect(outcome.kind === "selector_missing" && outcome.selector).toBe("#companyName");
    // Nothing typed into a form whose shape we no longer recognise.
    expect(page.filled).toHaveLength(0);
    expect(page.clicks).toHaveLength(0);
  });

  it("stops on a challenge injected client-side, without filling anything", async () => {
    const { driver, page } = driverFor({
      url: STARTUP_PROJECT.submission_url,
      controls: controlsFor(schema),
      snapshots: [
        {
          html: `<form><div class="cf-turnstile"></div></form>`,
          scriptSrcs: ["https://challenges.cloudflare.com/turnstile/v0/api.js"],
          windowKeys: ["turnstile"],
        },
      ],
    });

    const outcome = await driver.run(
      makeContext(STARTUP_PROJECT, {
        consent: { directory_slug: "the-startup-project", granted_at: "2026-08-24T12:00:00Z" },
      }),
      recordingReporter(),
    );

    expect(outcome.kind).toBe("challenge_detected");
    expect(page.filled).toHaveLength(0);
    expect(page.clicks).toHaveLength(0);
    expect(page.closed).toBe(true);
  });

  it("stops on a challenge that only appears AFTER the form is filled", async () => {
    const { driver, page } = driverFor({
      url: STARTUP_PROJECT.submission_url,
      controls: controlsFor(schema),
      snapshots: [
        {}, // clean at load
        { html: `<div class="g-recaptcha"></div>`, windowKeys: ["grecaptcha"] }, // mounted on interaction
      ],
    });

    const outcome = await driver.run(
      makeContext(STARTUP_PROJECT, {
        consent: { directory_slug: "the-startup-project", granted_at: "2026-08-24T12:00:00Z" },
      }),
      recordingReporter(),
    );

    expect(outcome.kind).toBe("challenge_detected");
    expect(outcome.kind === "challenge_detected" && outcome.detail).toMatch(/after the form was filled/i);
    expect(page.clicks).toHaveLength(0); // never submitted
  });
});

describe("Tier2FormDriver - startup-collections (unverified success signal)", () => {
  const schema = STARTUP_COLLECTIONS.form_schema!;

  it("needs no consent and submits with the founder's real name", async () => {
    const { driver, page } = driverFor({
      url: STARTUP_COLLECTIONS.submission_url,
      controls: controlsFor(schema),
      textAfterSubmit: "Thank you for your submission.",
    });

    const outcome = await driver.run(makeContext(STARTUP_COLLECTIONS), recordingReporter());

    expect(outcome.kind).toBe("succeeded");
    expect(page.filled).toContainEqual({
      selector: 'form.loader input[name="submitter_name"]',
      value: "Dana Okafor",
    });
  });

  it('matches "Thank you" case-insensitively', async () => {
    const { driver } = driverFor({
      url: STARTUP_COLLECTIONS.submission_url,
      controls: controlsFor(schema),
      textAfterSubmit: "THANK YOU! We got it.",
    });
    const outcome = await driver.run(makeContext(STARTUP_COLLECTIONS), recordingReporter());
    expect(outcome.kind).toBe("succeeded");
  });

  it("reports submitted-but-unconfirmed when the success signal does not match", async () => {
    // startup-collections' success_signal is UNVERIFIED - research could not confirm it
    // without submitting real data. So a miss must be an explicit third outcome: not
    // silent success (which would tell a founder they launched when they may not have) and
    // not silent failure (which would invite a duplicate submission).
    const { driver, page } = driverFor({
      url: STARTUP_COLLECTIONS.submission_url,
      controls: controlsFor(schema),
      textAfterSubmit: "Submission received, pending review.",
    });

    const outcome = await driver.run(makeContext(STARTUP_COLLECTIONS), recordingReporter());

    expect(page.clicks).toEqual(['form.loader button[type="submit"]']);
    expect(outcome.kind).toBe("manual_required");
    const detail = outcome.kind === "manual_required" ? outcome.detail : "";
    expect(detail).toContain(UNCONFIRMED_REASON);
    expect(detail).toMatch(/may well have gone through/i);
    expect(detail).toMatch(/duplicate/i);
  });
});

describe("Tier2FormDriver - generic behaviour", () => {
  it("gates on unmet company-profile requirements as needs_manual, not failure", async () => {
    // softwaresuggest's class: free, un-CAPTCHA'd, but asks for headcount and competitors.
    const promoted = {
      ...STARTUP_COLLECTIONS,
      requires_profile_fields: ["phone", "employee_count"] as string[],
    };
    const { driver, page } = driverFor({
      url: promoted.submission_url,
      controls: controlsFor(promoted.form_schema!),
      textAfterSubmit: "Thank you",
    });

    const outcome = await driver.run(
      makeContext(promoted as typeof STARTUP_COLLECTIONS),
      recordingReporter(),
    );

    expect(outcome.kind).toBe("manual_required");
    expect(outcome.kind === "manual_required" && outcome.detail).toMatch(/phone, employee_count/);
    expect(page.filled).toHaveLength(0);
  });

  it("proceeds once the founder has completed the required profile fields", async () => {
    const promoted = {
      ...STARTUP_COLLECTIONS,
      requires_profile_fields: ["phone", "employee_count"] as string[],
    };
    const { driver } = driverFor({
      url: promoted.submission_url,
      controls: controlsFor(promoted.form_schema!),
      textAfterSubmit: "Thank you",
    });

    const outcome = await driver.run(
      makeContext(promoted as typeof STARTUP_COLLECTIONS, {
        payload: samplePayload({
          company_profile: {
            phone: "+1 555 0100",
            employee_count: "2-10",
            customer_count: null,
            competitors: [],
            founded_year: null,
          },
        }),
      }),
      recordingReporter(),
    );

    expect(outcome.kind).toBe("succeeded");
  });

  it("classifies a 5xx as transient and a 4xx as permanent", async () => {
    const build = (status: number) =>
      driverFor({
        url: STARTUP_COLLECTIONS.submission_url,
        controls: controlsFor(STARTUP_COLLECTIONS.form_schema!),
        status,
      });

    const server = await build(503).driver.run(
      makeContext(STARTUP_COLLECTIONS),
      recordingReporter(),
    );
    expect(server.kind).toBe("transient_error");

    const gone = await build(404).driver.run(makeContext(STARTUP_COLLECTIONS), recordingReporter());
    expect(gone.kind).toBe("permanent_error");
  });

  it("classifies a network timeout as transient and never swallows it", async () => {
    const { driver } = driverFor({
      url: STARTUP_COLLECTIONS.submission_url,
      controls: {},
      gotoError: new Error("net::ERR_TIMED_OUT navigating to submission page"),
    });
    const outcome = await driver.run(makeContext(STARTUP_COLLECTIONS), recordingReporter());
    expect(outcome.kind).toBe("transient_error");
    expect(outcome.kind === "transient_error" && outcome.detail).toContain("ERR_TIMED_OUT");
  });

  it("refuses a directory the catalog records as CAPTCHA-protected without touching it", async () => {
    const captchaGuarded = { ...STARTUP_COLLECTIONS, requires_captcha: true };
    const { driver, page } = driverFor({
      url: captchaGuarded.submission_url,
      controls: controlsFor(captchaGuarded.form_schema!),
    });
    const outcome = await driver.run(
      makeContext(captchaGuarded as typeof STARTUP_COLLECTIONS),
      recordingReporter(),
    );
    expect(outcome.kind).toBe("challenge_detected");
    expect(page.clicks).toHaveLength(0);
  });

  it("is genuinely generic: the same driver instance handles both directories", async () => {
    const pages: FakePage[] = [];
    const driver = new Tier2FormDriver(async () => pages.shift()!, 0);

    pages.push(
      new FakePage({
        url: STARTUP_PROJECT.submission_url,
        controls: controlsFor(STARTUP_PROJECT.form_schema!),
        textAfterSubmit: "Your startup has been submitted!",
      }),
    );
    const a = await driver.run(
      makeContext(STARTUP_PROJECT, {
        consent: { directory_slug: "the-startup-project", granted_at: "2026-08-24T12:00:00Z" },
      }),
      recordingReporter(),
    );

    pages.push(
      new FakePage({
        url: STARTUP_COLLECTIONS.submission_url,
        controls: controlsFor(STARTUP_COLLECTIONS.form_schema!),
        textAfterSubmit: "Thank you",
      }),
    );
    const b = await driver.run(makeContext(STARTUP_COLLECTIONS), recordingReporter());

    expect([a.kind, b.kind]).toEqual(["succeeded", "succeeded"]);
  });
});

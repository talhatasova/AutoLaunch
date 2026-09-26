import { describe, expect, it } from "vitest";
import type { Tables } from "@directorylaunch/shared";
import { planFanout } from "./fanout";

type DirectoryRow = Tables<"directories">;

function directory(overrides: Partial<DirectoryRow> = {}): DirectoryRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "example",
    name: "Example",
    url: "https://example.com",
    submission_url: "https://example.com/submit",
    tier: 3,
    submission_method: "manual",
    requires_captcha: false,
    requires_consent: false,
    requires_profile_fields: [],
    category: "startup",
    domain_rating: null,
    api_config: null,
    form_schema: null,
    evidence: { checked_url: "https://example.com/submit", checked_at: "2026-08-24T00:00:00Z", finding: "x" },
    last_verified_at: null,
    status: "active",
    created_at: "2026-08-24T00:00:00Z",
    ...overrides,
  };
}

const FORM_SCHEMA = {
  fields: [{ selector: "#name", payload_key: "name", type: "text", required: true }],
  extra_fields: [],
  honeypots: [],
  submit_selector: "button[type=submit]",
  success_signal: { kind: "text_present", value: "Thanks" },
};

const FORM_SCHEMA_WITH_CONSENT = {
  ...FORM_SCHEMA,
  extra_fields: [
    { selector: "#founderName", type: "text", source: "founder_name", required: true },
    { selector: "#consent", type: "checkbox", source: "consent", required: true },
  ],
};

const tier2 = (slug: string, schema: unknown = FORM_SCHEMA) =>
  directory({ id: `dir-${slug}`, slug, tier: 2, submission_method: "form", form_schema: schema as never });

const tier3 = (slug: string, extra: Partial<DirectoryRow> = {}) =>
  directory({ id: `dir-${slug}`, slug, tier: 3, submission_method: "manual", ...extra });

describe("planFanout - Tier 3 is the main path, not an edge case", () => {
  it("gives every Tier 3 directory a submissions row resolving to needs_manual", () => {
    // 21 of our 23 directories are Tier 3. If these did not get a row they would
    // be invisible on the dashboard, and the product would look like it did
    // one-tenth of the work it actually did.
    const dirs = Array.from({ length: 21 }, (_, i) => tier3(`t3-${i}`));
    const plan = planFanout(dirs, { consentedSlugs: [] });

    expect(plan).toHaveLength(21);
    for (const item of plan) {
      expect(item.status).toBe("needs_manual");
      expect(item.eventKind).toBe("manual_required");
      expect(item.enqueue).toBe(false);
      expect(item.reason.length).toBeGreaterThan(0);
    }
  });

  it("never marks a Tier 3 directory as failed - needs_manual is a success-adjacent state", () => {
    const plan = planFanout([tier3("ph", { requires_captcha: true })], { consentedSlugs: [] });
    expect(plan[0]?.status).toBe("needs_manual");
    expect(plan[0]?.reason).toMatch(/CAPTCHA|challenge/i);
  });

  it("explains a login wall differently from a CAPTCHA so the log is honest", () => {
    const captcha = planFanout([tier3("a", { requires_captcha: true })], { consentedSlugs: [] })[0];
    const manual = planFanout([tier3("b", { requires_captcha: false })], { consentedSlugs: [] })[0];
    expect(captcha?.reason).not.toBe(manual?.reason);
  });
});

describe("planFanout - automatable tiers", () => {
  it("queues a Tier 2 directory with a form schema and asks for a job", () => {
    const plan = planFanout([tier2("startup-project")], { consentedSlugs: [] });
    expect(plan[0]?.status).toBe("queued");
    expect(plan[0]?.eventKind).toBe("queued");
    expect(plan[0]?.enqueue).toBe(true);
  });

  it("queues a Tier 1 directory with an api_config", () => {
    const dir = directory({
      id: "dir-t1",
      slug: "t1",
      tier: 1,
      submission_method: "api",
      api_config: { endpoint: "https://api.example.com/listings", method: "POST", auth: "none", field_map: {} } as never,
    });
    const plan = planFanout([dir], { consentedSlugs: [] });
    expect(plan[0]?.status).toBe("queued");
    expect(plan[0]?.enqueue).toBe(true);
  });

  it("falls back to needs_manual when a Tier 2 row has no usable form schema", () => {
    // A CHECK constraint should make this impossible. If it happens anyway, the
    // failure mode must be "hand it to the user", never "let the worker crash".
    const plan = planFanout([tier2("broken", null)], { consentedSlugs: [] });
    expect(plan[0]?.status).toBe("needs_manual");
    expect(plan[0]?.enqueue).toBe(false);
    expect(plan[0]?.reason).toMatch(/form/i);
  });

  it("falls back to needs_manual when a form schema does not match the shared contract", () => {
    const plan = planFanout([tier2("bad", { fields: [], submit_selector: "" })], { consentedSlugs: [] });
    expect(plan[0]?.status).toBe("needs_manual");
    expect(plan[0]?.enqueue).toBe(false);
  });
});

describe("planFanout - consent is never assumed", () => {
  it("holds a consent-gated directory at needs_manual without explicit agreement", () => {
    const plan = planFanout([tier2("startup-project", FORM_SCHEMA_WITH_CONSENT)], { consentedSlugs: [] });
    expect(plan[0]?.status).toBe("needs_manual");
    expect(plan[0]?.enqueue).toBe(false);
    expect(plan[0]?.reason).toMatch(/terms|consent/i);
  });

  it("queues it once the founder has agreed to that specific directory's terms", () => {
    const plan = planFanout([tier2("startup-project", FORM_SCHEMA_WITH_CONSENT)], {
      consentedSlugs: ["startup-project"],
    });
    expect(plan[0]?.status).toBe("queued");
    expect(plan[0]?.enqueue).toBe(true);
  });

  it("consent for one directory does not carry to another", () => {
    const plan = planFanout(
      [tier2("a", FORM_SCHEMA_WITH_CONSENT), tier2("b", FORM_SCHEMA_WITH_CONSENT)],
      { consentedSlugs: ["a"] },
    );
    expect(plan.find((p) => p.directory.slug === "a")?.status).toBe("queued");
    expect(plan.find((p) => p.directory.slug === "b")?.status).toBe("needs_manual");
  });
});

describe("planFanout - directory health", () => {
  it("skips broken directories entirely rather than queueing work that cannot succeed", () => {
    const plan = planFanout([tier2("ok"), tier2("dead", FORM_SCHEMA)], { consentedSlugs: [] });
    expect(plan).toHaveLength(2);

    const withBroken = planFanout(
      [tier2("ok"), directory({ id: "d", slug: "dead", tier: 2, form_schema: FORM_SCHEMA as never, status: "broken" })],
      { consentedSlugs: [] },
    );
    expect(withBroken).toHaveLength(1);
    expect(withBroken[0]?.directory.slug).toBe("ok");
  });

  it("is stable in directory order so the dashboard does not reshuffle between runs", () => {
    const dirs = [tier3("c"), tier2("a"), tier3("b")];
    expect(planFanout(dirs, { consentedSlugs: [] }).map((p) => p.directory.slug)).toEqual(["c", "a", "b"]);
  });
});

describe("planFanout - the real catalog", () => {
  it("produces 23 rows for the seeded catalog, 2 queued and 21 needs_manual", async () => {
    const seed = (await import("../../../../../seed/directories.json")).default as Array<Record<string, unknown>>;
    const dirs = seed.map((d, i) =>
      directory({
        id: `seed-${i}`,
        slug: d.slug as string,
        name: d.name as string,
        tier: d.tier as number,
        submission_method: d.submission_method as DirectoryRow["submission_method"],
        requires_captcha: d.requires_captcha as boolean,
        requires_consent: (d.requires_consent ?? false) as boolean,
        requires_profile_fields: (d.requires_profile_fields ?? []) as string[],
        form_schema: (d.form_schema ?? null) as never,
        api_config: (d.api_config ?? null) as never,
        status: d.status as DirectoryRow["status"],
      }),
    );

    // Exactly one Tier 2 entry (the-startup-project) carries a consent
    // checkbox; startup-collections does not. So with no agreement collected,
    // one directory is still automatable and the other waits for the founder.
    const withoutConsent = planFanout(dirs, { consentedSlugs: [] });
    expect(withoutConsent).toHaveLength(23);
    expect(withoutConsent.filter((p) => p.status === "needs_manual")).toHaveLength(22);
    expect(
      withoutConsent.find((p) => p.directory.slug === "the-startup-project")?.status,
    ).toBe("needs_manual");
    expect(withoutConsent.find((p) => p.directory.slug === "startup-collections")?.status).toBe("queued");

    const consented = planFanout(dirs, { consentedSlugs: dirs.map((d) => d.slug) });
    expect(consented).toHaveLength(23);
    expect(consented.filter((p) => p.status === "queued")).toHaveLength(2);
    expect(consented.filter((p) => p.status === "needs_manual")).toHaveLength(21);
    expect(consented.filter((p) => p.enqueue)).toHaveLength(2);
  });
});

describe("planFanout - the requires_consent column is authoritative", () => {
  it("gates on the column even when the form schema carries no consent control", () => {
    // The column is what the database and the worker agree on. A row flagged
    // there must not be automated just because the cached form_schema is stale.
    const dir = directory({ id: "d", slug: "flagged", tier: 2, form_schema: FORM_SCHEMA as never, requires_consent: true });
    expect(planFanout([dir], { consentedSlugs: [] })[0]?.status).toBe("needs_manual");
    expect(planFanout([dir], { consentedSlugs: ["flagged"] })[0]?.status).toBe("queued");
  });

  it("still gates on a consent control found only in the form schema", () => {
    // Fallback for a row seeded before the column existed: fail toward asking.
    const dir = tier2("legacy", FORM_SCHEMA_WITH_CONSENT);
    expect(planFanout([dir], { consentedSlugs: [] })[0]?.status).toBe("needs_manual");
  });
});

describe("planFanout - consent_granted_at", () => {
  const at = () => new Date("2026-08-24T12:00:00.000Z");

  it("records the grant timestamp only where consent was actually required and given", () => {
    const dir = directory({ id: "d", slug: "c", tier: 2, form_schema: FORM_SCHEMA as never, requires_consent: true });
    const item = planFanout([dir], { consentedSlugs: ["c"], now: at })[0];
    expect(item?.status).toBe("queued");
    expect(item?.consentGrantedAt).toBe("2026-08-24T12:00:00.000Z");
  });

  it("leaves it null for a directory that never asked for consent", () => {
    const item = planFanout([tier2("no-consent")], { consentedSlugs: ["no-consent"], now: at })[0];
    expect(item?.status).toBe("queued");
    // Recording a grant nobody was asked for would put a false record on file.
    expect(item?.consentGrantedAt).toBeNull();
  });

  it("leaves it null on every needs_manual row, including one held back for consent", () => {
    const dir = directory({ id: "d", slug: "c", tier: 2, form_schema: FORM_SCHEMA as never, requires_consent: true });
    expect(planFanout([dir], { consentedSlugs: [], now: at })[0]?.consentGrantedAt).toBeNull();
    expect(planFanout([tier3("t3")], { consentedSlugs: [], now: at })[0]?.consentGrantedAt).toBeNull();
  });
});

describe("planFanout - company profile requirements", () => {
  const FULL = {
    phone: "+1 555 0100",
    employee_count: "2-10",
    customer_count: "100+",
    competitors: ["Acme"],
    founded_year: 2024,
  };

  const needsProfile = (fields: string[]) =>
    directory({
      id: "dir-sp",
      slug: "softwaresuggest",
      name: "SoftwareSuggest",
      tier: 2,
      submission_method: "form",
      form_schema: FORM_SCHEMA as never,
      requires_profile_fields: fields,
    });

  it("holds a directory at needs_manual when the profile is missing entirely", () => {
    const item = planFanout([needsProfile(["phone", "employee_count"])], {
      consentedSlugs: [],
      companyProfile: null,
    })[0];
    expect(item?.status).toBe("needs_manual");
    expect(item?.enqueue).toBe(false);
  });

  it("names the missing fields so the founder knows what to fill in", () => {
    const item = planFanout([needsProfile(["phone", "customer_count"])], {
      consentedSlugs: [],
      companyProfile: { ...FULL, phone: null, customer_count: null },
    })[0];
    expect(item?.reason).toContain("phone");
    expect(item?.reason).toContain("customer_count");
    // Missing optional data is not a failure and must not read like one.
    expect(item?.reason).not.toMatch(/\berror\b|\bfailed\b/i);
  });

  it("queues once every required field is populated", () => {
    const item = planFanout([needsProfile(["phone", "employee_count", "competitors"])], {
      consentedSlugs: [],
      companyProfile: FULL,
    })[0];
    expect(item?.status).toBe("queued");
    expect(item?.enqueue).toBe(true);
  });

  it("treats an empty competitors array as unfilled, not as satisfied", () => {
    const item = planFanout([needsProfile(["competitors"])], {
      consentedSlugs: [],
      companyProfile: { ...FULL, competitors: [] },
    })[0];
    expect(item?.status).toBe("needs_manual");
  });

  it("ignores an unrecognised field name rather than blocking the launch on a catalog typo", () => {
    const item = planFanout([needsProfile(["not_a_real_field"])], {
      consentedSlugs: [],
      companyProfile: null,
    })[0];
    expect(item?.status).toBe("queued");
  });

  it("does not consult the profile for a Tier 3 directory, which is manual regardless", () => {
    const dir = tier3("softwaresuggest", { requires_profile_fields: ["phone"] });
    const item = planFanout([dir], { consentedSlugs: [], companyProfile: null })[0];
    expect(item?.status).toBe("needs_manual");
    // The reason is the Tier 3 one, not a profile complaint.
    expect(item?.reason).toMatch(/signed-in account|human reviewer/i);
  });
});

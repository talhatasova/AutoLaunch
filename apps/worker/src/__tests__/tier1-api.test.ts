import { describe, expect, it } from "vitest";
import { Tier1ApiDriver, buildApiBody, credentialEnvKey } from "../drivers/tier1-api";
import type { FetchLike } from "../drivers/tier1-api";
import type { Directory } from "@directorylaunch/shared";
import { loadSeedDirectory, makeContext, recordingReporter } from "./fake-page";

/**
 * Tier 1 against a MOCK transport.
 *
 * Research found zero Tier 1 directories in the catalog - Product Hunt's public API v2 is
 * read-only and cannot create a submission. This path is built and tested because
 * directories get promoted, but it is deliberately not wired to a live third-party API:
 * inventing a fake integration would make the catalog claim a capability nobody verified.
 */
const promoted: Directory = {
  ...loadSeedDirectory("startup-collections"),
  slug: "example-api-directory",
  name: "Example API Directory",
  tier: 1,
  submission_method: "api",
  form_schema: null,
  api_config: {
    endpoint: "https://api.example.test/v1/listings",
    method: "POST",
    auth: "bearer",
    field_map: {
      title: "name",
      subtitle: "tagline",
      body: "description",
      website: "url",
      submitter_email: "contact_email",
      submitter_name: "founder_name",
      headcount: "company_profile.employee_count",
    },
  },
};

function mockFetch(
  responses: Array<{ status: number; body: string }>,
): FetchLike & { calls: Array<{ url: string; init: unknown }> } {
  const calls: Array<{ url: string; init: unknown }> = [];
  const fn = (async (url: string, init: unknown) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 200, body: "{}" };
    return { status: r.status, text: async () => r.body };
  }) as FetchLike & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

describe("Tier1ApiDriver", () => {
  it("maps the payload through api_config.field_map, including dotted profile keys", () => {
    const ctx = makeContext(promoted);
    ctx.payload.company_profile = {
      phone: null,
      employee_count: "2-10",
      customer_count: null,
      competitors: [],
      founded_year: null,
    };
    const built = buildApiBody(promoted.api_config!, ctx);
    expect(built.ok).toBe(true);
    expect(built.ok && built.body).toEqual({
      title: "Acme Analytics",
      subtitle: "Product analytics without the bloat",
      body: "Acme Analytics gives small teams event tracking in one afternoon.",
      website: "https://acme.example",
      submitter_email: "dana@acme.example",
      submitter_name: "Dana Okafor",
      headcount: "2-10",
    });
  });

  it("rejects a field_map naming a key the contract does not have", () => {
    const built = buildApiBody(
      { ...promoted.api_config!, field_map: { title: "nonexistent_key" } },
      makeContext(promoted),
    );
    expect(built.ok).toBe(false);
    expect(!built.ok && built.reason).toContain("unknown payload key");
  });

  it("submits with the bearer credential and an honest User-Agent", async () => {
    const fetchImpl = mockFetch([
      { status: 201, body: JSON.stringify({ url: "https://example.test/l/acme" }) },
    ]);
    const driver = new Tier1ApiDriver({
      fetchImpl,
      userAgent: "DirectoryLaunchBot/1.0 (+https://directorylaunch.app/bot)",
      secretLookup: (k) => (k === "DIRECTORY_API_KEY_EXAMPLE_API_DIRECTORY" ? "sekret" : undefined),
    });

    const outcome = await driver.run(makeContext(promoted), recordingReporter());

    expect(outcome).toEqual({ kind: "succeeded", result_url: "https://example.test/l/acme" });
    const headers = (fetchImpl.calls[0]!.init as { headers: Record<string, string> }).headers;
    expect(headers.authorization).toBe("Bearer sekret");
    expect(headers["user-agent"]).toMatch(/DirectoryLaunchBot/);
  });

  it("derives the credential env var from the slug", () => {
    expect(credentialEnvKey("the-startup-project")).toBe("DIRECTORY_API_KEY_THE_STARTUP_PROJECT");
  });

  it("hands off rather than failing when no credential is configured", async () => {
    const driver = new Tier1ApiDriver({
      fetchImpl: mockFetch([]),
      userAgent: "ua",
      secretLookup: () => undefined,
    });
    const outcome = await driver.run(makeContext(promoted), recordingReporter());
    expect(outcome.kind).toBe("manual_required");
    expect(outcome.kind === "manual_required" && outcome.detail).toContain(
      "DIRECTORY_API_KEY_EXAMPLE_API_DIRECTORY",
    );
  });

  it("treats a Cloudflare 403 as a challenge, NOT as something to retry", async () => {
    const fetchImpl = mockFetch([
      {
        status: 403,
        body: "<html><head><title>Just a moment...</title></head><body><div id=\"challenge-running\"></div></body></html>",
      },
    ]);
    const driver = new Tier1ApiDriver({
      fetchImpl,
      userAgent: "ua",
      secretLookup: () => "sekret",
    });
    const outcome = await driver.run(makeContext(promoted), recordingReporter());
    expect(outcome.kind).toBe("challenge_detected");
  });

  it("classifies 5xx as transient and 4xx as permanent", async () => {
    const make = (status: number) =>
      new Tier1ApiDriver({
        fetchImpl: mockFetch([{ status, body: "nope" }]),
        userAgent: "ua",
        secretLookup: () => "sekret",
      });
    expect((await make(502).run(makeContext(promoted), recordingReporter())).kind).toBe(
      "transient_error",
    );
    expect((await make(422).run(makeContext(promoted), recordingReporter())).kind).toBe(
      "permanent_error",
    );
  });

  it("returns null rather than inventing a result URL when the body has none", async () => {
    const driver = new Tier1ApiDriver({
      fetchImpl: mockFetch([{ status: 200, body: "OK" }]),
      userAgent: "ua",
      secretLookup: () => "sekret",
    });
    const outcome = await driver.run(makeContext(promoted), recordingReporter());
    expect(outcome).toEqual({ kind: "succeeded", result_url: null });
  });

  it("surfaces a network fault as transient instead of swallowing it", async () => {
    const driver = new Tier1ApiDriver({
      fetchImpl: async () => {
        throw new Error("ETIMEDOUT connecting to api.example.test");
      },
      userAgent: "ua",
      secretLookup: () => "sekret",
    });
    const outcome = await driver.run(makeContext(promoted), recordingReporter());
    expect(outcome.kind).toBe("transient_error");
    expect(outcome.kind === "transient_error" && outcome.detail).toContain("ETIMEDOUT");
  });
});

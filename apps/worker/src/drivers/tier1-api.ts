import type { SubmissionOutcome } from "@directorylaunch/shared";
import {
  ChallengeDetectedError,
  ManualRequiredError,
  PermanentError,
  classifyUnknownError,
  outcomeForHttpStatus,
} from "../errors";
import { resolvePayloadValue } from "../payload/values";
import { detectChallenge, emptySnapshot } from "./challenge";
import { parseApiConfig } from "./form-schema";
import type { ApiConfig } from "./form-schema";
import type { Driver, DriverReporter, SubmissionContext } from "./types";

/**
 * Generic Tier 1 client, driven entirely by `directories.api_config`.
 *
 * Research found ZERO Tier 1 directories in the current catalog - Product Hunt's public
 * API v2, the obvious candidate, is read-only and cannot create a submission. This path
 * exists because directories get promoted (a Tier 3 site shipping a create endpoint is a
 * seed-file edit away from being Tier 1), and it is unit-tested against a mock transport.
 *
 * It is deliberately NOT wired to any live third-party API: inventing a fake integration
 * would make the catalog claim a capability we have not verified.
 *
 * Credentials are never stored in the catalog row. `auth` names the scheme and the secret
 * comes from the environment as DIRECTORY_API_KEY_<SLUG_IN_UPPER_SNAKE>, e.g.
 * DIRECTORY_API_KEY_SOME_DIRECTORY for slug "some-directory".
 */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  status: number;
  text: () => Promise<string>;
}>;

export interface Tier1Options {
  fetchImpl: FetchLike;
  userAgent: string;
  /** Reads DIRECTORY_API_KEY_* . Injected so tests never touch process.env. */
  secretLookup: (envKey: string) => string | undefined;
  timeoutMs?: number;
}

export function credentialEnvKey(slug: string): string {
  return `DIRECTORY_API_KEY_${slug.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}`;
}

/** Builds the request body from api_config.field_map: { apiFieldName: payloadKey }. */
export function buildApiBody(
  config: ApiConfig,
  ctx: SubmissionContext,
): { ok: true; body: Record<string, string> } | { ok: false; reason: string } {
  const body: Record<string, string> = {};
  for (const [apiField, payloadKey] of Object.entries(config.field_map)) {
    const resolved = resolvePayloadValue(ctx.payload, payloadKey);
    if (!resolved.ok) {
      return { ok: false, reason: `field_map."${apiField}" -> ${resolved.reason}` };
    }
    body[apiField] = resolved.value;
  }
  return { ok: true, body };
}

export class Tier1ApiDriver implements Driver {
  readonly tier = 1 as const;

  constructor(private readonly opts: Tier1Options) {}

  async run(ctx: SubmissionContext, report: DriverReporter): Promise<SubmissionOutcome> {
    const parsed = parseApiConfig(ctx.directory.api_config);
    if (!parsed.ok) {
      return new PermanentError(
        `${ctx.directory.slug}: api_config is invalid (${parsed.error}). Fix the directory row.`,
      ).outcome;
    }
    const config = parsed.value;

    const built = buildApiBody(config, ctx);
    if (!built.ok) {
      return new PermanentError(`${ctx.directory.slug}: ${built.reason}`).outcome;
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      // Honest and identifiable, with a contact URL. We are a guest here too.
      "user-agent": this.opts.userAgent,
    };

    if (config.auth !== "none") {
      const envKey = credentialEnvKey(ctx.directory.slug);
      const secret = this.opts.secretLookup(envKey);
      if (!secret) {
        // Not a failure - there is nothing broken, we simply have no key. The payload is
        // assembled and the founder can submit it themselves.
        return new ManualRequiredError(
          `${ctx.directory.name} needs an API credential (${envKey}) that is not configured, ` +
            `so we cannot submit for you. Your listing data is ready to paste.`,
        ).outcome;
      }
      if (config.auth === "bearer") headers.authorization = `Bearer ${secret}`;
      else headers["x-api-key"] = secret;
    }

    await report.note("started", `POST ${config.endpoint}`, {
      directory_slug: ctx.directory.slug,
      method: config.method,
      auth: config.auth,
    });

    let status: number;
    let text: string;
    try {
      const res = await this.opts.fetchImpl(config.endpoint, {
        method: config.method,
        headers,
        body: JSON.stringify(built.body),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 20_000),
      });
      status = res.status;
      text = await res.text();
    } catch (e) {
      // Never swallowed. Network faults classify as transient; anything else does not.
      return classifyUnknownError(e);
    }

    // A challenge served on an API endpoint is still a challenge. Cloudflare in front of an
    // API answers 403 with an interstitial body; retrying that is exactly the "hoping to
    // slip through" we refuse to do.
    if (status === 403 || status === 503) {
      const finding = detectChallenge(emptySnapshot({ url: config.endpoint, html: text, status }));
      if (finding) {
        return new ChallengeDetectedError(
          `${finding.detail} [${finding.kind}; ${finding.evidence}]`,
        ).outcome;
      }
    }

    if (status < 200 || status >= 300) {
      return outcomeForHttpStatus(
        status,
        `${config.endpoint} returned HTTP ${status}: ${truncate(text, 400)}`,
      );
    }

    await report.submitted(`${ctx.directory.name} accepted the submission (HTTP ${status}).`);
    return { kind: "succeeded", result_url: extractResultUrl(text) };
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}...`;
}

/**
 * Best-effort listing URL from the response body. Returns null rather than guessing - a
 * fabricated result_url would send the founder to a page that does not exist.
 */
export function extractResultUrl(body: string): string | null {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    for (const key of ["url", "listing_url", "permalink", "html_url", "link"]) {
      const v = json[key];
      if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    }
  } catch {
    // Not JSON. That is not an error worth failing a successful submission over, and we
    // say so by returning null rather than inventing a URL.
  }
  return null;
}

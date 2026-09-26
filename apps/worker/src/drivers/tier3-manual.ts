import type { SubmissionOutcome } from "@directorylaunch/shared";
import type { Driver, DriverReporter, SubmissionContext } from "./types";

/**
 * The structured packet handed to the founder whenever a submission resolves needs_manual.
 *
 * `needs_manual` is a SUCCESS state, and this object is why: everything the directory's
 * form asks for is already assembled, so the remaining work is paste-and-click rather than
 * research-and-retype. A needs_manual event with no handoff attached would be a dead end
 * dressed up as a feature.
 *
 * Attached to the event for EVERY needs_manual outcome - Tier 3, a detected challenge, an
 * unmet profile requirement, a missing consent - not only for Tier 3.
 */
export interface ManualHandoff {
  directory: { slug: string; name: string; submission_url: string; tier: number };
  listing: {
    title: string;
    tagline: string;
    description: string;
    url: string;
    category: string;
    tags: string[];
    logo_url: string | null;
    screenshot_url: string | null;
  };
  /**
   * Identity fields. These are the AUTHENTICATED FOUNDER'S OWN name and email, taken from
   * their profile - never a generated persona or a disposable inbox.
   */
  contact: { founder_name: string; contact_email: string };
  company_profile: SubmissionContext["payload"]["company_profile"];
  /** Plain-language explanation of why this one is manual. */
  reason: string;
}

export function buildManualHandoff(ctx: SubmissionContext, reason: string): ManualHandoff {
  const p = ctx.payload;
  return {
    directory: {
      slug: ctx.directory.slug,
      name: ctx.directory.name,
      submission_url: ctx.directory.submission_url,
      tier: ctx.directory.tier,
    },
    listing: {
      title: p.name,
      tagline: p.tagline,
      description: p.description,
      url: p.url,
      category: p.category,
      tags: p.tags,
      logo_url: p.logo_url,
      screenshot_url: p.screenshot_url,
    },
    contact: { founder_name: p.founder_name, contact_email: p.contact_email },
    company_profile: p.company_profile,
    reason,
  };
}

/**
 * Tier 3: CAPTCHA-gated, login-walled, or editorially manual.
 *
 * We do not open a browser and we do not probe the page. The catalog already recorded, with
 * evidence, why this directory cannot be automated; re-checking would be a request to a
 * third-party site that buys us nothing.
 */
export class Tier3ManualDriver implements Driver {
  readonly tier = 3 as const;

  async run(ctx: SubmissionContext, report: DriverReporter): Promise<SubmissionOutcome> {
    const d = ctx.directory;
    await report.note("started", `Assembling a manual submission packet for ${d.name}`, {
      directory_slug: d.slug,
      tier: d.tier,
    });

    const why = d.requires_captcha
      ? `${d.name} is protected by a CAPTCHA or bot-detection challenge. We never solve or ` +
        `evade those, so this one is yours to submit.`
      : `${d.name} requires a signed-in account or human review, so it cannot be submitted ` +
        `programmatically.`;

    return {
      kind: "manual_required",
      detail: `${why} Everything the form asks for is pre-assembled below - open ${d.submission_url} and paste.`,
    };
  }
}

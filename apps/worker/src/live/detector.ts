import { z } from "zod";
import { dueLiveChecks, settleLiveCheck } from "../db/repository";
import type { Db } from "../db/repository";
import { describeError, log } from "../logger";
import type { DomainRateLimiter } from "../net/rate-limit";
import { bareHost, onHost } from "../net/host";
import { safeFetch } from "../net/safe-fetch";

/**
 * The one listing verifier. After a receipt, checks the channel every 24 hours for 30 days
 * using `directories.live_lookup`. A page on the directory's host that links to the
 * product's domain marks the submission live with that URL; past the deadline it becomes
 * not_published.
 *
 * Founder-supplied URLs go through the same verifier: the API writes
 * `receipt_evidence.candidate_url` and sets `next_live_check_at = now()`; the next loop
 * verifies that URL first, then clears it.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SEARCH_CANDIDATES = 3;

export const liveLookupSchema = z.object({
  kind: z.enum(["url_pattern", "site_search", "none"]),
  template: z.string().optional(),
});
export type LiveLookup = z.infer<typeof liveLookupSchema>;


function links(html: string, base: string): URL[] {
  const found: URL[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi)) {
    try { found.push(new URL(m[1]!.replace(/&amp;/g, "&"), base)); } catch { /* not a URL: not a link */ }
  }
  return found;
}

/** Returns the verified public listing URL, or null when the page does not qualify. */
export async function verifyListing(
  listingUrl: string, directoryUrl: string, productUrl: string, userAgent: string,
): Promise<string | null> {
  const directoryHost = bareHost(directoryUrl);
  const productHost = bareHost(productUrl);
  if (new URL(listingUrl).protocol !== "https:" || !onHost(listingUrl, directoryHost)) return null;
  // ponytail: whole-catalog pages (startupproject.org/startups/ is ~1 MB) need headroom.
  const page = await safeFetch(listingUrl, { userAgent, maxBytes: 4_000_000 });
  if (page.status !== 200 || !onHost(page.url, directoryHost)) return null;
  return links(page.body, page.url).some((l) => onHost(l, productHost)) ? page.url : null;
}

export async function findListing(
  lookup: LiveLookup, directoryUrl: string, productUrl: string, userAgent: string,
): Promise<string | null> {
  if (lookup.kind === "none" || !lookup.template) return null;
  const domain = bareHost(productUrl);
  const label = domain.split(".")[0]!;
  // {domain} = beyondelo.com, {label} = beyondelo (for sites whose search matches names only).
  const target = lookup.template
    .replaceAll("{domain}", encodeURIComponent(domain))
    .replaceAll("{label}", encodeURIComponent(label));
  if (lookup.kind === "url_pattern") return await verifyListing(target, directoryUrl, productUrl, userAgent);

  // site_search: listing candidates are same-site links from the results page that carry
  // the product's name label (beyondelo.com -> "beyondelo").
  const directoryHost = bareHost(directoryUrl);
  if (!onHost(target, directoryHost)) return null;
  const results = await safeFetch(target, { userAgent, maxBytes: 1_000_000 });
  const candidates = [...new Set(links(results.body, results.url)
    .filter((l) => onHost(l, directoryHost) && l.pathname.toLowerCase().includes(label))
    .map((l) => l.toString()))].slice(0, MAX_SEARCH_CANDIDATES);
  for (const candidate of candidates) {
    const verified = await verifyListing(candidate, directoryUrl, productUrl, userAgent);
    if (verified) return verified;
  }
  return null;
}

/** Columns to set when a receipt is recorded. No lookup means nothing to poll. */
export function liveCheckSchedule(rawLookup: unknown, now = new Date()): { next_live_check_at?: Date; live_check_deadline?: Date } {
  const lookup = liveLookupSchema.safeParse(rawLookup);
  if (!lookup.success || lookup.data.kind === "none") return {};
  return {
    next_live_check_at: new Date(now.getTime() + DAY_MS),
    live_check_deadline: new Date(now.getTime() + 30 * DAY_MS),
  };
}

export async function runLiveChecks(
  db: Db, limiter: DomainRateLimiter, userAgent: string, now = new Date(),
): Promise<void> {
  for (const row of await dueLiveChecks(db, now)) {
    const rlog = log.child({ submission_id: row.id, directory: row.directory_slug });
    const evidence = row.receipt_evidence ?? {};
    const candidate = typeof evidence.candidate_url === "string" ? evidence.candidate_url : null;
    let url: string | null = null;
    if (candidate) {
      try {
        url = await limiter.run(row.directory_url, () => verifyListing(candidate, row.directory_url, row.product_url, userAgent));
      } catch (cause) {
        rlog.warn("founder listing URL check failed", describeError(cause));
      }
      rlog.info("founder listing URL checked", { verified: url !== null });
      const { candidate_url: _dropped, ...rest } = evidence;
      if (!url) {
        await settleLiveCheck(db, row.id, { receipt_evidence: rest }, {
          kind: "started",
          message: "The listing URL you provided could not be verified: it must be an https page on the directory's site that links to your product.",
          payload: { step: "live_check", candidate_rejected: true },
        });
      }
    }
    if (!url && row.live_check_deadline && row.live_check_deadline.getTime() <= now.getTime()) {
      rlog.info("live check deadline passed", { status: "not_published" });
      await settleLiveCheck(db, row.id, { status: "not_published", next_live_check_at: null }, {
        kind: "not_published",
        message: "No public listing was found within 30 days of the receipt.",
        payload: { status: "not_published" },
      });
      continue;
    }
    if (!url) {
      try {
        const lookup = liveLookupSchema.safeParse(row.live_lookup);
        if (lookup.success) {
          url = await limiter.run(row.directory_url, () => findListing(lookup.data, row.directory_url, row.product_url, userAgent));
        }
      } catch (cause) {
        // A failed lookup is retried at the next daily check, never treated as "not live".
        rlog.warn("live lookup failed", describeError(cause));
      }
    }
    rlog.info("live check", { found: url !== null });
    if (url) {
      const { candidate_url: _dropped, ...rest } = evidence;
      await settleLiveCheck(db, row.id, {
        status: "live", result_url: url, live_checked_at: now, next_live_check_at: null, receipt_evidence: rest,
      }, { kind: "live", message: "Public listing found with a link to the product.", payload: { url } });
    } else {
      // No deadline means no scheduled polling (e.g. a one-off founder URL on an unconfirmed row).
      await settleLiveCheck(db, row.id, {
        next_live_check_at: row.live_check_deadline ? new Date(now.getTime() + DAY_MS) : null,
      }, null);
    }
  }
}

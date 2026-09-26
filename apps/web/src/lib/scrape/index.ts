import { scraperUserAgent } from "@/lib/supabase/env";
import { robotsDisallowed } from "./errors";
import { deriveName, deriveTagline, extractMetadata, type ScrapedMetadata } from "./metadata";
import { EMPTY_RULES, isPathAllowed, parseRobots, productTokenFor, robotsUrlFor } from "./robots";
import { defaultDeps, parseHttpUrl, safeFetch, type SafeFetchDeps } from "./safe-fetch";

export * from "./errors";
export { extractMetadata, deriveName, deriveTagline } from "./metadata";
export { parseHttpUrl, safeFetch } from "./safe-fetch";
export type { ScrapedMetadata } from "./metadata";

export interface ScrapeResult {
  /** The URL after redirects. This is what we store and submit, not the input. */
  final_url: string;
  metadata: ScrapedMetadata;
  /** A display name that is never empty - `apps.name` is NOT NULL. */
  name: string;
  /** Description squeezed into the 200-char tagline budget, or null. */
  tagline: string | null;
  /** Every URL visited, for the event log. */
  chain: string[];
  /** Notes worth recording but not worth failing over. */
  notes: string[];
}

const ROBOTS_MAX_BYTES = 512 * 1024;
const ROBOTS_TIMEOUT_MS = 5_000;

/**
 * Fetch and honour robots.txt.
 *
 * Deviation from a strict reading of the REP, stated because it is a real
 * decision: a 5xx on `/robots.txt` is treated as "no rules" rather than "deny
 * everything". Strict REP says a persistently unavailable robots.txt means a
 * full disallow, which is the right rule for a crawler discovering pages. We
 * are not crawling - this is one fetch of one page, initiated by the site's own
 * owner, who is sitting in our UI waiting for it. Failing their launch because
 * their host returned a 502 for a file they never wrote would be the wrong
 * trade. Directives we CAN read are always obeyed.
 */
async function fetchRobots(
  pageUrl: URL,
  userAgent: string,
  deps: SafeFetchDeps,
  notes: string[],
): Promise<ReturnType<typeof parseRobots>> {
  const token = productTokenFor(userAgent);

  try {
    const response = await safeFetch(
      robotsUrlFor(pageUrl),
      {
        userAgent,
        accept: "text/plain",
        maxBytes: ROBOTS_MAX_BYTES,
        timeoutMs: ROBOTS_TIMEOUT_MS,
        maxRedirects: 2,
      },
      deps,
    );

    if (response.status >= 400) {
      notes.push(`robots.txt returned ${response.status}; treating the site as unrestricted`);
      return EMPTY_RULES;
    }

    return parseRobots(response.body, token);
  } catch (error) {
    // Not swallowed: recorded as a note that reaches submission_events. A
    // robots.txt we could not read is a fact about the fetch worth keeping.
    const reason = error instanceof Error ? error.message : String(error);
    notes.push(`could not read robots.txt (${reason}); treating the site as unrestricted`);
    return EMPTY_RULES;
  }
}

export interface ScrapeOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Skip the robots.txt round trip. Only for tests. */
  skipRobots?: boolean;
}

/**
 * Fetch a founder's site and pull out the listing metadata.
 *
 * Every network call goes through `safeFetch`, which is the SSRF guard. There is
 * no other fetch on this path, and adding one would be the bug.
 */
export async function scrapeSite(
  rawUrl: string,
  options: ScrapeOptions = {},
  deps: SafeFetchDeps = defaultDeps,
): Promise<ScrapeResult> {
  const userAgent = scraperUserAgent();
  const notes: string[] = [];

  // Validate the shape before spending anything on the network.
  const url = parseHttpUrl(rawUrl);

  if (!options.skipRobots) {
    const rules = await fetchRobots(url, userAgent, deps, notes);
    // Rules can target the query string, so match against path + search.
    if (!isPathAllowed(rules, `${url.pathname}${url.search}`)) {
      throw robotsDisallowed(url.toString(), userAgent);
    }
    if (rules.matchedAgent) {
      notes.push(`robots.txt group "${rules.matchedAgent}" applied`);
    }
  }

  const response = await safeFetch(
    url.toString(),
    {
      userAgent,
      timeoutMs: options.timeoutMs,
      maxBytes: options.maxBytes,
      maxRedirects: options.maxRedirects,
    },
    deps,
  );

  if (response.status >= 400) {
    notes.push(`the page returned HTTP ${response.status}; metadata may be incomplete`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/html|xml/i.test(contentType)) {
    // Not an error. A founder pointing at a PDF or a JSON endpoint gets a
    // listing built from the URL rather than a rejection.
    notes.push(`content-type was "${contentType}", not HTML; falling back to the hostname`);
  }

  const metadata = extractMetadata(response.body, response.url);

  return {
    final_url: response.url,
    metadata,
    name: deriveName(metadata.title, metadata.site_name, response.url),
    tagline: deriveTagline(metadata.description ?? metadata.title),
    chain: response.chain,
    notes,
  };
}

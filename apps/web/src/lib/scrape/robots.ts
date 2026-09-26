/**
 * robots.txt parsing, to the subset of the REP that actually matters for a
 * single-page metadata fetch.
 *
 * We check robots.txt because we are a bot making a request a human did not
 * make, from a datacenter, against someone else's server. The founder asked us
 * to read their own site, which makes disallowing it unlikely - but "unlikely"
 * is not "never", and the whole product rests on being a well-behaved guest.
 *
 * Deliberately NOT a full REP implementation: no crawl-delay (we make one
 * request), no sitemap handling, no host directives.
 */

export interface RobotsRules {
  /** The group whose rules apply to us, already selected. */
  allow: string[];
  disallow: string[];
  /** Which User-agent group matched: our token, "*", or none. */
  matchedAgent: string | null;
}

export const EMPTY_RULES: RobotsRules = { allow: [], disallow: [], matchedAgent: null };

interface Group {
  agents: string[];
  allow: string[];
  disallow: string[];
}

function stripComment(line: string): string {
  const hash = line.indexOf("#");
  return (hash === -1 ? line : line.slice(0, hash)).trim();
}

/**
 * Parse robots.txt and return only the rules that bind us.
 *
 * Group selection follows the REP: a group naming our product token wins over
 * the wildcard group, and if neither is present nothing is disallowed.
 */
export function parseRobots(text: string, productToken: string): RobotsRules {
  const token = productToken.toLowerCase();
  const groups: Group[] = [];
  let current: Group | null = null;
  // Consecutive User-agent lines share one rule block; a rule line closes the
  // agent list so the next User-agent starts a new group.
  let agentBlockOpen = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine);
    if (line.length === 0) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;

    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!agentBlockOpen || !current) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
        agentBlockOpen = true;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (field !== "allow" && field !== "disallow") continue;
    if (!current) continue;

    agentBlockOpen = false;
    // "Disallow:" with an empty value means "nothing is disallowed" and must
    // not be recorded as a rule matching every path.
    if (value.length === 0) {
      if (field === "allow") continue;
      continue;
    }
    if (field === "allow") current.allow.push(value);
    else current.disallow.push(value);
  }

  const exact = groups.filter((g) => g.agents.includes(token));
  const wildcard = groups.filter((g) => g.agents.includes("*"));
  const selected = exact.length > 0 ? exact : wildcard;
  if (selected.length === 0) return EMPTY_RULES;

  return {
    allow: selected.flatMap((g) => g.allow),
    disallow: selected.flatMap((g) => g.disallow),
    matchedAgent: exact.length > 0 ? token : "*",
  };
}

/**
 * Turn a robots path pattern into a regex.
 *
 * A pattern is a literal prefix with exactly two special characters: `*` for
 * any sequence, and a trailing `$` anchoring the end. Everything else is
 * escaped, so a `.` or `+` in a path stays a `.` or `+` rather than becoming a
 * regex operator (and a pathological pattern cannot become a catastrophic one).
 */
function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;

  const source = body
    .split("*")
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s\\S]*");

  return new RegExp(`^${source}${anchored ? "$" : ""}`);
}

function matchLength(pattern: string, path: string): number | null {
  return patternToRegExp(pattern).test(path) ? pattern.length : null;
}

/**
 * Decide whether we may fetch `pathAndQuery`.
 *
 * `pathAndQuery` must include the query string, because rules such as
 * `Disallow: /search?q=` target it.
 *
 * The most specific (longest) matching pattern wins; Allow wins a tie. That is
 * the Google/REP resolution rule, and it is the one that makes the common
 * "Disallow: /docs + Allow: /docs/public" pair behave as its author intended.
 */
export function isPathAllowed(rules: RobotsRules, pathAndQuery: string): boolean {
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;

  let longestAllow = -1;
  let longestDisallow = -1;

  for (const pattern of rules.allow) {
    const length = matchLength(pattern, path);
    if (length !== null && length > longestAllow) longestAllow = length;
  }
  for (const pattern of rules.disallow) {
    const length = matchLength(pattern, path);
    if (length !== null && length > longestDisallow) longestDisallow = length;
  }

  if (longestDisallow === -1) return true;
  return longestAllow >= longestDisallow;
}

/** The robots.txt URL for a page URL. Always the origin root, never relative. */
export function robotsUrlFor(pageUrl: string | URL): string {
  return new URL("/robots.txt", pageUrl).toString();
}

/**
 * The product token a robots.txt author would write to address us.
 *
 * `SCRAPER_USER_AGENT` is a full UA string with a contact URL
 * ("DirectoryLaunchBot/1.0 (+https://...)"), but a robots.txt names the bare
 * product token. This extracts the one from the other.
 */
export function productTokenFor(userAgent: string): string {
  const first = userAgent.trim().split(/\s+/)[0] ?? userAgent;
  const slash = first.indexOf("/");
  return slash === -1 ? first : first.slice(0, slash);
}

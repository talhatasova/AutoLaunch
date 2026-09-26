import { parse, type HTMLElement } from "node-html-parser";

/**
 * Metadata extraction from a fetched page.
 *
 * Everything here is best-effort and null-tolerant. A founder's landing page
 * having no og:image is normal; it is not an error, and it must not fail their
 * launch. What we extract becomes the listing we submit under their name, so we
 * prefer the tags they curated (Open Graph) over whatever the CMS produced.
 */

export interface ScrapedMetadata {
  title: string | null;
  description: string | null;
  /** Absolute http(s) URL, or null. */
  image_url: string | null;
  /** Absolute http(s) URL. Falls back to <origin>/favicon.ico. */
  favicon_url: string | null;
  site_name: string | null;
  canonical_url: string | null;
}

/** Long enough for any real description, short enough to bound what we store. */
const MAX_DESCRIPTION = 2000;
/** apps.tagline is CHECK (length <= 200) and submissionPayloadSchema agrees. */
export const MAX_TAGLINE = 200;

function clean(value: string | null | undefined): string | null {
  if (value == null) return null;
  // node-html-parser has already decoded entities in text and attributes.
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length === 0 ? null : collapsed;
}

/**
 * Resolve a possibly-relative URL and keep it only if it is http(s).
 *
 * A `data:` or `blob:` image is useless to us: these URLs get handed to
 * third-party directories, which need something they can actually fetch.
 */
function absoluteHttpUrl(value: string | null, base: string): string | null {
  const raw = clean(value);
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    // A malformed URL in someone's markup is not our problem to report; we just
    // do not have an image. The caller records what it ended up with.
    return null;
  }
}

/** First non-empty content attribute among the given meta selectors, in order. */
function metaContent(root: HTMLElement, selectors: string[]): string | null {
  for (const selector of selectors) {
    for (const el of root.querySelectorAll(selector)) {
      const value = clean(el.getAttribute("content"));
      if (value) return value;
    }
  }
  return null;
}

/**
 * `<link rel>` is a space-separated token list, so `rel="shortcut icon"` must
 * match a request for `icon`. CSS `[rel~="icon"]` expresses exactly that, but
 * we do the token split ourselves so the ordering preference below is explicit.
 */
function linkHrefByRel(root: HTMLElement, wanted: string[]): string | null {
  const links = root.querySelectorAll("link");
  for (const want of wanted) {
    for (const link of links) {
      const rel = link.getAttribute("rel");
      if (!rel) continue;
      const tokens = rel.toLowerCase().split(/\s+/);
      if (tokens.includes(want)) {
        const href = clean(link.getAttribute("href"));
        if (href) return href;
      }
    }
  }
  return null;
}

export function extractMetadata(html: string, pageUrl: string): ScrapedMetadata {
  let root: HTMLElement;
  try {
    // `blockTextElements` keeps script/style contents as opaque text, so a
    // string inside a <script> that looks like a meta tag is never parsed as one.
    root = parse(html, {
      blockTextElements: { script: false, noscript: false, style: false, pre: true },
    });
  } catch {
    // node-html-parser is extremely forgiving, but if it ever does throw, an
    // unreadable page is still a valid (empty) result rather than a 500.
    root = parse("");
  }

  // A <base href> changes what every relative URL on the page resolves against.
  const baseHref = clean(root.querySelector("base")?.getAttribute("href"));
  let base = pageUrl;
  if (baseHref) {
    try {
      base = new URL(baseHref, pageUrl).toString();
    } catch {
      base = pageUrl;
    }
  }

  const title =
    metaContent(root, ['meta[property="og:title"]', 'meta[name="og:title"]', 'meta[name="twitter:title"]']) ??
    clean(root.querySelector("title")?.text);

  const rawDescription =
    metaContent(root, [
      'meta[property="og:description"]',
      'meta[name="og:description"]',
      'meta[name="twitter:description"]',
      'meta[name="description"]',
    ]) ?? null;

  const description =
    rawDescription === null ? null : rawDescription.slice(0, MAX_DESCRIPTION);

  const image_url = absoluteHttpUrl(
    metaContent(root, [
      'meta[property="og:image:secure_url"]',
      'meta[property="og:image"]',
      'meta[name="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
    ]),
    base,
  );

  const iconHref = linkHrefByRel(root, ["icon", "shortcut", "apple-touch-icon", "mask-icon"]);
  const favicon_url =
    absoluteHttpUrl(iconHref, base) ??
    // Every server that has a favicon at all serves it here. Worst case the
    // directory gets a 404 for an icon, which is strictly better than no icon field.
    absoluteHttpUrl("/favicon.ico", pageUrl);

  const site_name = metaContent(root, ['meta[property="og:site_name"]', 'meta[name="og:site_name"]']);
  const canonical_url = absoluteHttpUrl(linkHrefByRel(root, ["canonical"]), base);

  return { title, description, image_url, favicon_url, site_name, canonical_url };
}

/**
 * Squeeze a description into the 200-character tagline budget.
 *
 * Cuts on a word boundary, because a tagline ending mid-word is published under
 * the founder's name on someone else's site. An ellipsis marks that we trimmed
 * it rather than pretending the sentence ended there.
 */
export function deriveTagline(description: string | null): string | null {
  const text = clean(description);
  if (!text) return null;
  if (text.length <= MAX_TAGLINE) return text;

  // Leave room for the ellipsis inside the budget.
  const slice = text.slice(0, MAX_TAGLINE - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > MAX_TAGLINE / 2 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s,;:.-]+$/, "")}…`;
}

/**
 * A display name for the app when the page gives us nothing usable.
 *
 * `apps.name` is NOT NULL with a non-blank CHECK, so this must always produce
 * something. The registrable-looking part of the hostname is the least
 * surprising fallback a founder could see.
 */
export function deriveName(title: string | null, siteName: string | null, pageUrl: string): string {
  const candidate = clean(siteName) ?? clean(title);
  if (candidate) {
    // "Pagecrest | Turn your changelog into email" -> "Pagecrest".
    // Only split when the first segment is substantial; otherwise keep it whole.
    const head = candidate.split(/\s+[|–—-]\s+/)[0]?.trim();
    if (head && head.length >= 2) return head.slice(0, 120);
    return candidate.slice(0, 120);
  }

  const host = new URL(pageUrl).hostname.replace(/^www\./, "");
  const label = host.split(".")[0] ?? host;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

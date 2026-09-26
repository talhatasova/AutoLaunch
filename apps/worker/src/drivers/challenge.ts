/**
 * CAPTCHA / bot-detection challenge detection.
 *
 * ------------------------------------------------------------------------------------
 * WHY THIS READS THE LIVE DOM AND NOT THE INITIAL HTML
 * ------------------------------------------------------------------------------------
 * Directory research found that Future Tools serves a clean, CAPTCHA-free form to `curl`
 * and then injects Cloudflare Turnstile client-side once the page renders. A detector that
 * only inspected the server's initial HTML would have declared that page safe, filled the
 * form, and failed silently on exactly the site it most needed to catch.
 *
 * So detection runs against a snapshot captured AFTER render (and again immediately before
 * submit, because a widget can be mounted in response to interaction). The snapshot
 * deliberately includes things raw HTML cannot show: resolved frame URLs, the live script
 * `src` list, and the widget globals the page has actually installed on `window`.
 *
 * ------------------------------------------------------------------------------------
 * WHAT WE DO ON DETECTION
 * ------------------------------------------------------------------------------------
 * Emit `challenge_detected`, resolve `needs_manual`, STOP. We do not solve the challenge,
 * we do not call a solving service, we do not stealth-patch the browser to evade
 * detection, and we do not retry hoping to slip through. This is not a tunable.
 */

export type ChallengeKind =
  | "cloudflare_interstitial"
  | "cloudflare_turnstile"
  | "recaptcha"
  | "hcaptcha"
  | "generic_captcha";

export interface DomSnapshot {
  /** Where the page actually ended up - a challenge often redirects. */
  url: string;
  /** Serialised LIVE DOM (page.content()), i.e. after client-side scripts have run. */
  html: string;
  /** URLs of every frame, including cross-origin widget iframes. */
  frameUrls: string[];
  /** `src` of every <script> currently in the live document. */
  scriptSrcs: string[];
  /** Challenge-vendor globals actually installed on `window` at snapshot time. */
  windowKeys: string[];
  /** HTTP status of the main document, when known. */
  status?: number | null;
}

export interface ChallengeFinding {
  kind: ChallengeKind;
  /** Human-readable, goes straight into the submission_events row the user sees. */
  detail: string;
  /** Which signal fired. Kept for auditability when a detection looks wrong. */
  evidence: string;
}

export function emptySnapshot(partial: Partial<DomSnapshot> = {}): DomSnapshot {
  return {
    url: "",
    html: "",
    frameUrls: [],
    scriptSrcs: [],
    windowKeys: [],
    status: null,
    ...partial,
  };
}

/** Globals we probe for on `window`. Presence means the vendor script executed. */
export const CHALLENGE_WINDOW_GLOBALS = [
  "grecaptcha",
  "hcaptcha",
  "turnstile",
  "__CF$cv$params",
  "_cf_chl_opt",
] as const;

interface Rule {
  kind: ChallengeKind;
  label: string;
  /** Returns the matching evidence string, or null. */
  match: (s: DomSnapshot) => string | null;
}

function anyMatch(values: readonly string[], patterns: RegExp[], where: string): string | null {
  for (const v of values) {
    for (const p of patterns) {
      if (p.test(v)) return `${where}: ${v}`;
    }
  }
  return null;
}

function htmlMatch(html: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return `dom matched /${p.source}/`;
  }
  return null;
}

const RULES: Rule[] = [
  {
    kind: "cloudflare_interstitial",
    label: "Cloudflare bot-protection interstitial",
    match: (s) =>
      // Cloudflare's managed challenge serves 403/503 with a distinctive body.
      htmlMatch(s.html, [
        /cf-browser-verification/i,
        /__cf_chl_(?:opt|jschl|f)/i,
        /cf-challenge-running/i,
        /id=["']challenge-(?:form|stage|running|error-title)["']/i,
        /<title>\s*Just a moment/i,
        /Checking (?:if the site connection is secure|your browser before accessing)/i,
        /Enable JavaScript and cookies to continue/i,
      ]) ??
      anyMatch(s.windowKeys, [/^__CF\$cv\$params$/, /^_cf_chl_opt$/], "window global") ??
      anyMatch(s.url ? [s.url] : [], [/\/cdn-cgi\/challenge-platform/i], "url"),
  },
  {
    kind: "cloudflare_turnstile",
    label: "Cloudflare Turnstile widget",
    match: (s) =>
      // Injected client-side by Future Tools and friends: only the live DOM shows it.
      anyMatch(s.scriptSrcs, [/challenges\.cloudflare\.com/i], "script src") ??
      anyMatch(s.frameUrls, [/challenges\.cloudflare\.com/i], "frame url") ??
      anyMatch(s.windowKeys, [/^turnstile$/], "window global") ??
      htmlMatch(s.html, [
        /class=["'][^"']*cf-turnstile/i,
        /data-sitekey=[^>]*turnstile/i,
        /challenges\.cloudflare\.com\/turnstile/i,
        /name=["']cf-turnstile-response["']/i,
      ]),
  },
  {
    kind: "recaptcha",
    label: "Google reCAPTCHA",
    match: (s) =>
      anyMatch(s.scriptSrcs, [/(?:google\.com|gstatic\.com|recaptcha\.net)\/recaptcha/i], "script src") ??
      anyMatch(s.frameUrls, [/\/recaptcha\//i], "frame url") ??
      anyMatch(s.windowKeys, [/^grecaptcha$/], "window global") ??
      htmlMatch(s.html, [
        /class=["'][^"']*g-recaptcha/i,
        /id=["']g-recaptcha-response["']/i,
        /data-callback=["'][^"']*recaptcha/i,
        /\bgrecaptcha\.(?:execute|render|ready)\b/i,
      ]),
  },
  {
    kind: "hcaptcha",
    label: "hCaptcha",
    match: (s) =>
      anyMatch(s.scriptSrcs, [/hcaptcha\.com/i], "script src") ??
      anyMatch(s.frameUrls, [/hcaptcha\.com/i], "frame url") ??
      anyMatch(s.windowKeys, [/^hcaptcha$/], "window global") ??
      htmlMatch(s.html, [
        /class=["'][^"']*h-captcha/i,
        /name=["']h-captcha-response["']/i,
      ]),
  },
  {
    kind: "generic_captcha",
    label: "an unidentified CAPTCHA control",
    match: (s) =>
      // Deliberately last and deliberately broad. A vendor we have not catalogued is
      // still a challenge, and guessing "probably fine" is the one mistake we refuse.
      htmlMatch(s.html, [
        /<[^>]+(?:id|name|class)=["'][^"']*captcha[^"']*["']/i,
        /friendly-?captcha|frc-captcha/i,
        /arkoselabs|funcaptcha/i,
        /geetest/i,
      ]) ?? anyMatch(s.frameUrls, [/captcha/i], "frame url"),
  },
];

/**
 * Returns the first challenge found, or null.
 *
 * Order matters only for message quality; ANY finding stops the submission.
 */
export function detectChallenge(snapshot: DomSnapshot): ChallengeFinding | null {
  for (const rule of RULES) {
    const evidence = rule.match(snapshot);
    if (evidence) {
      return {
        kind: rule.kind,
        detail:
          `Detected ${rule.label} on ${snapshot.url || "the submission page"}. ` +
          `We do not solve or evade challenges, so this submission is handed to you with ` +
          `the form data pre-assembled.`,
        evidence,
      };
    }
  }
  return null;
}

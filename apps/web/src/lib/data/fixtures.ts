import type {
  CompanyProfileField,
  DirectoryView,
  Launch,
  LaunchEvent,
  LaunchRow,
} from "./types";

/**
 * Phase 1 fixture data.
 *
 * Generated from seed/directories.json - the researched, evidence-backed catalog.
 * Tiers here are REAL: 0 Tier 1 (no public create-listing API was found anywhere),
 * 2 Tier 2, 21 Tier 3. Do not hand-edit; regenerate from the seed file.
 */

interface DirSpec {
  slug: string;
  name: string;
  host: string;
  submissionPath: string;
  tier: 1 | 2 | 3;
  method: "api" | "form" | "manual";
  captcha: boolean;
  category: string;
  dr: number | null;
  health?: "active" | "broken";
}

const SPECS: DirSpec[] = [
  // --- Tier 1: a real create-listing API -----------------------------------
  // (none) Research found no directory in this tier. See seed/directories.json.

  // --- Tier 2: plain HTML form, no challenge -------------------------------
  { slug: "the-startup-project", name: "The Startup Project", host: "startupproject.org", submissionPath: "/submit-startup/", tier: 2, method: "form", captcha: false, category: "startup", dr: null },
  { slug: "startup-collections", name: "Startup Collections", host: "startupcollections.com", submissionPath: "/submit/", tier: 2, method: "form", captcha: false, category: "startup", dr: null },

  // --- Tier 3: challenge, login wall, or a human reviewer ------------------
  { slug: "product-hunt", name: "Product Hunt", host: "www.producthunt.com", submissionPath: "/posts/new", tier: 3, method: "manual", captcha: true, category: "startup", dr: null },
  { slug: "alternativeto", name: "AlternativeTo", host: "alternativeto.net", submissionPath: "/manage/app/new/", tier: 3, method: "manual", captcha: true, category: "software", dr: null },
  { slug: "saashub", name: "SaaSHub", host: "www.saashub.com", submissionPath: "/services/submit", tier: 3, method: "manual", captcha: false, category: "saas", dr: null },
  { slug: "indie-hackers", name: "Indie Hackers", host: "www.indiehackers.com", submissionPath: "/products/new", tier: 3, method: "manual", captcha: false, category: "startup", dr: null },
  { slug: "theres-an-ai-for-that", name: "There's An AI For That", host: "theresanaiforthat.com", submissionPath: "/submit/", tier: 3, method: "manual", captcha: true, category: "ai", dr: null },
  { slug: "betalist", name: "BetaList", host: "betalist.com", submissionPath: "/submit", tier: 3, method: "manual", captcha: false, category: "startup", dr: null },
  { slug: "wellfound", name: "Wellfound (AngelList Talent)", host: "wellfound.com", submissionPath: "/company/new", tier: 3, method: "manual", captcha: true, category: "startup", dr: null },
  { slug: "about-me", name: "About.me", host: "about.me", submissionPath: "/signup", tier: 3, method: "manual", captcha: true, category: "profile", dr: null },
  { slug: "topai-tools", name: "TopAI.tools", host: "topai.tools", submissionPath: "/submit", tier: 3, method: "manual", captcha: false, category: "ai", dr: null },
  { slug: "peerlist", name: "Peerlist", host: "peerlist.io", submissionPath: "/signup", tier: 3, method: "manual", captcha: false, category: "startup", dr: null },
  { slug: "launching-next", name: "Launching Next", host: "www.launchingnext.com", submissionPath: "/submit/", tier: 3, method: "manual", captcha: true, category: "startup", dr: null },
  { slug: "future-tools", name: "Future Tools", host: "futuretools.io", submissionPath: "/submit-a-tool", tier: 3, method: "manual", captcha: true, category: "ai", dr: null },
  { slug: "uneed", name: "Uneed", host: "www.uneed.best", submissionPath: "/submit-a-tool", tier: 3, method: "manual", captcha: true, category: "saas", dr: null },
  { slug: "startup-stash", name: "Startup Stash", host: "startupstash.com", submissionPath: "/add-listing/", tier: 3, method: "manual", captcha: true, category: "startup", dr: null },
  { slug: "killer-startups", name: "KillerStartups", host: "killerstartups.com", submissionPath: "/submit-startup/", tier: 3, method: "manual", captcha: true, category: "startup", dr: null },
  { slug: "openalternative", name: "OpenAlternative", host: "openalternative.co", submissionPath: "/submit", tier: 3, method: "manual", captcha: false, category: "software", dr: null },
  { slug: "startupbase", name: "StartupBase", host: "startupbase.io", submissionPath: "/submit", tier: 3, method: "manual", captcha: false, category: "startup", dr: null },
  { slug: "fazier", name: "Fazier", host: "fazier.com", submissionPath: "/submit", tier: 3, method: "manual", captcha: false, category: "startup", dr: null },
  { slug: "startup-fast", name: "Startup Fast", host: "www.startupfa.st", submissionPath: "/submit", tier: 3, method: "manual", captcha: false, category: "startup", dr: null },
  { slug: "softwaresuggest", name: "SoftwareSuggest", host: "www.softwaresuggest.com", submissionPath: "/vendors", tier: 3, method: "manual", captcha: false, category: "saas", dr: null },
  { slug: "aitools-inc", name: "AI Tools (aitools.inc)", host: "aitools.inc", submissionPath: "/submit", tier: 3, method: "manual", captcha: false, category: "ai", dr: null },

];

function toDirectory(spec: DirSpec): DirectoryView {
  const requirements = CATALOG_REQUIREMENTS[spec.slug] ?? NO_REQUIREMENTS;
  return {
    slug: spec.slug,
    requires_consent: requirements.requiresConsent,
    requires_profile_fields: requirements.profileFields,
    name: spec.name,
    url: `https://${spec.host}`,
    submission_url: `https://${spec.host}${spec.submissionPath}`,
    tier: spec.tier,
    submission_method: spec.method,
    requires_captcha: spec.captcha,
    category: spec.category,
    domain_rating: spec.dr,
    health: spec.health ?? "active",
  };
}

/**
 * Per-directory requirements that live OUTSIDE the submission payload.
 *
 * Keyed by slug and taken verbatim from seed/directories.json, because
 * `SUBMISSION_SELECT` does not embed `requires_consent` or
 * `requires_profile_fields`. Without this map a Supabase-backed row would lose
 * the one fact that decides whether a directory can run at all.
 *
 * `terms` is the page whose terms we ask the founder to agree to. It is the
 * directory's own page - we do not paraphrase someone else's terms and we do
 * not host a copy that could go stale.
 */
export interface DirectoryRequirements {
  /** The directory's form carries a terms checkbox we may not tick unasked. */
  requiresConsent: boolean;
  /** Where those terms are published. Null when the directory has none. */
  termsUrl: string | null;
  /** What the founder is agreeing to, in our words, naming the directory. */
  consentStatement: string | null;
  /** Company-profile fields the directory requires beyond a product listing. */
  profileFields: readonly CompanyProfileField[];
  /** Why it asks. Shown next to the upgrade path, never as an error. */
  profileReason: string | null;
}

const NO_REQUIREMENTS: DirectoryRequirements = {
  requiresConsent: false,
  termsUrl: null,
  consentStatement: null,
  profileFields: [],
  profileReason: null,
};

export const CATALOG_REQUIREMENTS: Record<string, DirectoryRequirements> = {
  "the-startup-project": {
    requiresConsent: true,
    termsUrl: "https://startupproject.org/submit-startup/",
    consentStatement:
      "The Startup Project's submission form has a required consent checkbox. Ticking it means you agree to their terms and to your listing being reviewed and published under your name and email. We will not tick it for you.",
    profileFields: [],
    profileReason: null,
  },
  softwaresuggest: {
    requiresConsent: false,
    termsUrl: null,
    consentStatement: null,
    profileFields: ["phone", "employee_count", "customer_count", "competitors"],
    profileReason:
      "SoftwareSuggest's vendor form is a sales-qualification wizard, not a product listing. It asks for a phone number, headcount, customer count and competitors - none of which are in a product listing, and none of which we will guess on your behalf.",
  },
};

export function requirementsFor(directory: {
  slug: string;
  requires_consent?: boolean;
  requires_profile_fields?: readonly CompanyProfileField[];
}): DirectoryRequirements {
  const catalog = CATALOG_REQUIREMENTS[directory.slug] ?? NO_REQUIREMENTS;
  return {
    ...catalog,
    // A row that carries the columns wins over the static catalog, so a
    // directory changing its form is a row update rather than a deploy.
    requiresConsent: directory.requires_consent ?? catalog.requiresConsent,
    profileFields: directory.requires_profile_fields ?? catalog.profileFields,
  };
}

/** Human labels for the optional company-profile step. */
export const PROFILE_FIELD_LABEL: Record<CompanyProfileField, string> = {
  phone: "Phone number",
  employee_count: "Employee count",
  customer_count: "Customer count",
  competitors: "Competitors",
  founded_year: "Year founded",
};

/** Every directory we know about, for the landing page ledger. */
export const ALL_DIRECTORIES: DirectoryView[] = SPECS.map(toDirectory);

export const FIXTURE_APP = {
  id: "app_7f3c2a10",
  name: "Pagecrest",
  tagline: "Turn your changelog into a weekly customer email",
  url: "https://pagecrest.io",
  category: "Developer tools",
  contact_email: "hana@pagecrest.io",
  founder_name: "Hana Okonkwo",
};

/** The one launch the fixture dashboard renders. */
export const FIXTURE_LAUNCH_ID = "launch_2f9d41";

/**
 * Where each row STARTS when the dashboard loads. The board is deliberately
 * mid-flight: some rows are already done, several are still queued, so the
 * queued -> running -> terminal transition plays within seconds of arriving
 * without any of it gating first paint.
 */
export const OPENING_STATE: Record<
  string,
  { status: LaunchRow["status"]; detail: string; result?: string }
> = {
  // --- Tier 2: the only two we submit to end to end ------------------------
  "the-startup-project": { status: "succeeded", detail: "Form filled and submitted. You agreed to their terms before the run.", result: "https://startupproject.org/startup/pagecrest/" },
  "startup-collections": { status: "running", detail: "Filling the submission form." },

  // --- Tier 3: terminal on arrival. The payload is built and waiting. ------
  // Each reason is the one actually recorded in seed/directories.json.
  "product-hunt": { status: "needs_manual", detail: "Payload ready. Cloudflare challenge, and the public API cannot create posts." },
  alternativeto: { status: "needs_manual", detail: "Payload ready. Cloudflare challenge on the submission page." },
  saashub: { status: "needs_manual", detail: "Payload ready. The submit flow needs a signed-in account." },
  "indie-hackers": { status: "needs_manual", detail: "Payload ready. Product pages require a signed-in account." },
  "theres-an-ai-for-that": { status: "needs_manual", detail: "Payload ready. Cloudflare challenge on the submission page." },
  betalist: { status: "needs_manual", detail: "Payload ready. Submission is gated behind a signed-in account." },
  wellfound: { status: "needs_manual", detail: "Payload ready. Wellfound serves a security check." },
  "about-me": { status: "needs_manual", detail: "Payload ready. The form carries both reCAPTCHA and hCaptcha." },
  "topai-tools": { status: "needs_manual", detail: "Payload ready. The page has no submission form." },
  peerlist: { status: "needs_manual", detail: "Payload ready. There is no anonymous submission URL." },
  "launching-next": { status: "needs_manual", detail: "Payload ready. Cloudflare challenge on the submission page." },
  "future-tools": { status: "needs_manual", detail: "Payload ready. Turnstile is injected after the page renders." },
  uneed: { status: "needs_manual", detail: "Payload ready. Cloudflare Turnstile on the form." },
  "startup-stash": { status: "needs_manual", detail: "Payload ready. CAPTCHA on the listing form." },
  "killer-startups": { status: "needs_manual", detail: "Payload ready. CAPTCHA on the submission form." },
  openalternative: { status: "needs_manual", detail: "Payload ready. Submission redirects to a login wall." },
  startupbase: { status: "needs_manual", detail: "Payload ready. Submission redirects to a login wall." },
  fazier: { status: "needs_manual", detail: "Payload ready. The page renders no submission form to fill." },
  "startup-fast": { status: "needs_manual", detail: "Payload ready. The page renders no submission form." },
  softwaresuggest: { status: "needs_manual", detail: "Payload ready. Needs company details - complete your profile to unlock this one." },
  "aitools-inc": { status: "needs_manual", detail: "Payload ready. The free tier sits in a 30-90 day review queue." },
};

const START = Date.parse("2026-08-24T09:14:00.000Z");

export function buildFixtureLaunch(): Launch {
  return {
    id: FIXTURE_LAUNCH_ID,
    app: FIXTURE_APP,
    status: "launching",
    started_at: new Date(START).toISOString(),
    rows: SPECS.map((spec, i) => {
      const opening = OPENING_STATE[spec.slug] ?? { status: "queued" as const, detail: "Waiting for a worker." };
      return {
        id: `sub_${spec.slug.replace(/-/g, "_")}`,
        directory: toDirectory(spec),
        status: opening.status,
        result_url: opening.result ?? null,
        detail: opening.detail,
        attempt: opening.status === "failed" ? 2 : 0,
        updated_at: new Date(START + i * 4200).toISOString(),
      } satisfies LaunchRow;
    }),
  };
}

export function buildFixtureEvents(launch: Launch): LaunchEvent[] {
  const seed: Array<{ slug: string; kind: LaunchEvent["kind"]; message: string }> = [
    { slug: "the-startup-project", kind: "queued", message: "Queued for the Startup Project submission form." },
    { slug: "the-startup-project", kind: "started", message: "Opened the form. Left the fax_number honeypot empty." },
    { slug: "the-startup-project", kind: "field_filled", message: "Filled 6 fields plus your founder name, and ticked consent because you agreed to their terms." },
    { slug: "the-startup-project", kind: "submitted", message: "Submitted. Waiting on their success string." },
    { slug: "the-startup-project", kind: "succeeded", message: "“Your startup has been submitted!” - listing accepted for review." },
    { slug: "product-hunt", kind: "manual_required", message: "Cloudflare challenge, and the public API cannot create posts. Payload assembled for you." },
    { slug: "softwaresuggest", kind: "manual_required", message: "Needs phone, employee count, customer count and competitors. Add them to your profile and we can run this one." },
    { slug: "future-tools", kind: "challenge_detected", message: "Turnstile injected after render. Stopped - we do not solve challenges." },
    { slug: "fazier", kind: "manual_required", message: "The page renders no submission form to fill. Prepared for you instead." },
    { slug: "startup-collections", kind: "started", message: "Opened the submission form." },
  ];

  return seed.map((e, i) => {
    // Every slug above is asserted against SPECS by fixtures.test.ts, so an
    // event for a directory we no longer carry fails a test rather than
    // throwing at render.
    const row = launch.rows.find((r) => r.directory.slug === e.slug);
    if (!row) return null;
    return {
      id: `evt_seed_${i}`,
      submission_id: row.id,
      directory_slug: row.directory.slug,
      directory_name: row.directory.name,
      kind: e.kind,
      message: e.message,
      at: new Date(START + i * 5100).toISOString(),
    } satisfies LaunchEvent;
  }).filter((e): e is LaunchEvent => e !== null);
}

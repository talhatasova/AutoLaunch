/**
 * Seeds public.directories from seed/directories.json.
 *
 * Ready to run as soon as the directory-research agent produces the seed file.
 * It is deliberately NOT a migration: the catalog is living reference data that gets
 * re-verified and re-seeded, and baking rows into migration history would mean every
 * correction to a directory's form selectors was a schema change.
 *
 * Idempotent - upserts on `slug`, so re-running after a re-verification pass updates the
 * existing rows in place rather than duplicating them. Existing `id`s are preserved,
 * which matters because submissions reference directories by id.
 *
 * Runs under the SERVICE ROLE and so bypasses RLS. public.directories has a public SELECT
 * policy and no write policy at all; this script is the only writer.
 *
 * Run: pnpm seed:directories
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { seedFileSchema } from "../packages/shared/src/directory";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. See .env.example."
  );
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = resolve(here, "../seed/directories.json");

let raw: string;
try {
  raw = readFileSync(seedPath, "utf8");
} catch {
  console.error(`No seed file at ${seedPath}. Run the directory-research agent first.`);
  process.exit(1);
}

// Validate before writing. The tier invariants are also CHECK constraints on the table,
// so a bad row would be rejected by Postgres anyway - but failing here names the offending
// slug and field instead of surfacing a constraint violation.
const parsed = seedFileSchema.safeParse(JSON.parse(raw));
if (!parsed.success) {
  console.error("seed/directories.json is INVALID - refusing to seed:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

const rows = parsed.data.map((d) => ({
  slug: d.slug,
  name: d.name,
  url: d.url,
  submission_url: d.submission_url,
  tier: d.tier,
  submission_method: d.submission_method,
  requires_captcha: d.requires_captcha,
  category: d.category,
  domain_rating: d.domain_rating,
  api_config: d.api_config,
  form_schema: d.form_schema,
  // Both are consumed by apps/worker: requires_consent gates the terms checkbox (never
  // ticked without an explicit per-directory grant) and requires_profile_fields decides
  // whether the directory is automatable yet or stays needs_manual.
  requires_consent: d.requires_consent,
  requires_profile_fields: d.requires_profile_fields,
  evidence: d.evidence,
  // The evidence block records when we last actually looked at the site.
  last_verified_at: d.evidence.checked_at,
  status: d.status,
  price_kind: d.price_kind,
  price_note: d.price_note,
  price_source_url: d.price_source_url,
  price_checked_at: d.price_checked_at,
  obligation: d.obligation,
  terms_url: d.terms_url,
}));

if (rows.length === 0) {
  console.error("Seed file is empty - nothing to do.");
  process.exit(1);
}

const res = await fetch(
  `${SUPABASE_URL}/rest/v1/directories?on_conflict=slug`,
  {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      // merge-duplicates = upsert on the slug unique constraint.
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  }
);

if (!res.ok) {
  console.error(`Seed failed: ${res.status} ${res.statusText}`);
  console.error(await res.text());
  process.exit(1);
}

const written = (await res.json()) as Array<{ slug: string; tier: number }>;
const byTier = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
for (const d of written) byTier[d.tier]++;

console.log(`Seeded ${written.length} directories.`);
console.log(`  Tier 1 (API):    ${byTier[1]}`);
console.log(`  Tier 2 (form):   ${byTier[2]}`);
console.log(`  Tier 3 (manual): ${byTier[3]}`);

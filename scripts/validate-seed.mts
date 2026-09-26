/**
 * Validates seed/directories.json against the shared zod contract.
 *
 * This exists because the tier rules are the product's ethical guarantees expressed as
 * data: requires_captcha implies tier 3, tier 2 must carry a form_schema, tier 3 must
 * carry no automation config. A seed file that violates those would let the worker try to
 * automate something we promised not to. Catch it here, not at runtime.
 *
 * Run: pnpm validate:seed
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { seedFileSchema } from "../packages/shared/src/directory";

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = resolve(here, "../seed/directories.json");

let raw: string;
try {
  raw = readFileSync(seedPath, "utf8");
} catch {
  console.error(`No seed file at ${seedPath}. Run the directory-research agent first.`);
  process.exit(1);
}

const parsed = seedFileSchema.safeParse(JSON.parse(raw));

if (!parsed.success) {
  console.error("seed/directories.json is INVALID:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

const dirs = parsed.data;
const byTier = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>;
for (const d of dirs) byTier[d.tier]++;

// A directory marked as needing a CAPTCHA that is not tier 3 would mean we intend to
// automate past a challenge. The schema blocks it; assert again here so the guarantee is
// visible in output rather than buried in a refinement.
const violations = dirs.filter((d) => d.requires_captcha && d.tier !== 3);
if (violations.length > 0) {
  console.error(`CAPTCHA-gated directories not marked tier 3: ${violations.map((d) => d.slug).join(", ")}`);
  process.exit(1);
}

console.log(`seed/directories.json OK - ${dirs.length} directories`);
console.log(`  Tier 1 (API):    ${byTier[1]}`);
console.log(`  Tier 2 (form):   ${byTier[2]}`);
console.log(`  Tier 3 (manual): ${byTier[3]}`);
console.log(`  Automatable now: ${byTier[1] + byTier[2]}`);

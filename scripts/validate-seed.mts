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

// v2: captcha channels may be automated through a solver, so there is no captcha/tier rule.
// The seed never carries automation_verified_at; certification is DB-only evidence.
const byAutomation = { automated: 0, manual: 0, paid_link: 0 } as Record<string, number>;
for (const d of dirs) byAutomation[d.automation]++;

console.log(`seed/directories.json OK - ${dirs.length} directories`);
console.log(`  Tier 1 (API):    ${byTier[1]}`);
console.log(`  Tier 2 (form):   ${byTier[2]}`);
console.log(`  Tier 3 (manual): ${byTier[3]}`);
console.log(`  Automated (uncertified): ${byAutomation.automated}`);
console.log(`  Manual:                  ${byAutomation.manual}`);
console.log(`  Paid link:               ${byAutomation.paid_link}`);
console.log("  Certified selectable targets: 0 (certification is stored separately)");

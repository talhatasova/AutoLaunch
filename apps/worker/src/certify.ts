/**
 * Operator certification CLI (ticket 08).
 *
 *   pnpm --filter worker certify <slug> [--send] [--payload <json-file>]
 *
 * Loads the channel from seed/directories.json (no DB) and runs the REAL Tier 2 driver
 * against the live site through PlaywrightPool and its network guard. Default is a dry run:
 * the driver fills the form and the reporter stops it at the submit boundary, before the
 * click. `--send` lets the click happen and prints the certification SQL for an operator to
 * run by hand. This script never writes to a database.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { directorySchema, submissionPayloadSchema } from "@directorylaunch/shared";
import type { SubmissionOutcome } from "@directorylaunch/shared";
import { parseFormSchema } from "./drivers/form-schema";
import type { FormSchema } from "./drivers/form-schema";
import { parseRecipe } from "./drivers/recipe";
import { UNCONFIRMED_REASON } from "./drivers/success";
import { Tier2FormDriver } from "./drivers/tier2-form";
import type { DriverReporter, SubmissionContext } from "./drivers/types";
import { PlaywrightPool } from "./net/browser";
import type { SessionPage } from "./net/browser";

const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(workerDir, "certify/out");

class DryRunStop extends Error {}

function usage(msg: string): never {
  console.error(`${msg}\nusage: pnpm --filter worker certify <slug> [--send] [--payload <json-file>]`);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  let slug: string | undefined;
  let send = false;
  let payloadPath = resolve(workerDir, "certify/beyondelo.json");
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--send") send = true;
    else if (a === "--payload") payloadPath = resolve(argv[++i] ?? usage("--payload needs a file"));
    else if (a.startsWith("--")) usage(`unknown flag ${a}`);
    else slug = a;
  }
  return { slug: slug ?? usage("missing <slug>"), send, payloadPath };
}

/** What the filled form actually holds, read back from the live DOM at the submit boundary. */
async function formReport(page: SessionPage, schema: FormSchema): Promise<void> {
  const known = [
    ...schema.fields.map((f) => ({ selector: f.selector, what: `payload.${f.payload_key}` })),
    ...schema.extra_fields.map((f) => ({ selector: f.selector, what: `extra:${f.source}${f.value ? `=${f.value}` : ""}` })),
  ];
  // tsx (esbuild keepNames) wraps named inner functions in __name(); define it in the page.
  await page.page.evaluate("globalThis.__name = (f) => f");
  const rows = await page.page.evaluate(
    ({ known, honeypots, submit }) => {
      const read = (el: Element | null): string => {
        if (!el) return "(absent)";
        if (el instanceof HTMLInputElement && el.type === "checkbox") return el.checked ? "[x] checked" : "[ ] unchecked";
        if (el instanceof HTMLSelectElement) return `${el.value} (${el.selectedOptions[0]?.text.trim() ?? ""})`;
        return (el as HTMLInputElement).value ?? "";
      };
      const mapped = known.map((k) => ({ ...k, value: read(document.querySelector(k.selector)) }));
      const traps = honeypots.map((h) => ({ selector: h, value: read(document.querySelector(h)) }));
      const form = document.querySelector(submit)?.closest("form");
      const claimed = [...known.map((k) => k.selector), ...honeypots];
      const unmapped = Array.from(form?.querySelectorAll("input,select,textarea") ?? [])
        .filter((el) => (el as HTMLInputElement).type !== "hidden")
        .filter((el) => !claimed.some((s) => el.matches(s)))
        .map((el) => {
          const id = el.id ? `#${el.id}` : `[name="${el.getAttribute("name") ?? ""}"]`;
          const label = (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()) || el.getAttribute("placeholder") || "";
          const required = (el as HTMLInputElement).required || /\*\s*$/.test(label);
          return { selector: id, label, required };
        });
      return { mapped, traps, unmapped };
    },
    { known, honeypots: schema.honeypots, submit: schema.submit_selector },
  );
  console.log("\nFIELD REPORT (live DOM at the submit boundary)");
  for (const r of rows.mapped) console.log(`  ${r.selector}  <-  ${r.what}  =  ${JSON.stringify(r.value)}`);
  console.log("Honeypots (must be empty, never filled):");
  for (const t of rows.traps) console.log(`  ${t.selector}  =  ${JSON.stringify(t.value)}`);
  if (rows.traps.length === 0) console.log("  (none declared)");
  console.log("Consent boxes:");
  const consent = schema.extra_fields.filter((f) => f.source === "consent");
  for (const c of consent) console.log(`  ${c.selector}  ticked under the operator's consent grant (certification run)`);
  if (consent.length === 0) console.log("  (none)");
  console.log("Unmapped controls in the form:");
  for (const u of rows.unmapped) console.log(`  ${u.required ? "REQUIRED " : "optional "} ${u.selector}  ${u.label}`);
  if (rows.unmapped.length === 0) console.log("  (none)");
  if (rows.unmapped.some((u) => u.required)) console.log("  WARNING: a required control is unmapped; a real send would be rejected.");
}

function verdict(outcome: SubmissionOutcome): "receipt" | "unconfirmed" | "failed" {
  if (outcome.kind === "succeeded") return "receipt";
  if (outcome.kind === "manual_required" && outcome.detail.startsWith(UNCONFIRMED_REASON)) return "unconfirmed";
  return "failed";
}

async function main() {
  const { slug, send, payloadPath } = parseArgs(process.argv.slice(2));
  const seed = JSON.parse(readFileSync(resolve(workerDir, "../../seed/directories.json"), "utf8")) as Array<{ slug: string }>;
  const row = seed.find((d) => d.slug === slug) ?? usage(`no directory "${slug}" in seed/directories.json`);
  const directory = directorySchema.parse(row);
  const recipe = parseRecipe(directory.recipe, slug);
  if (recipe?.social || directory.needs_platform_account) {
    // Those paths need DB-held platform credentials; the CLI stays DB-free.
    usage(`${slug} needs a social post or platform account; this CLI certifies anonymous form channels only.`);
  }
  const formSchemaRaw = recipe?.form ?? directory.form_schema;
  const parsed = parseFormSchema(formSchemaRaw);
  if (!parsed.ok) usage(`${slug}: form_schema invalid: ${parsed.error}`);
  const schema = parsed.value;

  const frozen = submissionPayloadSchema.parse(JSON.parse(readFileSync(payloadPath, "utf8")));
  // Mirrors approved-runner contextFor(): no inbox here, so email fields get public_contact_email.
  const ctx: SubmissionContext = {
    submission_id: `certify-${slug}`,
    directory: {
      ...directory,
      form_schema: schema,
      requires_captcha: directory.requires_captcha || directory.challenge_kind !== "none",
    },
    payload: { ...frozen, contact_email: frozen.contact_email ?? frozen.public_contact_email },
    // The operator certifying with the team's own product is the consenting founder.
    consent: { directory_slug: slug, granted_at: new Date().toISOString() },
  };

  mkdirSync(outDir, { recursive: true });
  const filledPng = resolve(outDir, `${slug}-filled.png`);
  const resultPng = resolve(outDir, `${slug}-result.png`);
  console.log(`${send ? "SEND" : "DRY RUN"}: ${directory.name} -> ${directory.submission_url}`);

  const pool = new PlaywrightPool({
    userAgent: process.env.SCRAPER_USER_AGENT ?? "DirectoryLaunchBot/1.0 (+https://xxx.com/bot)",
    headless: true,
    navigationTimeoutMs: 30_000,
  });
  let page: SessionPage | null = null;
  let reachedSubmit = false;
  let dryRunStopped = false;
  const reporter: DriverReporter = {
    async submitAttempted() {
      reachedSubmit = true;
      await page!.page.screenshot({ path: filledPng, fullPage: true });
      console.log(`Screenshot of filled form: ${filledPng}`);
      await formReport(page!, schema);
      if (!send) {
        // Actionability check without clicking: catches a submit button that is off-screen,
        // covered, or inside a closed popup, which would only surface on a real send.
        await page!.page.locator(schema.submit_selector).first().click({ trial: true, timeout: 5_000 });
        console.log(`Submit control ${schema.submit_selector} is clickable (trial click, nothing sent).`);
        dryRunStopped = true;
        throw new DryRunStop("dry run: stopped before clicking submit");
      }
      console.log(`\nClicking ${schema.submit_selector} ...`);
    },
    async fieldFilled(selector, key) { console.log(`  filled ${key} -> ${selector}`); },
    async submitted(detail) { console.log(detail); },
    async note(_kind, message, payload) { console.log(message, payload ? JSON.stringify(payload) : ""); },
  };
  const openPage = async () => {
    const p = await pool.newPage();
    const close = p.close.bind(p);
    // The driver closes the page in its finally; capture the post-submit state first.
    p.close = async () => {
      if (send && reachedSubmit) {
        await p.page.screenshot({ path: resultPng, fullPage: true }).catch((e) => console.error(`result screenshot failed: ${e}`));
        console.log(`Screenshot of result: ${resultPng}`);
      }
      await close();
    };
    page = p;
    return p;
  };

  let outcome: SubmissionOutcome;
  try {
    outcome = await new Tier2FormDriver(openPage).run(ctx, reporter);
  } finally {
    await pool.shutdown();
  }

  if (!send) {
    if (dryRunStopped) {
      console.log("\nDRY RUN OK: challenge scan clean, every mapped field filled, honeypots empty. Submit NOT clicked.");
      return;
    }
    console.error(`\nDRY RUN FAILED ${reachedSubmit ? "at" : "before"} the submit boundary: ${outcome.kind} - ${"detail" in outcome ? outcome.detail : ""}`);
    process.exit(1);
  }

  const v = verdict(outcome);
  console.log(`\nRESULT: ${v.toUpperCase()} (${outcome.kind})${"detail" in outcome ? ` - ${outcome.detail}` : ""}`);
  if (outcome.kind === "succeeded") console.log(`Observed URL: ${outcome.result_url ?? "(none)"}`);
  if (v === "failed") process.exit(1);
  const sql = `update public.directories set automation_verified_at = now(), last_verified_at = now(), receipt_verified = true where slug = '${slug}';`;
  console.log(v === "receipt"
    ? "\nOperator: record the evidence, then run against the production DB:"
    : "\nOperator: confirm the receipt by hand first (inbox / site). If it landed, fix success_signal and run:");
  console.log(`  ${sql}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

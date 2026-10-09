import { certifiedDirectories, recordRecheck } from "../db/repository";
import type { Db } from "../db/repository";
import { detectChallenge } from "../drivers/challenge";
import { parseFormSchema } from "../drivers/form-schema";
import { openPlatformPage } from "../drivers/platform-session";
import { parseRecipe } from "../drivers/recipe";
import { log } from "../logger";
import { PlaywrightPool } from "../net/browser";
import { DomainRateLimiter } from "../net/rate-limit";

export async function recheckCertifiedTargets(db: Db, pool: PlaywrightPool, limiter: DomainRateLimiter) {
  const dueBefore = Date.now() - 7 * 86400000;
  for (const row of await certifiedDirectories(db)) {
    if (row.status !== "active" || (row.automation_checked_at && row.automation_checked_at.getTime() > dueBefore)) continue;
    const rlog = log.child({ directory: row.slug });
    let note = "Form and challenge scan passed. Site rules still require editorial verification.";
    let broken = false;
    try {
      const recipe = parseRecipe(row.recipe, row.slug);
      if (recipe?.social) {
        note = "API channel: verified on each post, no form to scan.";
      } else {
        await limiter.run(row.submission_url, async () => {
          const page = row.needs_platform_account
            ? await openPlatformPage(db, pool, row.id, row.url, recipe?.login, async (message) => rlog.info(message))
            : await pool.newPage();
          try {
            const response = await page.goto(row.submission_url);
            if (response.status === null || response.status >= 400) throw new Error(`HTTP ${response.status}`);
            const challenge = detectChallenge(await page.snapshot());
            if (challenge) {
              if (!row.requires_captcha && row.challenge_kind === "none") throw new Error(`Unexpected challenge: ${challenge.kind}`);
              note = `Catalogued challenge present (${challenge.kind}); submissions resolve needs_manual.`;
              return;
            }
            const schema = parseFormSchema(recipe?.form ?? row.form_schema);
            if (!schema.ok) throw new Error(`Invalid form mapping: ${schema.error}`);
            for (const field of schema.value.fields.filter((field) => field.required)) {
              if (!await page.exists(field.selector)) throw new Error(`Missing required field: ${field.selector}`);
            }
            if (!await page.exists(schema.value.submit_selector)) throw new Error("Missing submit control");
          } finally {
            await page.close();
          }
        });
      }
    } catch (cause) {
      note = cause instanceof Error ? cause.message : String(cause);
      broken = true;
    }
    if (!row.last_verified_at || row.last_verified_at.getTime() <= dueBefore) {
      note += " Editorial site-rule review is overdue; this target cannot be selected.";
      rlog.warn("editorial certification is overdue");
    }
    rlog.info("recheck finished", { broken, note });
    await recordRecheck(db, row.id, note, broken);
  }
}

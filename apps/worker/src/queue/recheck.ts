import type { SupabaseClient } from "@supabase/supabase-js";
import { detectChallenge } from "../drivers/challenge";
import { parseFormSchema } from "../drivers/form-schema";
import { PlaywrightPool } from "../net/browser";
import { DomainRateLimiter } from "../net/rate-limit";

export async function recheckCertifiedTargets(db: SupabaseClient, pool: PlaywrightPool, limiter: DomainRateLimiter) {
  const { data, error } = await db.from("directories").select("id,name,submission_url,form_schema,status,automation_verified_at,automation_checked_at")
    .not("automation_verified_at", "is", null);
  if (error) throw new Error(`Could not load certified targets: ${error.message}`);
  const dueBefore = Date.now() - 7 * 86400000;
  for (const row of data ?? []) {
    if (row.status !== "active" || (row.automation_checked_at && Date.parse(row.automation_checked_at) > dueBefore)) continue;
    let note = "Form and challenge scan passed. Price and site rules still require editorial verification.";
    let broken = false;
    try {
      await limiter.run(row.submission_url, async () => {
        const page = await pool.newPage();
        try {
          const response = await page.goto(row.submission_url);
          if (response.status === null || response.status >= 400) throw new Error(`HTTP ${response.status}`);
          const challenge = detectChallenge(await page.snapshot());
          if (challenge) throw new Error(`Challenge: ${challenge.kind}`);
          const schema = parseFormSchema(row.form_schema);
          if (!schema.ok) throw new Error(`Invalid form mapping: ${schema.error}`);
          for (const field of schema.value.fields.filter((field) => field.required)) {
            if (!await page.exists(field.selector)) throw new Error(`Missing required field: ${field.selector}`);
          }
          if (!await page.exists(schema.value.submit_selector)) throw new Error("Missing submit control");
        } finally {
          await page.close();
        }
      });
    } catch (cause) {
      note = cause instanceof Error ? cause.message : String(cause);
      broken = true;
    }
    const { error: updateError } = await db.from("directories").update({
      automation_checked_at: new Date().toISOString(), automation_check_note: note,
      ...(broken ? { status: "broken" } : {}),
    }).eq("id", row.id);
    if (updateError) throw new Error(`Could not record recheck for ${row.name}: ${updateError.message}`);
  }
}

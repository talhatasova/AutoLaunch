import { createServiceClient } from "./db/client";
import { PlaywrightPool } from "./net/browser";
import { DomainRateLimiter } from "./net/rate-limit";
import { runApprovedJob } from "./queue/approved-runner";
import { recheckCertifiedTargets } from "./queue/recheck";

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

  const db = createServiceClient(url, key);
  const pool = new PlaywrightPool({
    userAgent: process.env.SCRAPER_USER_AGENT ?? "DirectoryLaunchBot/1.0 (+https://xxx.com/bot)",
    headless: true,
    navigationTimeoutMs: 30_000,
  });
  const limiter = new DomainRateLimiter(5_000);
  let stopping = false;
  let lastRecheck = 0;
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });

  try {
    while (!stopping) {
      if (Date.now() - lastRecheck > 60 * 60 * 1000) {
        await recheckCertifiedTargets(db, pool, limiter);
        lastRecheck = Date.now();
      }
      const { data, error } = await db.rpc("claim_submission_job");
      if (error) throw new Error(`Could not claim submission job: ${error.message}`);
      const job = data?.[0];
      if (job) {
        try {
          await runApprovedJob(db, job, pool, limiter);
        } catch (cause) {
          // A claimed job is never automatically reclaimed. After a crash or
          // ambiguous send, an operator must investigate before any retry.
          console.error("Claimed submission needs investigation", job.submission_id, cause);
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
    }
  } finally {
    await pool.shutdown();
  }
}

main().catch((error) => {
  console.error("Worker stopped", error);
  process.exitCode = 1;
});

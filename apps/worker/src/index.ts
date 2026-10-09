import { createDb } from "./db/client";
import { claimJob } from "./db/repository";
import { encryptionKey } from "./crypto";
import { inboxConfigured } from "./inbox/inbox";
import { runLiveChecks } from "./live/detector";
import { describeError, log } from "./logger";
import { PlaywrightPool } from "./net/browser";
import { DomainRateLimiter } from "./net/rate-limit";
import { runApprovedJob } from "./queue/approved-runner";
import { recheckCertifiedTargets } from "./queue/recheck";

const HOUR_MS = 60 * 60 * 1000;
const LIVE_CHECK_EVERY_MS = 15 * 60 * 1000;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  // Optional services degrade with a warning instead of crashing the worker.
  try {
    encryptionKey();
  } catch (cause) {
    log.warn("platform accounts disabled", describeError(cause));
  }
  if (!inboxConfigured()) log.warn("platform inbox disabled: PLATFORM_INBOX_ADDRESS / PLATFORM_INBOX_APP_PASSWORD not set");

  const userAgent = process.env.SCRAPER_USER_AGENT ?? "DirectoryLaunchBot/1.0 (+https://xxx.com/bot)";
  const { db, close } = createDb(databaseUrl);
  const pool = new PlaywrightPool({ userAgent, headless: true, navigationTimeoutMs: 30_000 });
  const limiter = new DomainRateLimiter(5_000);
  let stopping = false;
  let lastRecheck = 0;
  let lastLiveCheck = 0;
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });
  log.info("worker started");

  try {
    while (!stopping) {
      if (Date.now() - lastRecheck > HOUR_MS) {
        await recheckCertifiedTargets(db, pool, limiter);
        lastRecheck = Date.now();
      }
      if (Date.now() - lastLiveCheck > LIVE_CHECK_EVERY_MS) {
        await runLiveChecks(db, limiter, userAgent);
        lastLiveCheck = Date.now();
      }
      const job = await claimJob(db);
      if (job) {
        log.info("job claimed", { job_id: job.job_id, submission_id: job.submission_id });
        try {
          await runApprovedJob(db, job, pool, limiter);
        } catch (cause) {
          // A claimed job is never automatically reclaimed. After a crash or
          // ambiguous send, an operator must investigate before any retry.
          log.error("claimed submission needs investigation", { job_id: job.job_id, submission_id: job.submission_id, ...describeError(cause) });
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
    }
  } finally {
    await pool.shutdown();
    await close();
  }
}

main().catch((error) => {
  log.error("worker stopped", describeError(error));
  process.exitCode = 1;
});

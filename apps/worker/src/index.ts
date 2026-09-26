import { createServiceClient } from "./db/client";
import { EventRecorder } from "./db/events";
import { Repository } from "./db/repository";
import { Tier1ApiDriver } from "./drivers/tier1-api";
import { Tier2FormDriver } from "./drivers/tier2-form";
import { Tier3ManualDriver } from "./drivers/tier3-manual";
import { loadEnv, safeDatabaseTarget } from "./env";
import { describeError, log } from "./logger";
import { PlaywrightPool } from "./net/browser";
import { DomainRateLimiter } from "./net/rate-limit";
import { createBoss, registerWorker, scheduleRetry } from "./queue/boss";
import { processSubmission } from "./queue/process";

/**
 * Worker entrypoint.
 *
 * Boots in the order that fails fastest and loudest: environment (including the
 * session-mode DATABASE_URL assertion) before anything opens a connection, browser last
 * because it is the expensive one.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  log.info("worker starting", {
    database: safeDatabaseTarget(env.DATABASE_URL),
    database_port: env.databasePort,
    user_agent: env.SCRAPER_USER_AGENT,
    concurrency: env.WORKER_CONCURRENCY,
  });

  const db = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const repo = new Repository(db);
  const limiter = new DomainRateLimiter(env.RATE_LIMIT_PER_DOMAIN_MS);

  const pool = new PlaywrightPool({
    userAgent: env.SCRAPER_USER_AGENT,
    headless: env.HEADLESS,
    navigationTimeoutMs: env.NAVIGATION_TIMEOUT_MS,
  });

  const drivers = {
    tier1: new Tier1ApiDriver({
      fetchImpl: (url, init) => fetch(url, init),
      userAgent: env.SCRAPER_USER_AGENT,
      secretLookup: (key) => process.env[key],
    }),
    tier2: new Tier2FormDriver(() => pool.newPage()),
    tier3: new Tier3ManualDriver(),
  };

  const boss = await createBoss({
    connectionString: env.DATABASE_URL,
    concurrency: env.WORKER_CONCURRENCY,
  });

  await registerWorker(boss, env.WORKER_CONCURRENCY, {
    onJob: (job) =>
      processSubmission(
        {
          repo,
          makeRecorder: (submissionId) => new EventRecorder(db, submissionId),
          limiter,
          drivers,
          scheduleRetry: (retryJob, delay) => scheduleRetry(boss, retryJob, delay),
        },
        job,
      ),
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("shutting down", { signal });
    // Stop taking work first, then release the browser. A job mid-flight gets its grace
    // period from pg-boss rather than being killed with its events half-written.
    await boss.stop({ graceful: true, close: true, timeout: 30_000 }).catch((e: unknown) => {
      log.error("pg-boss shutdown failed", describeError(e));
    });
    await pool.shutdown();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // An unhandled rejection anywhere in this process is a bug we want to see, not a warning
  // buried in a log. Crash, let Railway restart, and leave a stack behind.
  process.on("unhandledRejection", (reason) => {
    log.error("unhandled rejection - crashing deliberately", describeError(reason));
    process.exit(1);
  });

  log.info("worker ready");
}

main().catch((e) => {
  log.error("worker failed to start", describeError(e));
  // Non-zero exit so the platform restarts and the failure is visible in deploy logs.
  process.exit(1);
});

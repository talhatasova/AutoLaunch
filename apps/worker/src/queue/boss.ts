import { PgBoss } from "pg-boss";
import type { Job } from "pg-boss";
import { SUBMISSION_QUEUE, submissionJobSchema } from "@directorylaunch/shared";
import type { SubmissionJob } from "@directorylaunch/shared";
import { assertSessionModeDatabaseUrl, safeDatabaseTarget } from "../env";
import { log, describeError } from "../logger";

/**
 * pg-boss wiring.
 *
 * The connection MUST be session mode. `assertSessionModeDatabaseUrl` runs again here even
 * though loadEnv already checked, because this is the module that would otherwise fail
 * silently: on the transaction pooler (6543) prepared statements and advisory locks break,
 * and the symptom is jobs that enqueue and never run - no error, no crash, submissions
 * simply sit in `queued` forever. See docs/adr/0001-job-queue.md.
 */
export interface BossOptions {
  connectionString: string;
  concurrency: number;
}

export async function createBoss(opts: BossOptions): Promise<PgBoss> {
  assertSessionModeDatabaseUrl(opts.connectionString);

  const boss = new PgBoss({
    connectionString: opts.connectionString,
    // A submission that has been claimed for 10 minutes is stuck, not slow.
    max: Math.max(2, opts.concurrency + 1),
    schema: "pgboss",
  });

  // pg-boss surfaces internal faults on this emitter. Unhandled, they are silent - which
  // is precisely the failure mode this whole file exists to prevent.
  boss.on("error", (error: unknown) => {
    log.error("pg-boss internal error", describeError(error));
  });

  await boss.start();
  await boss.createQueue(SUBMISSION_QUEUE);
  log.info("pg-boss started", {
    queue: SUBMISSION_QUEUE,
    database: safeDatabaseTarget(opts.connectionString),
    connection_mode: "session",
  });
  return boss;
}

export interface WorkerHandlers {
  onJob: (job: SubmissionJob) => Promise<void>;
}

export async function registerWorker(
  boss: PgBoss,
  concurrency: number,
  handlers: WorkerHandlers,
): Promise<string> {
  return await boss.work<unknown>(
    SUBMISSION_QUEUE,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async (jobs: Job<unknown>[]) => {
      for (const job of jobs) {
        const parsed = submissionJobSchema.safeParse(job.data);
        if (!parsed.success) {
          // A malformed job body cannot be repaired by retrying. Fail it loudly so it lands
          // in pg-boss's dead-letter state instead of looping.
          const detail = parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          log.error("rejecting malformed job", { job_id: job.id, detail });
          throw new Error(`Malformed ${SUBMISSION_QUEUE} job ${job.id}: ${detail}`);
        }
        await handlers.onJob(parsed.data);
      }
    },
  ).then((id: string) => {
    log.info("worker registered", { queue: SUBMISSION_QUEUE, concurrency });
    return id;
  });
}

/** Re-enqueue with our own backoff rather than pg-boss's, so the delay is auditable. */
export async function scheduleRetry(
  boss: PgBoss,
  job: SubmissionJob,
  delaySeconds: number,
): Promise<void> {
  await boss.sendAfter(SUBMISSION_QUEUE, job, null, delaySeconds);
}

import PgBoss from "pg-boss";
import { SUBMISSION_QUEUE, type SubmissionJob } from "@directorylaunch/shared";

/**
 * pg-boss enqueue from the web service.
 *
 * TRANSACTIONALITY, stated honestly rather than claimed.
 *
 * The ideal is one transaction containing both the `submissions` rows and their
 * jobs. We cannot have it: the rows are written through PostgREST under the
 * user's JWT so that RLS is the thing enforcing ownership, while pg-boss writes
 * through a direct Postgres connection. Two connections, two transactions.
 *
 * Giving up RLS to get one transaction would mean `apps/web` holding a
 * privileged connection and enforcing tenancy in application code - trading a
 * database-guaranteed boundary for a convention. That is the worse trade.
 *
 * So we get as close as the constraint allows:
 *
 *   - All submission rows are written in ONE PostgREST call, so they are all
 *     present or none are.
 *   - All jobs are written in ONE `boss.insert()` call, so they are all present
 *     or none are.
 *   - Each job's id IS its submission id. pg-boss ignores an insert for an id
 *     that already exists, which makes enqueue idempotent: a retried request, a
 *     duplicated call, or a partial failure followed by a replay cannot produce
 *     two jobs for one submission. `UNIQUE (app_id, directory_id)` upstream and
 *     the job id downstream are the same guarantee, expressed twice.
 *
 * The residual window is rows-written-but-jobs-not. That is why a failure here
 * writes a `submission_events` row naming it: the row is visible on the
 * dashboard as queued, the event says the job never landed, and the worker's
 * sweep of `queued` rows with no job can pick it up. The failure mode we
 * refuse to accept is the silent one.
 */

const CONNECTION_STRING = process.env.DATABASE_URL;

let bossPromise: Promise<PgBoss> | null = null;

/**
 * Start pg-boss once per process and reuse it.
 *
 * `DATABASE_URL` MUST be a session-mode connection (port 5432). Supabase's
 * transaction pooler on 6543 breaks pg-boss's prepared statements and advisory
 * locks, and the symptom is jobs that enqueue and never run - no error, no
 * crash. See docs/adr/0001-job-queue.md.
 */
async function getBoss(): Promise<PgBoss> {
  if (!CONNECTION_STRING) {
    throw new Error(
      "DATABASE_URL is not set, so submission jobs cannot be enqueued. It must be a session-mode connection on port 5432, not the transaction pooler on 6543.",
    );
  }

  if (CONNECTION_STRING.includes(":6543")) {
    // Fail loudly at enqueue time rather than letting every job sit in `queued`
    // forever while the queue looks healthy.
    throw new Error(
      "DATABASE_URL points at port 6543 (the transaction pooler). pg-boss needs a session-mode connection on 5432; on 6543 jobs enqueue and never run.",
    );
  }

  if (!bossPromise) {
    bossPromise = (async () => {
      const boss = new PgBoss({
        connectionString: CONNECTION_STRING,
        // The web service only ever writes. Maintenance, expiry and archiving
        // are the worker's job; running them from both would have two processes
        // competing for the same maintenance locks.
        supervise: false,
        schedule: false,
        max: 4,
        application_name: "directorylaunch-web",
      });

      boss.on("error", (error) => {
        // pg-boss emits connection-level errors here. Unhandled, they would be
        // an unhandled 'error' event and take the process down.
        console.error("[queue] pg-boss error:", error);
      });

      await boss.start();
      // Idempotent. Creating it here means a fresh environment works without a
      // manual setup step, and an existing queue is left alone.
      await boss.createQueue(SUBMISSION_QUEUE);
      return boss;
    })().catch((error: unknown) => {
      // Do not cache a failed startup, or every later request in this process
      // inherits the same dead promise.
      bossPromise = null;
      throw error;
    });
  }

  return await bossPromise;
}

export interface EnqueueResult {
  enqueued: number;
  /** Null when every job landed; a description of what went wrong otherwise. */
  failure: string | null;
}

/**
 * Enqueue one job per automatable submission.
 *
 * Never throws. The caller has already committed the `submissions` rows, and
 * turning a queue hiccup into a 500 would tell the founder nothing happened
 * when in fact 23 rows exist and 21 of them are already actionable. The failure
 * is returned so the caller can record it against the submissions it affects.
 */
export async function enqueueSubmissions(jobs: readonly SubmissionJob[]): Promise<EnqueueResult> {
  if (jobs.length === 0) return { enqueued: 0, failure: null };

  try {
    const boss = await getBoss();

    await boss.insert(
      jobs.map((job) => ({
        // The submission id IS the job id. This is what makes enqueue idempotent.
        id: job.submission_id,
        name: SUBMISSION_QUEUE,
        data: job,
        retryLimit: 0,
        // Retries are decided by the worker against `submissions.attempt_count`
        // and `backoffSeconds()` in the shared package, not by pg-boss - so that
        // the dashboard's view of attempts and the queue's agree.
      })),
    );

    return { enqueued: jobs.length, failure: null };
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`[queue] failed to enqueue ${jobs.length} submission job(s): ${reason}`);
    return { enqueued: 0, failure: reason };
  }
}

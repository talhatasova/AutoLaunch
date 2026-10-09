import type { Directory } from "@directorylaunch/shared";
import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { parseFormSchema } from "../drivers/form-schema";
import type { Db } from "./client";
import {
  apps, directories, platformAccounts, submissionEvents, submissionJobs, submissions,
} from "./schema";
import type { DirectoryRow, EventKind, SubmissionPatch, SubmissionRow } from "./schema";

/** The worker's whole data-access surface. No module outside src/db touches a DB client. */
export type { Db } from "./client";
export type { DirectoryRow, EventKind, SubmissionPatch, SubmissionRow } from "./schema";

export type Job = { job_id: string; submission_id: string; app_id: string; directory_id: string };

/**
 * Claims one job through the RPC (FOR UPDATE SKIP LOCKED; a crashed claim is never
 * reclaimed). The claim marks the transaction service_role so `auth.role()` inside the
 * security-definer function sees the worker's identity on a direct Postgres connection.
 */
export async function claimJob(db: Db): Promise<Job | null> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    const rows = await tx.execute<Job>(sql`select * from public.claim_submission_job()`);
    return rows[0] ?? null;
  });
}

export async function loadJob(db: Db, job: Job): Promise<{ submission: SubmissionRow; directory: DirectoryRow }> {
  const [submission] = await db.select().from(submissions).where(eq(submissions.id, job.submission_id));
  const [directory] = await db.select().from(directories).where(eq(directories.id, job.directory_id));
  if (!submission || !directory) throw new Error(`Claimed job ${job.job_id} has missing submission or directory`);
  return { submission, directory };
}

export async function recordEvent(
  db: Db, submissionId: string, kind: EventKind, message: string, payload: Record<string, unknown> | null = null,
): Promise<void> {
  await db.insert(submissionEvents).values({ submission_id: submissionId, kind, message, payload });
}

export async function updateSubmission(db: Db, id: string, patch: SubmissionPatch): Promise<void> {
  await db.update(submissions).set(patch).where(eq(submissions.id, id));
}

export async function finishJob(db: Db, jobId: string): Promise<void> {
  await db.update(submissionJobs).set({ finished_at: new Date() }).where(eq(submissionJobs.id, jobId));
}

export async function markDirectoryBroken(db: Db, id: string, note: string): Promise<void> {
  await db.update(directories).set({ status: "broken", automation_check_note: note }).where(eq(directories.id, id));
}

export async function loadPlatformAccount(db: Db, directoryId: string) {
  const [row] = await db.select().from(platformAccounts).where(eq(platformAccounts.directory_id, directoryId));
  return row ?? null;
}

export async function updatePlatformAccount(
  db: Db, id: string, patch: { status?: "active" | "locked" | "broken"; session_enc?: string | null },
): Promise<void> {
  await db.update(platformAccounts).set({ ...patch, updated_at: new Date() }).where(eq(platformAccounts.id, id));
}

export const saveSession = (db: Db, id: string, sessionEnc: string) =>
  updatePlatformAccount(db, id, { session_enc: sessionEnc });

export async function certifiedDirectories(db: Db): Promise<DirectoryRow[]> {
  return await db.select().from(directories).where(isNotNull(directories.automation_verified_at));
}

export async function recordRecheck(db: Db, id: string, note: string, broken: boolean): Promise<void> {
  await db.update(directories).set({
    automation_checked_at: new Date(), automation_check_note: note, ...(broken ? { status: "broken" as const } : {}),
  }).where(eq(directories.id, id));
}

/** Statuses the live detector may move to live / not_published. */
export const LIVE_CHECK_STATUSES = ["pending_review", "succeeded", "unconfirmed"] as const;

export async function dueLiveChecks(db: Db, now: Date, limit = 25) {
  return await db.select({
    id: submissions.id,
    live_check_deadline: submissions.live_check_deadline,
    receipt_evidence: submissions.receipt_evidence,
    // Match against the URL the founder approved, not the live (editable) apps.url.
    product_url: sql<string>`coalesce(${submissions.approved_payload}->>'url', ${apps.url})`,
    directory_slug: directories.slug,
    directory_url: directories.url,
    live_lookup: directories.live_lookup,
  }).from(submissions)
    .innerJoin(apps, eq(apps.id, submissions.app_id))
    .innerJoin(directories, eq(directories.id, submissions.directory_id))
    .where(and(inArray(submissions.status, [...LIVE_CHECK_STATUSES]), lte(submissions.next_live_check_at, now)))
    .limit(limit);
}

/** Row update and its timeline event commit together; a row that moved on is left alone. */
export async function settleLiveCheck(
  db: Db, id: string, patch: SubmissionPatch,
  event: { kind: EventKind; message: string; payload: Record<string, unknown> } | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx.update(submissions).set(patch)
      .where(and(eq(submissions.id, id), inArray(submissions.status, [...LIVE_CHECK_STATUSES])))
      .returning({ id: submissions.id });
    if (event && updated.length > 0) await tx.insert(submissionEvents).values({ submission_id: id, ...event });
  });
}

const iso = (d: Date | null) => d?.toISOString() ?? null;

/**
 * DirectoryRow -> the shared Directory contract the drivers consume. `requires_consent`
 * also honours a consent control declared in the form, which can only make us more cautious.
 */
export function toDirectory(row: DirectoryRow): Directory {
  const schema = row.form_schema ? parseFormSchema(row.form_schema) : null;
  const declaresConsentControl =
    schema?.ok === true && schema.value.extra_fields.some((f) => f.source === "consent");
  return {
    slug: row.slug,
    name: row.name,
    url: row.url,
    submission_url: row.submission_url,
    tier: row.tier as 1 | 2 | 3,
    submission_method: row.submission_method,
    requires_captcha: row.requires_captcha,
    category: row.category,
    domain_rating: row.domain_rating,
    form_schema: (schema?.ok === true ? schema.value : null) as Directory["form_schema"],
    api_config: (row.api_config ?? null) as Directory["api_config"],
    requires_consent: row.requires_consent || declaresConsentControl,
    requires_profile_fields: row.requires_profile_fields,
    evidence: row.evidence as Directory["evidence"],
    status: row.status,
    price_kind: row.price_kind,
    price_note: row.price_note,
    price_source_url: row.price_source_url,
    price_checked_at: iso(row.price_checked_at),
    obligation: row.obligation,
    terms_url: row.terms_url,
    channel_type: row.channel_type,
    automation: row.automation,
    terms_prohibit_automation: row.terms_prohibit_automation,
    challenge_kind: row.challenge_kind,
    needs_platform_account: row.needs_platform_account,
    needs_email_verification: row.needs_email_verification,
    live_lookup: (row.live_lookup ?? null) as Directory["live_lookup"],
    recipe: (row.recipe ?? null) as Directory["recipe"],
  };
}

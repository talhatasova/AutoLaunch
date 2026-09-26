import type { Directory, SubmissionStatus } from "@directorylaunch/shared";
import type { ServiceClient } from "./client";
import {
  appRowSchema,
  directoryRowSchema,
  parseRow,
  submissionRowSchema,
} from "./rows";
import type { AppRow, DirectoryRow, SubmissionRow } from "./rows";
import type { ConsentGrant } from "../drivers/types";
import { parseFormSchema } from "../drivers/form-schema";

/**
 * All database access for the worker. Runs under the service role and therefore bypasses
 * RLS - `submissions` grants no UPDATE to any client role, so these transitions can only
 * happen here.
 *
 * Every method surfaces its error. There is no `.catch(() => null)` in this file: a read
 * that silently returns null would make a submission look like a missing row rather than a
 * broken database.
 */
export class Repository {
  constructor(private readonly db: ServiceClient) {}

  async loadSubmission(submissionId: string): Promise<SubmissionRow> {
    const { data, error } = await this.db
      .from("submissions")
      .select("*")
      .eq("id", submissionId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load submission ${submissionId}: ${error.message}`);
    if (!data) throw new Error(`Submission ${submissionId} does not exist.`);
    return parseRow(submissionRowSchema, data, "submissions");
  }

  async loadDirectory(directoryId: string): Promise<DirectoryRow> {
    const { data, error } = await this.db
      .from("directories")
      .select("*")
      .eq("id", directoryId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load directory ${directoryId}: ${error.message}`);
    if (!data) throw new Error(`Directory ${directoryId} does not exist.`);
    return parseRow(directoryRowSchema, data, "directories");
  }

  async loadApp(appId: string): Promise<AppRow> {
    const { data, error } = await this.db
      .from("apps")
      .select("id,user_id,url,name,tagline,description,logo_url,screenshot_url")
      .eq("id", appId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load app ${appId}: ${error.message}`);
    if (!data) throw new Error(`App ${appId} does not exist.`);
    return parseRow(appRowSchema, data, "apps");
  }

  /** The founder's own auth record. The single source of their email and name. */
  async loadAuthUser(userId: string): Promise<{
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  }> {
    const { data, error } = await this.db.auth.admin.getUserById(userId);
    if (error) throw new Error(`Failed to load auth user ${userId}: ${error.message}`);
    if (!data.user) throw new Error(`Auth user ${userId} does not exist.`);
    return { email: data.user.email, user_metadata: data.user.user_metadata ?? {} };
  }

  async markRunning(submissionId: string, attempt: number): Promise<void> {
    const { error } = await this.db
      .from("submissions")
      .update({ status: "running", attempt_count: attempt, error_message: null })
      .eq("id", submissionId);
    if (error) throw new Error(`Failed to mark ${submissionId} running: ${error.message}`);
  }

  async finalize(
    submissionId: string,
    patch: {
      status: SubmissionStatus;
      error_message?: string | null;
      result_url?: string | null;
      submitted_at?: string | null;
      next_attempt_at?: string | null;
      attempt_count?: number;
    },
  ): Promise<void> {
    const { error } = await this.db.from("submissions").update(patch).eq("id", submissionId);
    if (error) {
      throw new Error(
        `Failed to write final status "${patch.status}" for ${submissionId}: ${error.message}`,
      );
    }
  }

  async markSubmittedAt(submissionId: string, when: string): Promise<void> {
    const { error } = await this.db
      .from("submissions")
      .update({ submitted_at: when })
      .eq("id", submissionId);
    if (error) {
      throw new Error(`Failed to set submitted_at for ${submissionId}: ${error.message}`);
    }
  }

  /**
   * A selector that no longer matches means the form changed. The directory goes `broken`
   * so no other founder's submission is thrown at a form that no longer exists, and the
   * reason is recorded rather than left to be rediscovered.
   */
  async markDirectoryBroken(directoryId: string, reason: string): Promise<void> {
    const { error } = await this.db
      .from("directories")
      .update({ status: "broken" })
      .eq("id", directoryId);
    if (error) {
      throw new Error(`Failed to mark directory ${directoryId} broken: ${error.message}`);
    }
    // `directories` has no error_message column; the human-readable reason belongs on the
    // submission that discovered it and in the operator log. Recorded by the caller.
    void reason;
  }
}

/**
 * DirectoryRow -> the shared Directory contract the drivers consume.
 *
 * `requires_consent` falls back to "does the form declare a consent control", which is the
 * definition rather than a guess, so a database missing that column still gates consent
 * correctly. The fallback can only make us more cautious.
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
    requires_consent: row.requires_consent ?? declaresConsentControl,
    requires_profile_fields: (row.requires_profile_fields ??
      []) as Directory["requires_profile_fields"],
    evidence: row.evidence as Directory["evidence"],
    status: row.status,
    price_kind: row.price_kind ?? "unknown",
    price_note: row.price_note ?? null,
    price_source_url: row.price_source_url ?? null,
    price_checked_at: row.price_checked_at ?? null,
    obligation: row.obligation ?? null,
    terms_url: row.terms_url ?? null,
  };
}

/**
 * Consent is read from the submission the founder created, never inferred.
 *
 * `consent_granted_at` is written by apps/web at enqueue time when the user ticked that
 * directory's terms box. Absent column or null value both mean "no consent recorded", and
 * the driver then refuses to tick anything.
 */
export function toConsentGrant(
  submission: SubmissionRow,
  directory: Pick<Directory, "slug">,
): ConsentGrant | null {
  if (!submission.consent_granted_at) return null;
  return { directory_slug: directory.slug, granted_at: submission.consent_granted_at };
}

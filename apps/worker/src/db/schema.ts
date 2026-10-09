import { boolean, integer, jsonb, pgEnum, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Drizzle mirror of the columns the worker reads or writes. supabase/migrations is the
 * source of truth: never generate or push migrations from this file. A column listed here
 * must exist in a migration, because Drizzle selects every declared column.
 */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const submissionStatus = pgEnum("submission_status", [
  "queued", "running", "succeeded", "failed", "needs_manual",
  "pending_review", "unconfirmed", "live", "not_published",
]);
export const submissionEventKind = pgEnum("submission_event_kind", [
  "queued", "started", "field_filled", "submitted", "succeeded", "challenge_detected",
  "manual_required", "selector_missing", "retry_scheduled", "failed",
  "receipt", "unconfirmed", "live", "not_published",
]);
export const directoryStatus = pgEnum("directory_status", ["active", "broken"]);
export const submissionMethod = pgEnum("submission_method", ["api", "form", "manual"]);

export const directories = pgTable("directories", {
  id: uuid("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  submission_url: text("submission_url").notNull(),
  tier: smallint("tier").notNull(),
  submission_method: submissionMethod("submission_method").notNull(),
  requires_captcha: boolean("requires_captcha").notNull(),
  category: text("category").notNull(),
  domain_rating: smallint("domain_rating"),
  api_config: jsonb("api_config"),
  form_schema: jsonb("form_schema"),
  evidence: jsonb("evidence").notNull(),
  last_verified_at: ts("last_verified_at"),
  status: directoryStatus("status").notNull(),
  requires_consent: boolean("requires_consent").notNull(),
  requires_profile_fields: text("requires_profile_fields").array().notNull(),
  price_kind: text("price_kind").$type<"free" | "paid" | "unknown">().notNull(),
  price_note: text("price_note"),
  price_source_url: text("price_source_url"),
  price_checked_at: ts("price_checked_at"),
  obligation: text("obligation"),
  terms_url: text("terms_url"),
  automation_verified_at: ts("automation_verified_at"),
  automation_checked_at: ts("automation_checked_at"),
  automation_check_note: text("automation_check_note"),
  channel_type: text("channel_type").$type<"directory" | "social" | "article" | "list">().notNull(),
  automation: text("automation").$type<"automated" | "manual" | "paid_link">().notNull(),
  terms_prohibit_automation: boolean("terms_prohibit_automation").notNull(),
  challenge_kind: text("challenge_kind")
    .$type<"none" | "arithmetic" | "recaptcha_v2" | "recaptcha_v3" | "hcaptcha" | "turnstile">().notNull(),
  needs_platform_account: boolean("needs_platform_account").notNull(),
  needs_email_verification: boolean("needs_email_verification").notNull(),
  live_lookup: jsonb("live_lookup"),
  recipe: jsonb("recipe"),
});

export const apps = pgTable("apps", {
  id: uuid("id").primaryKey(),
  user_id: uuid("user_id").notNull(),
  url: text("url").notNull(),
  name: text("name").notNull(),
});

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey(),
  app_id: uuid("app_id").notNull(),
  directory_id: uuid("directory_id").notNull(),
  status: submissionStatus("status").notNull(),
  submitted_at: ts("submitted_at"),
  result_url: text("result_url"),
  error_message: text("error_message"),
  attempt_count: integer("attempt_count").notNull(),
  consent_granted_at: ts("consent_granted_at"),
  approved_payload: jsonb("approved_payload"),
  obligation_confirmed_at: ts("obligation_confirmed_at"),
  receipt_evidence: jsonb("receipt_evidence").$type<Record<string, unknown>>(),
  live_checked_at: ts("live_checked_at"),
  next_live_check_at: ts("next_live_check_at"),
  live_check_deadline: ts("live_check_deadline"),
  challenge_cost_cents: integer("challenge_cost_cents").notNull(),
  inbox_address: text("inbox_address"),
});

export const submissionEvents = pgTable("submission_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  submission_id: uuid("submission_id").notNull(),
  kind: submissionEventKind("kind").notNull(),
  message: text("message").notNull(),
  payload: jsonb("payload"),
});

export const submissionJobs = pgTable("submission_jobs", {
  id: uuid("id").primaryKey(),
  submission_id: uuid("submission_id").notNull(),
  claimed_at: ts("claimed_at"),
  finished_at: ts("finished_at"),
});

export const platformAccounts = pgTable("platform_accounts", {
  id: uuid("id").primaryKey(),
  directory_id: uuid("directory_id").notNull(),
  username: text("username").notNull(),
  secret_enc: text("secret_enc").notNull(),
  session_enc: text("session_enc"),
  status: text("status").$type<"active" | "locked" | "broken">().notNull(),
  updated_at: ts("updated_at").notNull(),
});

export type DirectoryRow = typeof directories.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;
export type SubmissionPatch = Partial<typeof submissions.$inferInsert>;
export type EventKind = (typeof submissionEventKind.enumValues)[number];

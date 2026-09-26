import { z } from "zod";
import { companyProfileSchema, directoryStatusSchema, submissionStatusSchema } from "@directorylaunch/shared";

/**
 * Runtime shapes for the rows the worker reads.
 *
 * Validated with zod rather than trusted from the generated types, because the generated
 * types are a snapshot: `requires_consent`, `requires_profile_fields` and
 * `consent_granted_at` are declared in the shared contract but were added to the schema
 * after database.types.ts was generated. Parsing here means a drifted column surfaces as a
 * named validation error on one row instead of an undefined that quietly disables consent
 * gating for every directory.
 */

export const directoryRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  url: z.string(),
  submission_url: z.string(),
  tier: z.number().int(),
  submission_method: z.enum(["api", "form", "manual"]),
  requires_captcha: z.boolean(),
  category: z.string(),
  domain_rating: z.number().nullable().default(null),
  api_config: z.unknown().nullable().default(null),
  form_schema: z.unknown().nullable().default(null),
  evidence: z.unknown().default({}),
  status: directoryStatusSchema,
  /**
   * Optional at the DB layer, defaulted safely.
   *
   * If the column is missing, `requires_consent` falls back to whether form_schema
   * declares a consent control - which is the definition anyway - and
   * requires_profile_fields falls back to []. The safe direction: a missing column can
   * only ever make us MORE cautious, never cause a terms box to be ticked.
   */
  requires_consent: z.boolean().optional(),
  requires_profile_fields: z.array(z.string()).optional(),
  price_kind: z.enum(["free", "paid", "unknown"]).optional(),
  price_note: z.string().nullable().optional(),
  price_source_url: z.string().nullable().optional(),
  price_checked_at: z.string().nullable().optional(),
  obligation: z.string().nullable().optional(),
  terms_url: z.string().nullable().optional(),
});
export type DirectoryRow = z.infer<typeof directoryRowSchema>;

export const appRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  url: z.string(),
  name: z.string(),
  tagline: z.string().nullable(),
  description: z.string().nullable(),
  logo_url: z.string().nullable(),
  screenshot_url: z.string().nullable(),
});
export type AppRow = z.infer<typeof appRowSchema>;

export const submissionRowSchema = z.object({
  id: z.string().uuid(),
  app_id: z.string().uuid(),
  directory_id: z.string().uuid(),
  status: submissionStatusSchema,
  attempt_count: z.number().int(),
  /**
   * Set by apps/web at enqueue time when the founder explicitly agreed to THIS directory's
   * terms. Null means no agreement was recorded, and a form with a consent checkbox then
   * resolves needs_manual. There is no other source of consent.
   */
  consent_granted_at: z.string().nullable().optional(),
});
export type SubmissionRow = z.infer<typeof submissionRowSchema>;

/** Founder identity, read from the auth user. Never generated. */
export const userIdentitySchema = z.object({
  email: z.string().email(),
  founder_name: z.string().min(1),
  company_profile: companyProfileSchema.nullable(),
});
export type UserIdentity = z.infer<typeof userIdentitySchema>;

export function parseRow<T extends z.ZodTypeAny>(
  schema: T,
  raw: unknown,
  what: string,
): z.infer<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`${what} row failed validation: ${detail}`);
  }
  return parsed.data;
}

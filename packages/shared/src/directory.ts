import { z } from "zod";
import { directoryStatusSchema } from "./status";

/**
 * Tier 1 - a real public "create listing" API.
 * Tier 2 - plain HTML form, no CAPTCHA/challenge on a fresh unauthenticated request.
 * Tier 3 - CAPTCHA-gated, manual review, or requires a pre-existing logged-in account.
 */
export const tierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Tier = z.infer<typeof tierSchema>;

export const submissionMethodSchema = z.enum(["api", "form", "manual"]);
export type SubmissionMethod = z.infer<typeof submissionMethodSchema>;

/**
 * Tier 2 field mapping lives in DATA, not code, so that a directory changing its form is
 * a row update rather than a deploy. One generic Playwright driver consumes this for
 * every Tier 2 directory.
 */
export const formFieldSchema = z.object({
  selector: z.string().min(1),
  payload_key: z.string().min(1),
  type: z.enum(["text", "textarea", "email", "url", "select", "file", "checkbox"]),
  required: z.boolean().default(false),
});

export const successSignalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url_contains"), value: z.string().min(1) }),
  z.object({ kind: z.literal("selector_present"), value: z.string().min(1) }),
  z.object({ kind: z.literal("text_present"), value: z.string().min(1) }),
]);

/**
 * Controls a form requires that are NOT part of SubmissionPayload.
 *
 * Real forms ask for things our payload does not carry - a founder name, a "I agree to
 * the terms" checkbox. Without this the driver fills every mapped field, hits submit, and
 * is bounced by client-side validation with no useful error. Discovered on both Tier 2
 * directories, so it is the common case rather than an edge case.
 */
export const extraFieldSchema = z.object({
  selector: z.string().min(1),
  type: z.enum(["text", "email", "checkbox", "select"]),
  /**
   * `founder_name` is the authenticated user's own name - we are not inventing a persona.
   * `consent` MUST be collected from the user in the UI before submission; the driver may
   * only tick it when the user has explicitly agreed to that directory's terms. We do not
   * accept terms on someone's behalf silently.
   * `constant` is for benign fixed values (e.g. a "source" dropdown).
   */
  source: z.enum(["founder_name", "consent", "constant"]),
  value: z.string().optional(),
  required: z.boolean().default(false),
});

export const formSchemaSchema = z.object({
  fields: z.array(formFieldSchema).min(1),
  /** Required controls outside SubmissionPayload. Empty for forms that need none. */
  extra_fields: z.array(extraFieldSchema).default([]),
  /**
   * Bot-trap inputs that MUST be left empty. Filling one marks us as a bot and the
   * submission is silently discarded - the worst failure mode, since it looks like
   * success. Observed as `fax_number` on startupproject.org.
   */
  honeypots: z.array(z.string()).default([]),
  submit_selector: z.string().min(1),
  success_signal: successSignalSchema,
});

export const apiConfigSchema = z.object({
  endpoint: z.string().url(),
  method: z.enum(["POST", "PUT"]).default("POST"),
  auth: z.enum(["none", "bearer", "api_key_header"]),
  field_map: z.record(z.string()),
});

/**
 * Why a directory was classified the way it was. Makes tiering auditable rather than
 * folklore - every verdict names the URL checked, when, and what was actually observed.
 */
export const evidenceSchema = z.object({
  checked_url: z.string().url(),
  checked_at: z.string().datetime(),
  finding: z.string().min(1),
});

export const directorySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  submission_url: z.string().url(),
  tier: tierSchema,
  submission_method: submissionMethodSchema,
  requires_captcha: z.boolean(),
  category: z.string().min(1),
  domain_rating: z.number().int().min(0).max(100).nullable(),
  form_schema: formSchemaSchema.nullable(),
  api_config: apiConfigSchema.nullable(),
  /**
   * True when the form has a terms/consent control. The UI must surface this directory's
   * terms and get explicit agreement before we submit - see extraFieldSchema.source.
   */
  requires_consent: z.boolean().default(false),
  /**
   * Company-profile fields this directory requires beyond the product listing. Non-empty
   * means the directory is only automatable once the founder has completed that optional
   * section; until then it stays needs_manual rather than failing.
   */
  requires_profile_fields: z.array(z.string()).default([]),
  evidence: evidenceSchema,
  status: directoryStatusSchema,
});
export type Directory = z.infer<typeof directorySchema>;

/**
 * A Tier 1 entry must carry api_config; Tier 2 must carry form_schema; Tier 3 carries
 * neither. Enforced here so a malformed seed file fails at load rather than at 3am in a
 * worker.
 */
export const seedDirectorySchema = directorySchema.superRefine((d, ctx) => {
  if (d.tier === 1 && !d.api_config) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${d.slug}: tier 1 requires api_config` });
  }
  if (d.tier === 2 && !d.form_schema) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${d.slug}: tier 2 requires form_schema` });
  }
  if (d.tier === 3 && (d.api_config || d.form_schema)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${d.slug}: tier 3 must not carry an automation config` });
  }
  if (d.requires_captcha && d.tier !== 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${d.slug}: requires_captcha implies tier 3 - we never automate past a challenge`,
    });
  }
});

export const seedFileSchema = z.array(seedDirectorySchema);

import { z } from "zod";
import { formSchemaSchema, successSignalSchema } from "@directorylaunch/shared";
import { PermanentError } from "../errors";

/**
 * `directories.recipe` jsonb. The worker owns this shape. Every key is optional:
 *   - form:   same shape as form_schema; wins over form_schema when present.
 *   - login:  platform-account login form, run before the submission form.
 *   - social: post through a social API instead of a browser form.
 *   - email_verification: after the receipt, wait for the platform-inbox email and open
 *     its link (also implied by directories.needs_email_verification).
 */
export const loginRecipeSchema = z.object({
  url: z.string().url(),
  username_selector: z.string().min(1),
  password_selector: z.string().min(1),
  submit_selector: z.string().min(1),
  success_signal: successSignalSchema,
});
export type LoginRecipe = z.infer<typeof loginRecipeSchema>;

export const socialRecipeSchema = z.object({
  network: z.enum(["bluesky", "mastodon"]),
  /** PDS for Bluesky (https://bsky.social), instance origin for Mastodon. */
  base_url: z.string().url(),
});
export type SocialRecipe = z.infer<typeof socialRecipeSchema>;

export const emailVerificationRecipeSchema = z.object({
  from_contains: z.string().min(1).optional(),
  timeout_ms: z.number().int().positive().max(30 * 60_000).optional(),
});

export const recipeSchema = z.object({
  form: formSchemaSchema.optional(),
  login: loginRecipeSchema.optional(),
  social: socialRecipeSchema.optional(),
  email_verification: emailVerificationRecipeSchema.optional(),
});
export type Recipe = z.infer<typeof recipeSchema>;

/** Null column means "no recipe": the driver falls back to form_schema. */
export function parseRecipe(raw: unknown, slug: string): Recipe | null {
  if (raw === null || raw === undefined) return null;
  const parsed = recipeSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  throw new PermanentError(`${slug}: recipe is invalid (${detail}). Fix the directory row.`);
}

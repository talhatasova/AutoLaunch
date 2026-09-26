import { z } from "zod";
import {
  apiConfigSchema,
  extraFieldSchema,
  formFieldSchema,
  formSchemaSchema,
  successSignalSchema,
} from "@directorylaunch/shared";

/**
 * Types inferred from the shared zod contracts.
 *
 * packages/shared exports the schemas but not every inferred type; inferring here keeps a
 * single source of truth. If the contract changes, this file breaks at compile time, which
 * is the point.
 */
export type FormField = z.infer<typeof formFieldSchema>;
export type ExtraField = z.infer<typeof extraFieldSchema>;
export type SuccessSignal = z.infer<typeof successSignalSchema>;
export type FormSchema = z.infer<typeof formSchemaSchema>;
export type ApiConfig = z.infer<typeof apiConfigSchema>;

export type { Directory } from "@directorylaunch/shared";

export { formSchemaSchema, apiConfigSchema };

/**
 * Parses `directories.form_schema` out of jsonb.
 *
 * A Tier 2 row with an unparseable form_schema is a data bug, not a site problem: it must
 * surface as a permanent error rather than being retried against a site that is fine.
 */
export function parseFormSchema(raw: unknown): { ok: true; value: FormSchema } | { ok: false; error: string } {
  const parsed = formSchemaSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    error: parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; "),
  };
}

export function parseApiConfig(raw: unknown): { ok: true; value: ApiConfig } | { ok: false; error: string } {
  const parsed = apiConfigSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    error: parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; "),
  };
}

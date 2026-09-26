import type { SubmissionPayload } from "@directorylaunch/shared";

/**
 * Resolves a `form_schema` / `api_config` payload key against the assembled payload.
 *
 * Supports dotted access into company_profile (e.g. "company_profile.employee_count") so a
 * directory that asks for headcount is still a seed-file row rather than a code change.
 *
 * Returns:
 *   { ok: true, value }        - resolvable, may be an empty string when the field is null
 *   { ok: false, reason }      - the KEY does not exist in the contract; a data bug in the
 *                                directory row, never something to retry.
 *
 * Nothing here invents a value. A missing company_profile entry resolves to empty, and it
 * is the caller's job to turn "required but empty" into needs_manual - we do not guess a
 * headcount or a phone number on a founder's behalf, because it gets published under
 * their name.
 */
export type ValueResolution =
  | { ok: true; value: string }
  | { ok: false; reason: string };

const TOP_LEVEL_KEYS = [
  "name",
  "tagline",
  "description",
  "url",
  "category",
  "tags",
  "logo_url",
  "screenshot_url",
  "contact_email",
  "founder_name",
] as const;

const PROFILE_KEYS = [
  "phone",
  "employee_count",
  "customer_count",
  "competitors",
  "founded_year",
] as const;

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined).join(", ");
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return String(v);
}

export function resolvePayloadValue(payload: SubmissionPayload, key: string): ValueResolution {
  if (key.startsWith("company_profile.")) {
    const sub = key.slice("company_profile.".length);
    if (!(PROFILE_KEYS as readonly string[]).includes(sub)) {
      return { ok: false, reason: `unknown company_profile field "${sub}"` };
    }
    const profile = payload.company_profile;
    if (!profile) return { ok: true, value: "" };
    return { ok: true, value: stringify(profile[sub as (typeof PROFILE_KEYS)[number]]) };
  }

  if (key === "company_profile") {
    return { ok: false, reason: `"company_profile" is an object; use a dotted sub-key` };
  }

  if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
    return { ok: false, reason: `unknown payload key "${key}"` };
  }

  return { ok: true, value: stringify(payload[key as (typeof TOP_LEVEL_KEYS)[number]]) };
}

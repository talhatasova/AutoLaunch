import type { Directory, FormSchema } from "./form-schema";
import type { ConsentGrant } from "./types";

export type ConsentDecision =
  | { ok: true; required: boolean }
  | { ok: false; reason: string };

/**
 * Decides whether we are permitted to tick a directory's terms checkbox.
 *
 * The only "yes" is an explicit, per-directory grant recorded from the founder in the UI.
 * Everything else - no grant, a grant for a different directory, a directory that declares
 * it needs consent but exposes no control to express it - resolves needs_manual.
 *
 * There is deliberately no "assume yes" path. Ticking a terms box the user never saw
 * binds them to an agreement on our say-so.
 */
export function consentDecision(
  directory: Pick<Directory, "slug" | "requires_consent">,
  formSchema: Pick<FormSchema, "extra_fields">,
  consent: ConsentGrant | null,
): ConsentDecision {
  const hasConsentControl = formSchema.extra_fields.some((f) => f.source === "consent");
  const required = directory.requires_consent || hasConsentControl;

  if (!required) return { ok: true, required: false };

  if (directory.requires_consent && !hasConsentControl) {
    return {
      ok: false,
      reason:
        `${directory.slug} requires agreement to its terms but its form_schema declares no ` +
        `consent control, so there is nothing we could legitimately tick. Handing this to you.`,
    };
  }

  if (!consent) {
    return {
      ok: false,
      reason:
        `${directory.slug} requires you to agree to its terms and no consent was recorded ` +
        `for it. We will not accept terms on your behalf, so this one is yours to confirm.`,
    };
  }

  if (consent.directory_slug !== directory.slug) {
    return {
      ok: false,
      reason:
        `Consent on file is for "${consent.directory_slug}", not "${directory.slug}". ` +
        `Consent is per-directory and is never carried across.`,
    };
  }

  return { ok: true, required: true };
}

import { companyProfileSchema, submissionPayloadSchema } from "@directorylaunch/shared";
import type { SubmissionPayload } from "@directorylaunch/shared";
import type { AppRow, UserIdentity } from "../db/rows";

/**
 * Assembles the SubmissionPayload from the founder's app row and their AUTHENTICATED
 * identity.
 *
 * Identity rules, non-negotiable:
 *   - `contact_email` is the email on the founder's own auth record. Not a generated
 *     address, not a disposable inbox, not a shared DirectoryLaunch mailbox.
 *   - `founder_name` is the name on their own profile. If it is missing we STOP and ask,
 *     because the alternative is inventing a person.
 *
 * Missing listing content is likewise never invented. A blank tagline stays blank and the
 * directory that requires one resolves needs_manual.
 */
export type PayloadBuild =
  | { ok: true; payload: SubmissionPayload }
  | { ok: false; reason: string };

export function extractIdentity(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): { ok: true; identity: UserIdentity } | { ok: false; reason: string } {
  const email = user.email ?? null;
  if (!email) {
    return {
      ok: false,
      reason:
        "Your account has no email address on file, and we will not submit under an " +
        "address you did not give us. Add one to your profile and re-run this directory.",
    };
  }

  const meta = user.user_metadata ?? {};
  const rawName = meta.full_name ?? meta.name ?? meta.founder_name;
  const founderName = typeof rawName === "string" ? rawName.trim() : "";
  if (!founderName) {
    return {
      ok: false,
      reason:
        "Several directories ask for a founder name and your profile does not have one. " +
        "We will not make up a name to put on your listing - add yours and this directory " +
        "becomes automatable.",
    };
  }

  // Absent or malformed profile is simply "not provided". Never partially guessed.
  const profileParse = companyProfileSchema.safeParse(meta.company_profile);
  return {
    ok: true,
    identity: {
      email,
      founder_name: founderName,
      company_profile: profileParse.success ? profileParse.data : null,
    },
  };
}

export function buildPayload(
  app: AppRow,
  identity: UserIdentity,
  category: string,
  tags: string[] = [],
): PayloadBuild {
  const candidate = {
    name: app.name,
    tagline: app.tagline ?? "",
    description: app.description ?? "",
    url: app.url,
    category,
    tags,
    logo_url: app.logo_url,
    screenshot_url: app.screenshot_url,
    contact_email: identity.email,
    founder_name: identity.founder_name,
    company_profile: identity.company_profile,
  };

  const parsed = submissionPayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".") || "(root)");
    return {
      ok: false,
      reason:
        `Your listing is missing ${[...new Set(missing)].join(", ")}. We do not fill these ` +
        `in for you - they get published under your name. Complete them and this ` +
        `submission can run automatically.`,
    };
  }
  return { ok: true, payload: parsed.data };
}

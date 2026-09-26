/**
 * Sanitise a `?next=` destination.
 *
 * An unchecked `next` is an open redirect: `/auth/sign-in?next=https://evil.example`
 * sends a user who has just authenticated straight to an attacker's page,
 * arriving from our own domain with our own branding. Protocol-relative
 * `//evil.example` is the same attack wearing a path's clothes, and a backslash
 * is the same again for browsers that normalise `\` to `/`.
 *
 * Only a single-slash, same-origin path survives.
 */

/** Control characters, which can be used to split a Location header. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function safeNextPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;

  const candidate = value.trim();
  if (candidate.length === 0) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  // "//host" is protocol-relative; "/\host" is the backslash variant.
  if (candidate.startsWith("//")) return fallback;
  if (candidate.includes("\\")) return fallback;
  if (CONTROL_CHARS.test(candidate)) return fallback;

  return candidate;
}

/**
 * Supabase connection settings for `apps/web`.
 *
 * Only two values, and both are public by design: the project URL and the
 * anon/publishable key. The anon key grants nothing on its own - every table in
 * this project has RLS enabled and policies keyed on `auth.uid()`, so the key is
 * an entry ticket, not an authorisation.
 *
 * The key that DOES grant everything - the service role - is never read here.
 * It belongs to `apps/worker`. See `no-service-role.test.ts`, which fails the
 * build if that ever stops being true.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    // Failing at startup with the variable named beats a 500 at request time
    // with "Invalid API key" and no indication of which one.
    throw new Error(
      `${name} is not set. Copy apps/web/.env.local.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * Supabase renamed the anon key to the "publishable" key. New projects issue
 * the latter, this repo's `.env.example` documents the former, and both are the
 * same low-privilege browser-safe key - so accept either rather than making a
 * working project fail on a naming change.
 */
export function supabaseAnonKey(): string {
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (publishable && publishable.length > 0) return publishable;
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Absolute origin for OAuth redirect URLs. Must match Supabase's allow-list. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && configured.length > 0) return configured.replace(/\/$/, "");
  return "http://localhost:3000";
}

/**
 * How we identify ourselves to every site we fetch.
 *
 * Honest, named, and carrying a contact URL so an operator who sees us in their
 * logs can find out who we are and tell us to stop. We do not send a browser
 * user-agent; we are a bot, and pretending otherwise would be the first step
 * toward the behaviour this product refuses to have.
 */
export function scraperUserAgent(): string {
  const configured = process.env.SCRAPER_USER_AGENT;
  if (configured && configured.length > 0) return configured;
  return "DirectoryLaunchBot/1.0 (+https://directorylaunch.app/bot)";
}

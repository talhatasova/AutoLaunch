# `apps/worker`

The job consumer that actually performs submissions. It claims `submission_jobs` rows once
through `claim_submission_job()` (`FOR UPDATE SKIP LOCKED`) and never reclaims a crashed job. Everything else in
DirectoryLaunch is a directory *list* until this process runs.

```bash
pnpm --filter worker dev     # or: pnpm worker
pnpm --filter worker test
pnpm --filter worker typecheck
```

## What this refuses to do

These are code paths with tests, not aspirations in a doc.

| Rule | Where | Test |
|------|-------|------|
| Never defeat CAPTCHA or bot detection | `src/drivers/challenge.ts` | `__tests__/challenge.test.ts` |
| Never tick a terms box without explicit per-directory consent | `src/drivers/consent.ts` | `__tests__/consent.test.ts` |
| Never fill a honeypot | `src/drivers/tier2-form.ts` | `__tests__/tier2-driver.test.ts` |
| Never report an unconfirmed submission as success | `src/drivers/success.ts` | `__tests__/tier2-driver.test.ts` |

There is no configuration flag, environment variable, or code path that turns any of them
off. `needs_manual` is a success state: the payload is assembled and the founder does one
click.

### Challenge detection reads the LIVE DOM

Directory research found Future Tools serving a clean, CAPTCHA-free form to `curl` and then
injecting Cloudflare Turnstile client-side at render. A detector that inspected the initial
HTML would have declared that page safe and shipped a driver that fails silently on exactly
the site it most needed to catch.

So `snapshot()` is taken **after** render and includes things raw HTML cannot show: resolved
frame URLs, the live `<script src>` list, and the challenge globals actually installed on
`window`. It runs three times per submission - after load, immediately before submit (widgets
mount on interaction), and after submit.

## Tiers

| Tier | Driver | Notes |
|------|--------|-------|
| 1 | `drivers/tier1-api.ts` | Driven by `directories.api_config`. **Zero live Tier 1 directories today** - Product Hunt's API v2 is read-only. Built and tested against a mock because directories get promoted. |
| 2 | `drivers/tier2-form.ts` | ONE generic Playwright driver. Two live directories: `the-startup-project`, `startup-collections`. |
| 3 | `drivers/tier3-manual.ts` | 21 directories. Assembles the payload, resolves `needs_manual`, does not touch the network. |

### Adding a directory is a seed-file row, never a deploy

`tier2-form.ts` contains no directory-specific branch and must never grow one. Selectors,
field mapping, extra controls, honeypots and the success signal all come from
`directories.form_schema`. A directory changing its form is a row update.

`__tests__/tier2-driver.test.ts` asserts this directly: one driver instance handles both
real directories with different schemas.

## Contract with `apps/web`

The worker reads two things it cannot derive:

1. **`submissions.consent_granted_at`** - set at enqueue time, and ONLY when the founder was
   shown that directory's terms and agreed. NULL means the worker leaves the checkbox alone
   and resolves `needs_manual`. There is no other source of consent, and a grant is never
   carried between directories.
2. **Founder identity** - `email` and `user_metadata.full_name` on the auth user, plus
   optional `user_metadata.company_profile`. If the name is missing the submission resolves
   `needs_manual` rather than inventing one.

## Operational traps

**Docker base image tag must match the `playwright` package version.** Both are `1.62.1`
today. A mismatch fails at runtime, after deploy, with `Executable doesn't exist at
/ms-playwright/...`.

```bash
docker build -f apps/worker/Dockerfile -t directorylaunch-worker .   # from the REPO ROOT
```

**`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS** and must never appear in `apps/web` or carry a
`NEXT_PUBLIC_` prefix. The worker needs it because `submissions` grants no UPDATE to any
client role - status transitions belong here and nowhere else.

## Observability

Every state transition writes a `submission_events` row. The dashboard is driven entirely
off that table via Realtime, so an event we fail to write is a step the user never sees.

Event writes throw on failure: a claimed job whose events cannot be written stops and is
left for investigation rather than reporting a finished submission nobody can see.

## Channels

- `directories.recipe` (optional) holds `form` (same shape as `form_schema`, which it
  overrides), `login` (platform-account login form) and `social` (`bluesky` | `mastodon`
  with `base_url`). See `src/drivers/recipe.ts`.
- `needs_platform_account` channels sign in with the `platform_accounts` row (decrypted
  here only) and save the encrypted browser session after login.
- Social posts are public at once, so they go straight to `live` with the post URL.
- `src/live/detector.ts` polls `live_lookup` daily for 30 days after a receipt, then marks
  `live` or `not_published`.

## Environment

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Supabase REST endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS. Worker only. |
| `TOKEN_ENCRYPTION_KEY` | base64 32-byte AES-GCM key for `platform_accounts`. Missing disables platform channels (logged). |
| `SCRAPER_USER_AGENT` | Honest UA with a contact URL |
| `DIRECTORY_API_KEY_<SLUG>` | Tier 1 credential, e.g. `DIRECTORY_API_KEY_THE_STARTUP_PROJECT`. Missing key resolves `needs_manual`, not failure. |

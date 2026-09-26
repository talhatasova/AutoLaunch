# DirectoryLaunch

A founder pastes their SaaS URL. We publish their listing to a curated set of free
SaaS/startup directories and show live per-directory status.

The differentiator versus directory-*list* sites is that we actually perform the
submission rather than pointing people at where to go.

## What we will not do

1. **Never defeat CAPTCHA or bot detection.** A Cloudflare challenge, reCAPTCHA, or
   hCaptcha means the directory is Tier 3 and the submission resolves `needs_manual`. We
   do not solve it, evade it, or retry hoping to slip through.
2. **Never fabricate identities.** Where a form needs an email, it is the authenticated
   founder's own, disclosed in the UI before submission.
3. **Nothing fails silently.** Every integration carries `last_verified_at` and an
   `active`/`broken` status. A form that changed marks the directory broken rather than
   retrying into the void.

`needs_manual` is a **success state**, not a failure: the payload is assembled and the
user does one click.

## Tiers

| Tier | Method | Handling |
|------|--------|----------|
| 1 | Real public create-listing API | Automated via typed API client |
| 2 | Plain HTML form, no challenge | Automated via one generic Playwright driver |
| 3 | CAPTCHA / login wall / manual review | Pre-filled payload, handed to the user |

Tier 1 is rarer than it looks. Product Hunt's public API v2 is read-only — it cannot
create a submission, so the most obvious "free directory" is not Tier 1.

## Architecture

Two Railway services against one Supabase project:

- **`apps/web`** — Next.js App Router. Auth, metadata scraping, job enqueue, dashboard.
- **`apps/worker`** — pg-boss consumer + Playwright. Runs the actual submissions.
- **`packages/shared`** — zod contracts both sides must agree on.

See [`docs/adr/0001-job-queue.md`](docs/adr/0001-job-queue.md) for why the queue is
pg-boss rather than a managed runner.

> **Connection gotcha:** pg-boss needs a **session-mode** Postgres connection (port 5432).
> Supabase's transaction pooler on 6543 breaks its prepared statements and advisory locks.
> The symptom is jobs that enqueue and never run — no error, no crash. If the queue looks
> stuck, check `DATABASE_URL` before debugging application code.

## Setup

```bash
pnpm install
cp .env.example .env   # fill in Supabase credentials
pnpm validate:seed     # check seed/directories.json against the contract
pnpm dev               # web
pnpm worker            # worker, separate terminal
```

## Subagents

Eight role definitions live in `.claude/agents/`. Each names the skills it loads and the
constraints it owns.

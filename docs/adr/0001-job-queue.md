# ADR-0001: pg-boss on Supabase Postgres, with a dedicated Railway worker

- Status: Accepted
- Date: 2026-08-24

## Context

DirectoryLaunch submits a founder's listing to third-party directories. Tier 2 submission
means driving a real browser (Playwright + Chromium) against a plain HTML form. That work
is long-running, memory-hungry, and needs a ~400MB browser binary on disk.

The kickoff brief specified Vercel and left the queue open between pg-boss and a managed
runner (Inngest / Trigger.dev). The infrastructure decision has since been made:
**everything runs on Railway.**

## Decision

**pg-boss, hosted in the Supabase Postgres instance we already own, consumed by a
dedicated long-lived Railway worker service.**

Two Railway services:

- `web` - Next.js App Router. Accepts the submission, scrapes metadata, enqueues jobs.
- `worker` - Node process running the pg-boss consumer plus Playwright.

## Rationale

The only strong argument for Inngest or Trigger.dev was that serverless platforms cannot
host a long-running browser: Vercel caps function duration and cannot ship Chromium
comfortably, so a managed runner with its own container was doing the job the platform
could not. Railway provides long-lived containers directly, which removes that argument
entirely.

With a persistent process available, keeping the queue inside Postgres wins on:

- **One less vendor and one less set of secrets** to manage and rotate.
- **Transactional integrity.** The `submissions` row and its job are written against the
  same database, so job state is joinable against application state in a single query -
  no reconciliation between an external queue's view of the world and ours.
- **No egress dependency.** An outage in a third-party queue cannot strand submissions.

## Consequences

**Accepted cost:** retries, exponential backoff, dead-lettering, and observability are
pg-boss configuration rather than a managed dashboard. This is mitigated by
`submission_events` - an append-only per-submission log the dashboard already requires,
which doubles as the audit trail we would otherwise get from a vendor UI.

**Operational trap, documented because it is silent:** pg-boss requires a **session-mode**
Postgres connection. Supabase's transaction pooler (port 6543) breaks prepared statements
and advisory locks, both of which pg-boss depends on. The worker must use the direct
connection or the session pooler (port 5432).

The failure signature is jobs that enqueue successfully and never run - no error, no
crash, submissions simply sit in `queued` forever. Any investigation of a stuck queue
should check the connection string before touching application code.

## Alternatives considered

- **Trigger.dev v3** - excellent Playwright support via build extensions and the best
  managed retry story. Rejected because Railway already provides the container it would
  supply, making it a paid dependency for capability we now have natively.
- **Inngest** - strong durable-step model and DX. Rejected for the same reason, plus it
  would still need a separate container host for the browser step, adding a moving part
  rather than removing one.

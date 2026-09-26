# ADR-0002: FastAPI API and transactional Postgres jobs

- Status: Accepted for local implementation; supersedes ADR-0001 after deployment verification.
- Date: 2026-09-26

## Context

The prototype combines a Next.js API with pg-boss and a Node Playwright worker. The product now requires a FastAPI backend and separate marketing and application hosts. FastAPI cannot safely write pg-boss's private tables, and an extra queue bridge service would add another failure point.

## Decision

Use the existing React/Next UI and Node Playwright form driver, add FastAPI for application behavior, and use a small transactional Postgres job table to connect approval and worker. Serve the marketing and application hosts from the web service with host-aware routing. The worker claims one job with `FOR UPDATE SKIP LOCKED` and never automatically reclaims it: a crash after a possible send requires investigation before another attempt. The existing web scraper remains an isolated, authenticated SSRF guarded endpoint.

## Trade-off

This keeps the tested form driver and UI. The queue has no external extension or session-mode Postgres connection requirement, but a claimed job can remain stuck after a worker crash; operators must inspect it. The intended Supabase project and Railway services still require release verification.

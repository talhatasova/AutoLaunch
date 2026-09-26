# ADR-0002: FastAPI API and Supabase queue

- Status: Proposed; supersedes ADR-0001 when the target Supabase project is verified.
- Date: 2026-09-26

## Context

The prototype combines a Next.js API with pg-boss and a Node Playwright worker. The product now requires a FastAPI backend and separate marketing and application hosts. FastAPI cannot safely write pg-boss's private tables, and an extra queue bridge service would add another failure point.

## Decision

Use the existing React/Next UI and Node Playwright drivers, add FastAPI for application behavior, and use a durable Supabase Postgres queue to connect API and worker. Serve the marketing and application hosts from the web service with host-aware routing. Keep the worker's third-party browser actions behind an explicit queue boundary.

## Trade-off

This keeps the tested form driver and UI while avoiding a full rewrite. It requires replacing the old Next API and pg-boss wiring and verifying the `pgmq` extension in the intended Supabase project before release. The API and worker must treat queue delivery as repeatable and prevent duplicate directory sends through submission state.

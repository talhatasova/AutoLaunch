# DirectoryLaunch

DirectoryLaunch lets a SaaS founder click Publish once and have the product submitted to free launch channels (directories, social feeds) by automation, then tracks each channel from receipt to live listing. Marketing site and app are separate hosts (`xxx` is a placeholder domain).

## Architecture

- Railway runs four services: marketing, web (React app), API (FastAPI), worker (Node + Playwright). Supabase provides Postgres and Auth.
- Publish writes a payload snapshot and a Postgres job in one transaction; the worker claims it once and never reclaims a crashed job.
- Receipt, review, and live are distinct outcomes. Candidate channels stay research until five free channels pass live certification.
- Treat directory sites and user-supplied URLs as untrusted input.
- Tests: unit and E2E tests are deferred during development; typecheck must pass. Live certification of channels with a real submission is the release gate.
- Prefer small modules with one responsibility; use the simplest design that satisfies the behavior.

## Read before working

| When you are... | Read |
| --- | --- |
| Touching worker automation, CAPTCHAs, accounts, inbox, live detection | `docs/agents/automation-rules.md` |
| Writing any database code or migration | `docs/agents/database-access.md` |
| Adding or reading logs, request ids, submission events, debugging a user report | `docs/agents/logging.md` |
| Deploying or changing Railway services | `docs/deployment.md` |
| Making marketing assets or copy for DirectoryLaunch | `docs/agents/marketing.md` |
| Creating or moving tickets | `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` |
| Changing domain behavior or naming | `docs/agents/domain.md` (then `CONTEXT-MAP.md`, `docs/adr/`) |
| Current product decisions | `.scratch/directorylaunch-v2/spec.md` |

## Skills

| Situation | Skills |
| --- | --- |
| Stress-test scope, settle domain terms | `mattpocock-skills:grilling`, `mattpocock-skills:domain-modeling` |
| Turn a plan into a spec or tickets | `to-spec` |
| Implement, review, debug | `mattpocock-skills:tdd` (when tests are in scope), `mattpocock-skills:code-review`, `mattpocock-skills:diagnosing-bugs` |
| Module design, throwaway experiments, research | `mattpocock-skills:codebase-design`, `mattpocock-skills:prototype`, `mattpocock-skills:research` |
| Smallest-change choices | `ponytail:ponytail`; audit with `ponytail:ponytail-review` |
| REST endpoints and errors | `ecc:api-design`, `ecc:error-handling` |
| FastAPI / Python | `ecc:fastapi-patterns`, `ecc:python-patterns` |
| Supabase schema, auth, RLS, queries | `supabase`, `supabase-postgres-best-practices`, `ecc:postgres-patterns`, `ecc:database-migrations` |
| React screens | `ecc:react-patterns`, `ecc:frontend-design-direction`, `frontend-design:frontend-design`, `ui-ux-pro-max`, `shadcn`, `ecc:make-interfaces-feel-better` |
| Dashboard charts | `dataviz` |
| Browser submission flows and QA | `ecc:e2e-testing`, `ecc:browser-qa` |
| Security review | `ecc:security-review`, `security-review` |
| Railway, Docker, deploy | `railway:use-railway`, `ecc:deployment-patterns`, `ecc:docker-patterns` |
| Anthropic SDK (launch text generation) | `claude-api` |
| UI and marketing screen design | Stitch MCP (`mcp__stitch__*`), `design:design-critique` |
| Videos | `remotion:remotion-best-practices`, `remotion:remotion-saas`, `remotion:remotion-create` |
| Marketing copy, SEO, voice | `ecc:marketing-campaign`, `ecc:seo`, `searchfit-seo:seo-audit`, `ecc:brand-voice` |
| Editing this file or agent docs | `mattpocock-skills:writing-for-agents` |

## Subagents (`.claude/agents/`)

The main session orchestrates and keeps its context small. Dispatch Sonnet for well-scoped work and Opus for complex or cross-cutting work. Give agents disjoint folders, or a worktree when they both touch dependencies.

| Agent | Dispatch for |
| --- | --- |
| `architect` | Cross-cutting design, ADRs, shared contracts, build order |
| `backend` | FastAPI routes in `apps/api`, metadata scraping, SSRF guard, publish |
| `database` | Migrations, RLS, schema |
| `automation-pipeline` | `apps/worker`: drivers, solver, inbox, live detector |
| `directory-research` | Classifying and re-verifying channels in the catalog |
| `frontend` | `apps/web` and `apps/marketing` UI |
| `qa` | Tests, once the product settles; certification evidence |
| `security` | Review before deploy and after auth, input, or DB changes |

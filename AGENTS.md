
# DirectoryLaunch

DirectoryLaunch helps SaaS founders find suitable listing directories, submit product details, track each attempt through publication, and analyze the results. `https://xxx.com` is the marketing site and `https://app.xxx.com` is the application; `xxx` is a placeholder until a domain is chosen.

## Architecture direction

- Railway hosts the services. FastAPI owns the application API, React owns the web interface, and a Playwright worker handles verified form submissions.
- Supabase provides Postgres and authentication. Treat directory websites and user supplied URLs as untrusted inputs.
- Founder approval writes a payload snapshot and a Postgres job in one transaction. The worker claims each job once; ambiguous sends require investigation before retry.
- Keep marketing and application entry points separate. Record submission receipt, review, and live publication as distinct outcomes. Recheck automatic integrations every seven days.
- Candidate directories stay research only until five free targets pass live end-to-end certification for release. The current seed certifies none.
- Prefer small modules with one clear responsibility and explicit boundaries. Apply SOLID when it removes coupling; use the simplest design that satisfies the current behavior.

## Skill map

| Situation                                         | Skills to use                                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Set up repo conventions and issue tracking        | `setup-matt-pocock-skills`                                                                             |
| Stress test product scope and settle domain terms | `grill-with-docs` (`grilling`, `domain-modeling`)                                                  |
| Turn an agreed plan into work                     | `to-tickets`; then `implement`, `tdd` at useful seams, and `code-review`                         |
| Design or change REST endpoints                   | `ecc:api-design`; use `ecc:error-handling` for failure contracts                                     |
| Build or review FastAPI code                      | `ecc:fastapi-patterns`, `ecc:python-patterns`; keep schema changes in migrations                     |
| Change Supabase schema, auth, RLS, or queries     | `supabase`, `supabase-postgres-best-practices`; use `ecc:database-migrations` for migration review |
| Build React screens or marketing pages            | `design-taste-frontend`, `ecc:frontend-design-direction`, `ecc:react-patterns`                     |
| Build or repair browser submission flows          | `playwright`, `ecc:e2e-testing`; use `diagnosing-bugs` for failures                                |
| Make implementation choices                       | `ponytail`: inspect existing code, reuse native features, keep the smallest working change             |
| Edit this file or agent guidance                  | `writing-for-agents`                                                                                   |

## Agent skills

### Issue tracker

Implementation tickets live as local Markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five standard Matt Pocock triage states. See `docs/agents/triage-labels.md`.

### Domain docs

This monorepo uses separate context glossaries linked from `CONTEXT-MAP.md`. See `docs/agents/domain.md`.

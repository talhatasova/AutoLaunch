# DirectoryLaunch

DirectoryLaunch helps solo SaaS founders review a product profile, choose verified free listing directories, approve the exact submission details, and track receipts separately from live listings. `xxx.com` and `app.xxx.com` are placeholder hosts.

The free beta allows two products and two directory submissions per product. The catalog includes research entries, but an automatic target is selectable only after its complete free path, site rules, and receipt have been verified within seven days. No real directory is certified yet; five are required before launch.

## Services

- `apps/web`: React/Next marketing and application UI, Supabase email and Google sign in, and the SSRF guarded product metadata scraper.
- `apps/api`: FastAPI for authenticated products, catalog, selection approval, retry, and status reads.
- `apps/worker`: Playwright form worker. It claims only founder-approved database jobs and never retries an ambiguous send automatically.
- `supabase/migrations`: tenant policies, beta limits, immutable approval snapshots, and transactional jobs.

See [CLAUDE.md](CLAUDE.md) for the project and skill map, [the product contract](.scratch/directorylaunch-v1/spec.md), and [ADR-0002](docs/adr/0002-fastapi-and-native-queue.md).

## Local setup

1. Install Node 22, pnpm 9, Python 3.12+, and a local or intended Supabase project.
2. Copy `.env.example` values into service environments. The service role key belongs in the API and worker only; `INTERNAL_VERIFY_KEY` belongs in the API and web service.
3. Apply migrations in timestamp order and seed the catalog with `pnpm seed:directories`. Seed entries are research only until certified.
4. Run `pnpm --filter web dev`, `uvicorn app.main:app --reload` from `apps/api`, and `pnpm --filter worker start` in separate terminals.
5. Configure Supabase Auth site URL and redirect allow list for the app host. Enable email links and Google. For the `/auth/confirm` token-hash route, use an email template pointing to `/auth/confirm?token_hash={{ .TokenHash }}`; the default confirmation URL can use `/auth/callback`.

Run `pnpm -r typecheck`, `pnpm --filter web test`, `pnpm --filter worker test`, and `python -m pytest` in `apps/api` before release. The intended Supabase project and Railway services must be connected before production verification.

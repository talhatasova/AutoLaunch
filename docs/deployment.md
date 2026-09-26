# Railway release checklist

The production gate stays closed until the intended Supabase project is accessible and five free directories have current, consented end-to-end certification records. Existing seed rows are research, including the two form candidates.

## Services

Create three Railway services from the repository root, each with its own `RAILWAY_DOCKERFILE_PATH`:

| Service | Dockerfile | Public domain |
| --- | --- | --- |
| Web | `apps/web/Dockerfile` | `xxx.com`, `app.xxx.com` |
| API | `apps/api/Dockerfile` | A public HTTPS API host for browser requests |
| Worker | `apps/worker/Dockerfile` | None |

Set `NEXT_PUBLIC_MARKETING_URL=https://xxx.com`, `NEXT_PUBLIC_APP_URL=https://app.xxx.com`, and `NEXT_PUBLIC_API_URL` to the API's public HTTPS URL on the web service. Set `API_INTERNAL_URL` to the API private Railway URL for server rendering. Set `WEB_INTERNAL_URL` to the web private Railway URL on the API service. Share a long random `INTERNAL_VERIFY_KEY` between web and API. Give `SUPABASE_SERVICE_ROLE_KEY` only to API and worker. Both web and API need the public Supabase URL and publishable key under their respective variable names in `.env.example`. Set API `APP_ORIGIN=https://app.xxx.com`.

`NEXT_PUBLIC_*` values are compiled into the web bundle. Configure them before the Docker build and rebuild when they change. Keep Railway skipped builds disabled for the web service unless runtime configuration replaces these values.

Configure Supabase Auth site URL and redirect allow list for the app host, email links, and Google OAuth. Apply migrations in order, then seed the catalog. Regenerate `packages/shared/src/database.types.ts` from the intended project after migrations; the checked-in types were updated for new enums but the project is not yet reachable to regenerate table columns.

## Release proof

1. Confirm marketing and app hosts route correctly, email and Google sign in, expired sessions, and cross-account isolation.
2. Verify product creation, edits before sending, two-product cap, and two submissions per product against the database.
3. Certify five real free targets with current terms, required fields, challenge scan, site rules, and an observed receipt. Only an authorized founder's approved profile may be submitted. Record `automation_verified_at`, `last_verified_at`, pricing evidence, and consent rules after successful certification.
4. Confirm worker receipt becomes `pending_review`; ambiguous post-click result becomes `unconfirmed` with no automatic retry. Check explicit retry only for a confirmed pre-send failure.
5. Confirm a founder-supplied public listing URL transitions to `live` only after the verifier sees a link to that product on the directory site.
6. Recheck each certified form every seven days. The automated form scan does not refresh pricing or site-rule evidence; those require editorial review, and target eligibility expires if that review is older than seven days.

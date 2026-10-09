# Database access

All database access goes through one dedicated data-access folder per service, via an ORM. Only that folder imports a DB client or writes raw SQL.

- **API:** SQLAlchemy 2.0 in `apps/api/app/db/`. Each request runs `set local role authenticated` and sets `request.jwt.claims`, so RLS and `auth.uid()` RPCs keep working. Service-role operations are explicit and kept in separate functions.
- **Worker:** Drizzle ORM in `apps/worker/src/db/`.
- **Web:** reaches Supabase only for Auth, never the database.
- **Schema:** changes only as SQL migrations in `supabase/migrations/`. ORM models mirror the migrations; they never define the schema.
- **Secrets:** the service-role key and `TOKEN_ENCRYPTION_KEY` stay in API and worker environments, never the browser.

For schema, RLS, and migration work use the `database` subagent and the Supabase skills in `CLAUDE.md`.

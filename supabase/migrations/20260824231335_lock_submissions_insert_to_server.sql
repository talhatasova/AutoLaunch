-- A column-level revoke is inert while a table-level INSERT grant stands: has_column_privilege
-- reports true from the table grant, and PostgREST accepts the column. The table grant is
-- what has to go.
--
-- Clients never need to create submissions directly - they POST /api/apps, which now inserts
-- with a service-role client after checking app ownership in code. Removing the grant makes
-- consent_granted_at and status server-controlled by construction rather than by convention.
--
-- SELECT is untouched: the dashboard still reads submissions under RLS.

revoke insert on public.submissions from authenticated, anon;

drop policy if exists "users create submissions for their own apps" on public.submissions;
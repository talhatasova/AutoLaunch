-- Row Level Security for DirectoryLaunch.
--
-- RLS is the ONLY tenant boundary in this system. There is no application-layer
-- ownership filter to fall back on, so every table below has RLS enabled and an
-- explicit policy per operation it permits.
--
-- Two rules applied throughout:
--   1. auth.uid() is wrapped as (select auth.uid()) so Postgres evaluates it once
--      per statement (InitPlan) instead of once per row.
--   2. Every column named in a policy predicate is indexed (see migration 0001),
--      or the policy degrades into a sequential scan.
--
-- The worker connects with the service_role key, which bypasses RLS entirely.
-- That key never reaches the browser and apps/web never imports it.

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. No exceptions.
-- ---------------------------------------------------------------------------

alter table public.apps               enable row level security;
alter table public.directories        enable row level security;
alter table public.submissions        enable row level security;
alter table public.submission_events  enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges. Enabling RLS does not grant table access; the Data API roles need
-- explicit grants, and those grants are deliberately narrower than "all".
-- ---------------------------------------------------------------------------

revoke all on public.apps              from anon, authenticated;
revoke all on public.directories       from anon, authenticated;
revoke all on public.submissions       from anon, authenticated;
revoke all on public.submission_events from anon, authenticated;

-- directories: public reference data, read-only for every client role.
grant select on public.directories to anon, authenticated;

-- apps: the founder fully owns their own rows.
grant select, insert, update, delete on public.apps to authenticated;

-- submissions: a founder may enqueue and read. State transitions after enqueue
-- belong to the worker (service_role), so no UPDATE/DELETE is granted.
grant select, insert on public.submissions to authenticated;

-- submission_events: append-only. SELECT + INSERT and nothing else, at both the
-- privilege layer and the policy layer.
grant select, insert on public.submission_events to authenticated;

-- ---------------------------------------------------------------------------
-- directories - public read, no client writes
-- ---------------------------------------------------------------------------

create policy "directories are readable by anyone"
  on public.directories
  for select
  to anon, authenticated
  using (true);

-- Intentionally no INSERT/UPDATE/DELETE policy: the seed script writes this
-- table under the service role.

-- ---------------------------------------------------------------------------
-- apps - owned by auth.uid()
-- ---------------------------------------------------------------------------

create policy "users read their own apps"
  on public.apps
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users create apps for themselves"
  on public.apps
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- WITH CHECK as well as USING: without it a user could hand their row to
-- someone else by rewriting user_id.
create policy "users update their own apps"
  on public.apps
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "users delete their own apps"
  on public.apps
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- submissions - ownership established by joining up to apps.user_id
-- ---------------------------------------------------------------------------

create policy "users read submissions for their own apps"
  on public.submissions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.apps a
      where a.id = submissions.app_id
        and a.user_id = (select auth.uid())
    )
  );

create policy "users create submissions for their own apps"
  on public.submissions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.apps a
      where a.id = submissions.app_id
        and a.user_id = (select auth.uid())
    )
  );

-- No UPDATE or DELETE policy: submission status is the worker's to move.

-- ---------------------------------------------------------------------------
-- submission_events - APPEND-ONLY, ownership joined up through submissions
-- ---------------------------------------------------------------------------

create policy "users read events for their own submissions"
  on public.submission_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.submissions s
      join public.apps a on a.id = s.app_id
      where s.id = submission_events.submission_id
        and a.user_id = (select auth.uid())
    )
  );

create policy "users append events to their own submissions"
  on public.submission_events
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.submissions s
      join public.apps a on a.id = s.app_id
      where s.id = submission_events.submission_id
        and a.user_id = (select auth.uid())
    )
  );

-- Deliberately NO update policy and NO delete policy. The timeline is a record
-- of what happened; rewriting history would make the dashboard a liar.

-- Realtime: the dashboard subscribes to the submission timeline.
--
-- Realtime still evaluates RLS per subscriber, so a client only receives events
-- for submissions belonging to their own apps (see migration 0002).

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'submission_events'
  ) then
    alter publication supabase_realtime add table public.submission_events;
  end if;
end
$$;

-- Also stream submissions themselves so a status change (queued -> running ->
-- succeeded/needs_manual) repaints the row without a refetch.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'submissions'
  ) then
    alter publication supabase_realtime add table public.submissions;
  end if;
end
$$;

-- UPDATE payloads on submissions must carry enough of the old row for RLS to be
-- evaluated against it; default replica identity (primary key) is sufficient
-- here because the RLS predicate keys off app_id, which never changes.

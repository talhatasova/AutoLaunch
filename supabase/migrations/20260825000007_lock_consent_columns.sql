-- Make consent non-forgeable.
--
-- submissions.consent_granted_at is the ONLY thing authorising the worker to tick a third
-- party's terms checkbox. Its purpose is to be evidence that we showed that directory's
-- terms to the founder first.
--
-- It was not evidence. `authenticated` held table-level INSERT on submissions, and the RLS
-- policy only checked app ownership - never that the timestamp was legitimate. Verified
-- before the fix:
--
--   has_column_privilege('authenticated','public.submissions','consent_granted_at','INSERT')
--     -> true
--
-- A user could skip the UI, POST straight to /rest/v1/submissions with the timestamp set,
-- and cause us to accept terms on a page they never saw. A value the client writes cannot
-- substantiate anything. `status` had the same exposure - milder, since no UPDATE policy
-- exists to rewrite history, but a row could still be seeded as already 'succeeded'.
--
-- NOTE FOR ANYONE TEMPTED BY A NARROWER FIX: a column-level
-- `revoke insert (consent_granted_at)` is INERT while a table-level INSERT grant stands.
-- has_column_privilege keeps reporting true from the table grant and PostgREST keeps
-- accepting the column. The table grant is what has to go.
--
-- Clients never needed to create submissions directly - they POST /api/apps, which now
-- inserts with a service-role client after checking app ownership in code
-- (src/lib/supabase/admin.ts, the single audited exception, enforced by
-- no-service-role.test.ts). SELECT is untouched, so the dashboard still reads under RLS.

revoke insert on public.submissions from authenticated, anon;

drop policy if exists "users create submissions for their own apps" on public.submissions;

comment on column public.submissions.consent_granted_at is
  'When the founder explicitly agreed to this directory''s terms. Written server-side only: clients hold no INSERT on submissions and there is no UPDATE policy, so it can be neither forged at creation nor back-filled. NULL = no consent, and the worker then refuses to tick a terms checkbox.';

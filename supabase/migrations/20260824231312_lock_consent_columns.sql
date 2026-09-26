revoke insert (consent_granted_at) on public.submissions from authenticated, anon;
revoke insert (status)             on public.submissions from authenticated, anon;

comment on column public.submissions.consent_granted_at is
  'When the founder explicitly agreed to this directory''s terms, written server-side only. Clients cannot INSERT this column (revoked) and there is no UPDATE policy, so it can be neither forged at creation nor back-filled. NULL = no consent; the worker then refuses to tick a terms checkbox.';
alter table public.submissions
  add column approved_payload jsonb,
  add column approved_at timestamptz,
  add column obligation_confirmed_at timestamptz,
  add column receipt_evidence jsonb,
  add column live_checked_at timestamptz;

create table public.submission_jobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index submission_jobs_pending_idx on public.submission_jobs(available_at)
  where claimed_at is null;
alter table public.submission_jobs enable row level security;
revoke all on public.submission_jobs from anon, authenticated;

-- The original prototype let clients enqueue rows and append timeline events.
-- Approval now owns both writes, so a browser cannot bypass the reviewed payload.
revoke insert on public.submissions from authenticated;
drop policy if exists "users create submissions for their own apps" on public.submissions;
revoke insert on public.submission_events from authenticated;
drop policy if exists "users append events to their own submissions" on public.submission_events;

-- Product and identity fields are frozen once any submission exists.
create or replace function public.guard_sent_product()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.user_id is distinct from new.user_id then
    raise exception 'Product owner cannot change';
  end if;
  if exists (select 1 from public.submissions where app_id = old.id)
     and (old.url, old.name, old.tagline, old.description, old.category,
          old.contact_name, old.contact_email, old.logo_url, old.screenshot_url)
       is distinct from
         (new.url, new.name, new.tagline, new.description, new.category,
          new.contact_name, new.contact_email, new.logo_url, new.screenshot_url) then
    raise exception 'Sent product details cannot change';
  end if;
  return new;
end;
$$;
create trigger guard_sent_product before update on public.apps
for each row execute function public.guard_sent_product();
revoke delete on public.apps from authenticated;
drop policy if exists "users delete their own apps" on public.apps;

-- The one atomic approval boundary: selects, checks, snapshots, and queues.
create or replace function public.approve_targets(
  p_app_id uuid, p_targets jsonb, p_reviewed_contact_email text
)
returns setof public.submissions
language plpgsql security definer set search_path = '' as $$
declare
  product public.apps%rowtype;
  target jsonb;
  directory public.directories%rowtype;
  created public.submissions%rowtype;
  target_id uuid;
  founder_email text;
  now_utc timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if jsonb_typeof(p_targets) is distinct from 'array' then
    raise exception 'Select one or two directories';
  end if;
  if jsonb_array_length(p_targets) not between 1 and 2 then
    raise exception 'Select one or two directories';
  end if;
  select * into product from public.apps
    where id = p_app_id and user_id = auth.uid() for update;
  if not found then raise exception 'Product not found'; end if;
  if nullif(btrim(product.name), '') is null or nullif(btrim(product.tagline), '') is null
     or nullif(btrim(product.description), '') is null or nullif(btrim(product.category), '') is null
     or nullif(btrim(product.contact_name), '') is null then
    raise exception 'Complete all reviewed product details first';
  end if;
  if (select count(*) from public.submissions where app_id = p_app_id)
       + jsonb_array_length(p_targets) > 2 then
    raise exception 'Free beta allows two submissions per product';
  end if;
  select email into founder_email from auth.users where id = auth.uid();
  if founder_email is null then raise exception 'A verified email is required'; end if;
  if founder_email is distinct from p_reviewed_contact_email then
    raise exception 'Contact email changed; refresh and review before approving';
  end if;

  for target in select value from jsonb_array_elements(p_targets) loop
    target_id := (target->>'directory_id')::uuid;
    select * into directory from public.directories where id = target_id;
    if not found or directory.status <> 'active' or directory.tier <> 2
       or directory.requires_captcha or directory.price_kind <> 'free'
       or cardinality(directory.requires_profile_fields) > 0
       or not directory.receipt_verified or not directory.rules_permit_automation
       or directory.automation_verified_at is null
       or directory.price_checked_at is null
       or directory.price_checked_at < now_utc - interval '7 days'
       or directory.last_verified_at is null
       or directory.last_verified_at < now_utc - interval '7 days' then
      raise exception 'Directory is not currently eligible';
    end if;
    if directory.requires_consent and coalesce((target->>'consent')::boolean, false) is not true then
      raise exception 'Directory terms need your approval';
    end if;
    if directory.requires_consent and directory.terms_url is null then
      raise exception 'Directory terms are not available';
    end if;
    if directory.obligation is not null
       and coalesce((target->>'obligation_confirmed')::boolean, false) is not true then
      raise exception 'Confirm the directory requirement first';
    end if;
    insert into public.submissions (
      app_id, directory_id, status, approved_at, consent_granted_at,
      obligation_confirmed_at, approved_payload
    ) values (
      p_app_id, target_id, 'queued', now_utc,
      case when (target->>'consent')::boolean is true then now_utc end,
      case when (target->>'obligation_confirmed')::boolean is true then now_utc end,
      jsonb_build_object(
        'name', product.name, 'tagline', product.tagline,
        'description', product.description, 'url', product.url,
        'category', product.category, 'contact_email', founder_email,
        'founder_name', product.contact_name, 'logo_url', product.logo_url,
        'screenshot_url', product.screenshot_url, 'tags', jsonb_build_array(),
        'company_profile', null
      )
    ) returning * into created;
    insert into public.submission_jobs (submission_id) values (created.id);
    insert into public.submission_events (submission_id, kind, message)
      values (created.id, 'queued', 'Founder approved this directory and payload.');
    return next created;
  end loop;
  update public.apps set status = 'submitted' where id = p_app_id;
end;
$$;
revoke all on function public.approve_targets(uuid, jsonb, text) from public, anon;
grant execute on function public.approve_targets(uuid, jsonb, text) to authenticated;

create or replace function public.claim_submission_job()
returns table(job_id uuid, submission_id uuid, app_id uuid, directory_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Worker only'; end if;
  return query
    with claimed as (
      update public.submission_jobs j set claimed_at = now()
      where j.id = (
        select pending.id from public.submission_jobs pending
        where pending.claimed_at is null and pending.available_at <= now()
        order by pending.available_at, pending.created_at
        for update skip locked limit 1
      )
      returning j.id, j.submission_id
    ), running as (
      update public.submissions s set status = 'running'
      from claimed c where s.id = c.submission_id
      returning s.id, s.app_id, s.directory_id
    )
    select c.id, s.id, s.app_id, s.directory_id from claimed c join running s on s.id = c.submission_id;
end;
$$;
revoke all on function public.claim_submission_job() from public, anon, authenticated;
grant execute on function public.claim_submission_job() to service_role;

create or replace function public.retry_failed_submission(p_submission_id uuid)
returns public.submissions
language plpgsql security definer set search_path = '' as $$
declare
  submission public.submissions%rowtype;
  directory public.directories%rowtype;
begin
  select s.* into submission from public.submissions s
    join public.apps a on a.id = s.app_id
    where s.id = p_submission_id and a.user_id = auth.uid() for update of s;
  if not found then raise exception 'Submission not found'; end if;
  if submission.status <> 'failed' or submission.submitted_at is not null then
    raise exception 'Only a confirmed pre-send failure can be retried';
  end if;
  select * into directory from public.directories where id = submission.directory_id;
  if directory.status <> 'active' or directory.tier <> 2 or directory.price_kind <> 'free'
     or directory.requires_captcha or cardinality(directory.requires_profile_fields) > 0
     or not directory.receipt_verified
     or not directory.rules_permit_automation or directory.automation_verified_at is null
     or directory.price_checked_at is null or directory.price_checked_at < now() - interval '7 days'
     or directory.last_verified_at is null or directory.last_verified_at < now() - interval '7 days' then
    raise exception 'Directory needs re-verification before retry';
  end if;
  update public.submissions set status = 'queued', error_message = null
    where id = p_submission_id returning * into submission;
  update public.submission_jobs set claimed_at = null, finished_at = null, available_at = now()
    where submission_id = p_submission_id;
  insert into public.submission_events(submission_id, kind, message)
    values (p_submission_id, 'queued', 'Founder requested retry after a pre-send failure.');
  return submission;
end;
$$;
revoke all on function public.retry_failed_submission(uuid) from public, anon;
grant execute on function public.retry_failed_submission(uuid) to authenticated;

-- The checked public URL and live timeline event commit together.
create function public.confirm_live_listing(
  p_submission_id uuid, p_owner_id uuid, p_url text, p_checked_at timestamptz
)
returns public.submissions
language plpgsql security definer set search_path = '' as $$
declare
  submission public.submissions%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Verifier only'; end if;
  if p_url is null or p_checked_at is null or p_url !~* '^https?://'
     or p_checked_at < now() - interval '5 minutes'
     or p_checked_at > now() + interval '1 minute' then
    raise exception 'Invalid listing evidence';
  end if;
  update public.submissions s set
    status = 'live', result_url = p_url, live_checked_at = p_checked_at
  from public.apps a
  where s.id = p_submission_id and a.id = s.app_id and a.user_id = p_owner_id
    and s.status in ('pending_review', 'unconfirmed')
  returning s.* into submission;
  if not found then raise exception 'Submission changed while verifying'; end if;
  insert into public.submission_events(submission_id, kind, message, payload)
    values (p_submission_id, 'live', 'Public listing URL checked and confirmed.',
            jsonb_build_object('url', p_url));
  return submission;
end;
$$;
revoke all on function public.confirm_live_listing(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.confirm_live_listing(uuid, uuid, text, timestamptz)
  to service_role;

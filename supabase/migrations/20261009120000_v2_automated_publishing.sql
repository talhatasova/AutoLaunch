-- DirectoryLaunch v2: one-click automated publishing.
-- Contract: .scratch/directorylaunch-v2/issues/00-shared-contract.md
--
-- Enum values added here are NOT referenced by any statement in this file that executes at
-- migration time (a new enum value cannot be used in the transaction that adds it). Function
-- bodies and CHECKs below avoid the literal 'not_published' for that reason.

alter type public.submission_status add value if not exists 'not_published';
alter type public.submission_event_kind add value if not exists 'not_published';

-- ---------------------------------------------------------------------------
-- Founder plan
-- ---------------------------------------------------------------------------
create table public.founder_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);
alter table public.founder_profiles enable row level security;
revoke all on public.founder_profiles from anon, authenticated;
-- Read-only for the owner: a founder can never promote their own plan. Operators use SQL.
grant select on public.founder_profiles to authenticated;
create policy "founders read their own profile"
  on public.founder_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.handle_new_founder()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.founder_profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_founder() from public, anon, authenticated;
create trigger on_auth_user_created_founder_profile
after insert on auth.users
for each row execute function public.handle_new_founder();

insert into public.founder_profiles (user_id)
select id from auth.users on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Product (apps) columns
-- ---------------------------------------------------------------------------
alter table public.apps
  add column public_contact_email text,
  add column launch_post text,
  add column long_description text;
alter table public.apps
  add constraint apps_public_contact_email_len
    check (public_contact_email is null or length(public_contact_email) <= 320),
  add constraint apps_launch_post_len check (launch_post is null or length(launch_post) <= 300);

-- Founders may edit only descriptive columns; url, status, user_id, id, created_at stay server-controlled.
revoke update on public.apps from authenticated;
grant update (name, tagline, description, category, contact_name, logo_url, screenshot_url,
              public_contact_email, launch_post, long_description)
  on public.apps to authenticated;

-- ---------------------------------------------------------------------------
-- Channel catalog (directories) columns
-- ---------------------------------------------------------------------------
alter table public.directories
  add column channel_type text not null default 'directory'
    check (channel_type in ('directory', 'social', 'article', 'list')),
  add column automation text not null default 'manual'
    check (automation in ('automated', 'manual', 'paid_link')),
  add column terms_prohibit_automation boolean not null default false,
  add column challenge_kind text not null default 'none'
    check (challenge_kind in ('none', 'arithmetic', 'recaptcha_v2', 'recaptcha_v3', 'hcaptcha', 'turnstile')),
  add column needs_platform_account boolean not null default false,
  add column needs_email_verification boolean not null default false,
  add column live_lookup jsonb
    check (live_lookup is null or live_lookup->>'kind' in ('url_pattern', 'site_search', 'none')),
  add column recipe jsonb;

-- v2 drops "never past a challenge": a challenge channel may now be automated via a solver.
alter table public.directories drop constraint directories_captcha_implies_tier3;

create index directories_automation_idx on public.directories (automation)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- Platform accounts: service role only (RLS on, zero policies, no grants)
-- ---------------------------------------------------------------------------
create table public.platform_accounts (
  id uuid primary key default gen_random_uuid(),
  directory_id uuid not null unique references public.directories (id) on delete cascade,
  username text not null,
  secret_enc text not null,
  session_enc text,
  status text not null default 'active' check (status in ('active', 'locked', 'broken')),
  updated_at timestamptz not null default now()
);
alter table public.platform_accounts enable row level security;
revoke all on public.platform_accounts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Submission columns
-- ---------------------------------------------------------------------------
alter table public.submissions
  add column next_live_check_at timestamptz,
  add column live_check_deadline timestamptz,
  add column challenge_cost_cents integer not null default 0 check (challenge_cost_cents >= 0),
  add column inbox_address text;

-- Live detector scan path.
create index submissions_live_check_due_idx on public.submissions (next_live_check_at)
  where next_live_check_at is not null and status in ('pending_review', 'succeeded');

-- ---------------------------------------------------------------------------
-- Eligibility (replaces the v1 gate: captcha, account, and price no longer block)
-- ---------------------------------------------------------------------------
create or replace function public.directory_eligible(d public.directories)
returns boolean language sql stable set search_path = '' as $$
  select d.automation = 'automated'
     and d.status = 'active'
     and d.automation_verified_at is not null
     and d.last_verified_at is not null
     and d.last_verified_at > now() - interval '7 days';
$$;

-- ---------------------------------------------------------------------------
-- Plan-aware product limit
-- ---------------------------------------------------------------------------
create or replace function public.enforce_beta_product_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  user_plan text;
begin
  -- Serialize concurrent creates by this founder, including direct Data API writes.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  insert into public.founder_profiles (user_id) values (new.user_id) on conflict do nothing;
  select plan into user_plan from public.founder_profiles where user_id = new.user_id;
  if user_plan = 'free'
     and (select count(*) from public.apps where user_id = new.user_id) >= 2 then
    raise exception 'Free plan allows two products per founder' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_beta_product_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- publish_product: the single approval boundary (replaces approve_targets)
-- ---------------------------------------------------------------------------
drop function public.approve_targets(uuid, jsonb, text);

create function public.publish_product(p_app_id uuid, p_directory_ids uuid[] default null)
returns setof public.submissions
language plpgsql security definer set search_path = '' as $$
declare
  product public.apps%rowtype;
  d public.directories%rowtype;
  created public.submissions%rowtype;
  user_plan text;
  remaining integer;
  now_utc timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into product from public.apps
    where id = p_app_id and user_id = auth.uid() for update;
  if not found then raise exception 'Product not found'; end if;
  if nullif(btrim(product.name), '') is null or nullif(btrim(product.tagline), '') is null
     or nullif(btrim(product.description), '') is null or nullif(btrim(product.category), '') is null then
    raise exception 'Complete all reviewed product details first';
  end if;

  insert into public.founder_profiles (user_id) values (auth.uid()) on conflict do nothing;
  select plan into user_plan from public.founder_profiles where user_id = auth.uid();
  -- Free: 2 automated submissions per product, counting those already made. Pro: no cap.
  if user_plan = 'free' then
    select greatest(0, 2 - count(*)) into remaining
    from public.submissions s
    where s.app_id = p_app_id;
  end if;

  if p_directory_ids is not null then
    if exists (
      select 1 from unnest(p_directory_ids) i
      where not exists (select 1 from public.directories x
                        where x.id = i and public.directory_eligible(x))
    ) then
      raise exception 'Directory is not currently eligible';
    end if;
    if remaining is not null and (
      select count(*) from public.directories x
      where x.id = any(p_directory_ids)
        and not exists (select 1 from public.submissions s
                        where s.app_id = p_app_id and s.directory_id = x.id)
    ) > remaining then
      raise exception 'Free plan allows two automated channels per product';
    end if;
  end if;

  -- Any existing submission (active or terminal) is skipped; failed pre-send ones go through
  -- retry_failed_submission. UNIQUE (app_id, directory_id) backs this structurally.
  for d in
    select x.* from public.directories x
    where public.directory_eligible(x)
      and (p_directory_ids is null or x.id = any(p_directory_ids))
      and not exists (select 1 from public.submissions s
                      where s.app_id = p_app_id and s.directory_id = x.id)
    order by (x.price_kind = 'free') desc, x.domain_rating desc nulls last, x.name
    limit coalesce(remaining, 1000000)
  loop
    -- The Publish click is the founder's approval of the terms/obligation of every channel
    -- it covers, so both are stamped here rather than asked for per channel.
    insert into public.submissions (
      app_id, directory_id, status, approved_at, consent_granted_at,
      obligation_confirmed_at, approved_payload
    ) values (
      p_app_id, d.id, 'queued', now_utc,
      case when d.requires_consent then now_utc end,
      case when d.obligation is not null then now_utc end,
      jsonb_build_object(
        'name', product.name, 'tagline', product.tagline,
        'description', product.description, 'url', product.url,
        'category', product.category,
        'contact_email', null,
        'public_contact_email', product.public_contact_email,
        'inbox_address', null,
        'founder_name', coalesce(nullif(btrim(product.contact_name), ''), product.name),
        'launch_post', product.launch_post,
        'long_description', product.long_description,
        'logo_url', product.logo_url, 'screenshot_url', product.screenshot_url,
        'tags', jsonb_build_array(), 'company_profile', null
      )
    ) returning * into created;
    insert into public.submission_jobs (submission_id) values (created.id);
    insert into public.submission_events (submission_id, kind, message)
      values (created.id, 'queued', 'Founder published this product to this channel.');
    return next created;
  end loop;

  update public.apps set status = 'submitted' where id = p_app_id and status <> 'submitted';
end;
$$;
revoke all on function public.publish_product(uuid, uuid[]) from public, anon;
grant execute on function public.publish_product(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- retry_failed_submission: same behavior, new eligibility rule
-- ---------------------------------------------------------------------------
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
  if not public.directory_eligible(directory) then
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

-- claim_submission_job is unchanged: it never consulted eligibility, and a crashed claimed
-- job is still never reclaimed.

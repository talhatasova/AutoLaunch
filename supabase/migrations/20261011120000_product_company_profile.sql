-- Founder-supplied company details (stage, revenue, team size) that some directory forms require.
alter table public.apps add column company_profile jsonb;
alter table public.apps add constraint apps_company_profile_shape check (
  company_profile is null or (
    jsonb_typeof(company_profile) = 'object'
    and company_profile - 'stage' - 'monthly_revenue' - 'team_size' = '{}'::jsonb
  )
);
grant update (company_profile) on public.apps to authenticated;

create or replace function public.publish_product(p_app_id uuid, p_directory_ids uuid[] default null)
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
        'tags', jsonb_build_array(), 'company_profile', product.company_profile
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

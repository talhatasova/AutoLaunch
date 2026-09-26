-- A product is saved only after the founder reviews its scraped draft.
alter table public.apps
  add column category text,
  add column contact_name text,
  add column contact_email text;

alter table public.apps
  add constraint apps_category_len check (category is null or length(category) <= 100),
  add constraint apps_contact_name_len check (contact_name is null or length(contact_name) <= 120),
  add constraint apps_contact_email_len check (contact_email is null or length(contact_email) <= 320);

create or replace function public.enforce_beta_product_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serialize concurrent creates by this founder, including direct Data API writes.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (select count(*) from public.apps where user_id = new.user_id) >= 2 then
    raise exception 'Free beta allows two products per founder' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enforce_beta_product_limit
before insert on public.apps
for each row execute function public.enforce_beta_product_limit();

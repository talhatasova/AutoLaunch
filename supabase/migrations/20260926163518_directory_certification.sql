-- Research may appear in the catalog; only a certified path may be selected.
alter type public.submission_status add value if not exists 'pending_review';
alter type public.submission_status add value if not exists 'unconfirmed';
alter type public.submission_status add value if not exists 'live';
alter type public.app_status add value if not exists 'submitted';
alter type public.submission_event_kind add value if not exists 'receipt';
alter type public.submission_event_kind add value if not exists 'unconfirmed';
alter type public.submission_event_kind add value if not exists 'live';

alter table public.directories
  add column price_kind text not null default 'unknown',
  add column price_note text,
  add column price_source_url text,
  add column price_checked_at timestamptz,
  add column obligation text,
  add column terms_url text,
  add column automation_verified_at timestamptz,
  add column automation_checked_at timestamptz,
  add column automation_check_note text,
  add column receipt_verified boolean not null default false,
  add column rules_permit_automation boolean not null default false;

alter table public.directories
  add constraint directories_price_kind_check
    check (price_kind in ('free', 'paid', 'unknown'));

comment on column public.directories.automation_verified_at is
  'Date of an observed end-to-end automatic send. Null means candidate research only.';

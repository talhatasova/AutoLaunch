-- DirectoryLaunch initial schema.
--
-- Enum names and values mirror the zod schemas in packages/shared/src exactly.
-- If you change one, change the other in the same commit or the generated
-- database.types.ts will silently disagree with the runtime validators.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- packages/shared/src/status.ts :: appStatusSchema
create type public.app_status as enum ('draft', 'ready', 'launching', 'done');

-- packages/shared/src/status.ts :: directoryStatusSchema
create type public.directory_status as enum ('active', 'broken');

-- packages/shared/src/status.ts :: submissionStatusSchema
-- needs_manual is a terminal SUCCESS-ADJACENT state, not a failure.
create type public.submission_status as enum (
  'queued',
  'running',
  'succeeded',
  'failed',
  'needs_manual'
);

-- packages/shared/src/directory.ts :: submissionMethodSchema
create type public.submission_method as enum ('api', 'form', 'manual');

-- packages/shared/src/submission.ts :: submissionEventKindSchema
create type public.submission_event_kind as enum (
  'queued',
  'started',
  'field_filled',
  'submitted',
  'succeeded',
  'challenge_detected',
  'manual_required',
  'selector_missing',
  'retry_scheduled',
  'failed'
);

-- ---------------------------------------------------------------------------
-- apps
-- ---------------------------------------------------------------------------

create table public.apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  name text not null,
  tagline text,
  description text,
  -- Files live in Supabase Storage; these columns hold the public URLs.
  logo_url text,
  screenshot_url text,
  status public.app_status not null default 'draft',
  scraped_at timestamptz,
  created_at timestamptz not null default now(),

  constraint apps_name_not_blank check (length(btrim(name)) > 0),
  constraint apps_url_is_http check (url ~* '^https?://'),
  -- Mirrors submissionPayloadSchema.tagline: z.string().max(200)
  constraint apps_tagline_len check (tagline is null or length(tagline) <= 200)
);

comment on table public.apps is
  'A founder''s product. Owned by exactly one auth user; every other user-scoped row reaches ownership through this table.';

-- RLS predicate column. Without this the apps policies sequential-scan.
create index apps_user_id_idx on public.apps (user_id);
create index apps_user_id_created_at_idx on public.apps (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- directories
-- ---------------------------------------------------------------------------

create table public.directories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  url text not null,
  submission_url text not null,
  -- z.union([1,2,3]) -> smallint + CHECK, so the generated TS type stays numeric.
  tier smallint not null,
  submission_method public.submission_method not null,
  requires_captcha boolean not null default false,
  category text not null,
  domain_rating smallint,
  api_config jsonb,
  form_schema jsonb,
  -- Every tiering verdict must name the URL checked, when, and what was observed.
  evidence jsonb not null,
  last_verified_at timestamptz,
  status public.directory_status not null default 'active',
  created_at timestamptz not null default now(),

  constraint directories_tier_range check (tier in (1, 2, 3)),
  constraint directories_domain_rating_range
    check (domain_rating is null or (domain_rating between 0 and 100)),

  -- The four invariants from seedDirectorySchema.superRefine, enforced in the
  -- database so a bad seed row cannot land at all, not just fail at load time.
  constraint directories_tier1_requires_api_config
    check (tier <> 1 or api_config is not null),
  constraint directories_tier2_requires_form_schema
    check (tier <> 2 or form_schema is not null),
  constraint directories_tier3_has_no_automation_config
    check (tier <> 3 or (api_config is null and form_schema is null)),
  -- We never automate past a challenge, so a CAPTCHA forces tier 3.
  constraint directories_captcha_implies_tier3
    check (not requires_captcha or tier = 3)
);

comment on table public.directories is
  'Catalog of submission targets. Public read-only reference data; written only by the seed script under the service role.';

create index directories_status_tier_idx on public.directories (status, tier);
create index directories_category_idx on public.directories (category);

-- ---------------------------------------------------------------------------
-- submissions
-- ---------------------------------------------------------------------------

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id) on delete cascade,
  directory_id uuid not null references public.directories (id) on delete cascade,
  status public.submission_status not null default 'queued',
  submitted_at timestamptz,
  result_url text,
  error_message text,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),

  -- Double-submission is structurally impossible, not an application-layer
  -- convention someone has to remember.
  constraint submissions_app_directory_unique unique (app_id, directory_id),
  constraint submissions_attempt_count_nonneg check (attempt_count >= 0)
);

comment on table public.submissions is
  'One app-to-directory submission. UNIQUE (app_id, directory_id) makes a duplicate submission impossible at the storage layer.';

-- RLS predicate column: every submissions policy joins up to apps through this.
create index submissions_app_id_idx on public.submissions (app_id);
create index submissions_directory_id_idx on public.submissions (directory_id);
create index submissions_app_id_status_idx on public.submissions (app_id, status);
-- Worker claim path: only rows actually waiting for a retry.
create index submissions_due_retry_idx
  on public.submissions (next_attempt_at)
  where status = 'queued' and next_attempt_at is not null;

-- ---------------------------------------------------------------------------
-- submission_events  (append-only timeline)
-- ---------------------------------------------------------------------------

create table public.submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  kind public.submission_event_kind not null,
  message text not null default '',
  payload jsonb,
  created_at timestamptz not null default now()
);

comment on table public.submission_events is
  'Append-only submission timeline. No UPDATE or DELETE policy exists by design; the dashboard subscribes to this table over Realtime.';

-- RLS predicate column: policies join submission_events -> submissions -> apps.
create index submission_events_submission_id_idx
  on public.submission_events (submission_id);
-- Timeline render order.
create index submission_events_submission_id_created_at_idx
  on public.submission_events (submission_id, created_at);

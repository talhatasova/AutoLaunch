-- Consent and company-profile requirements.
--
-- Added because apps/worker cannot implement two of its hard rules without them, and both
-- are already declared in the shared contract (packages/shared/src/directory.ts ::
-- directorySchema) - the table is what drifted, not the contract.
--
-- Purely additive: three nullable-or-defaulted columns, no data rewritten, no constraint
-- tightened. Safe to apply to a live database.
--
-- ---------------------------------------------------------------------------
-- directories.requires_consent / requires_profile_fields
-- ---------------------------------------------------------------------------
-- requires_consent marks a directory whose form carries a terms checkbox. The worker only
-- ticks that box when the founder explicitly agreed to THAT directory's terms; without a
-- grant the submission resolves needs_manual. Accepting someone's terms on their behalf is
-- the same family of wrong as fabricating their identity.
--
-- requires_profile_fields lists the company-profile fields (phone, employee_count, ...)
-- a directory needs beyond the product listing. Unmet requirements are needs_manual, NOT a
-- failure: nothing is broken, the founder simply has not filled in an optional section.

alter table public.directories
  add column if not exists requires_consent boolean not null default false;

alter table public.directories
  add column if not exists requires_profile_fields text[] not null default '{}';

comment on column public.directories.requires_consent is
  'Form carries a terms/consent control. The UI must obtain explicit per-directory agreement before enqueue; the worker refuses to tick it otherwise.';

comment on column public.directories.requires_profile_fields is
  'Company-profile fields required beyond the listing. Non-empty means the directory is automatable only once the founder has completed that section.';

-- ---------------------------------------------------------------------------
-- submissions.consent_granted_at
-- ---------------------------------------------------------------------------
-- The ONLY source of consent the worker will accept. Written by apps/web at enqueue time,
-- and only when the founder ticked that directory's terms box having been shown its terms.
-- NULL means no agreement was recorded, and the worker then leaves the checkbox alone and
-- resolves needs_manual.
--
-- It lives on submissions rather than on apps because consent is per-directory and
-- per-submission; a grant is never carried across directories.

alter table public.submissions
  add column if not exists consent_granted_at timestamptz;

comment on column public.submissions.consent_granted_at is
  'When the founder explicitly agreed to this directory''s terms. NULL = no consent recorded; the worker will not tick a terms checkbox.';

-- authenticated already holds INSERT on submissions (migration 0002) and column-level
-- grants were never narrowed, so the new column is writable by the enqueue path without
-- further privileges. No UPDATE is granted, so consent cannot be back-filled by a client
-- after the fact.

# 00: Shared contract (all agents treat as fixed)

**Status:** ready-for-agent

Names below are binding across migrations, API, worker, and web. Change only via the orchestrator.

## Tables / columns
- `founder_profiles(user_id uuid pk -> auth.users, plan text check in ('free','pro') default 'free', created_at)`. Row auto-created on first product insert or via trigger on auth.users.
- `apps` (= Product) add: `public_contact_email text null`, `launch_post text null` (<= 300 chars), `long_description text null`.
- `directories` (= Channel catalog) add:
  - `channel_type text check in ('directory','social','article','list') default 'directory'`
  - `automation text check in ('automated','manual','paid_link') default 'manual'`
  - `terms_prohibit_automation boolean default false`
  - `challenge_kind text check in ('none','arithmetic','recaptcha_v2','recaptcha_v3','hcaptcha','turnstile') default 'none'`
  - `needs_platform_account boolean default false`, `needs_email_verification boolean default false`
  - `live_lookup jsonb null` — `{ "kind": "url_pattern"|"site_search"|"none", "template": "https://site/search?q={domain}" }`
  - `recipe jsonb null` — driver recipe (form selectors, login steps, success signal). Worker owns its shape.
- `platform_accounts(id uuid pk, directory_id uuid fk unique, username text, secret_enc text, session_enc text null, status text check in ('active','locked','broken') default 'active', updated_at)` — RLS on, no policies (service role only).
- `submission_status` enum add `not_published`.
- `submissions` add: `next_live_check_at timestamptz null`, `live_check_deadline timestamptz null`, `challenge_cost_cents int default 0`, `inbox_address text null`.

## Eligibility (replaces v1 gate)
Eligible = `automation='automated' and status='active' and automation_verified_at is not null and last_verified_at > now() - interval '7 days'`. Captcha/account/price no longer block.

## RPCs
- `publish_product(p_app_id uuid, p_directory_ids uuid[] default null) returns setof submissions` — security definer, owner-checked. Null ids = all eligible. Caps by plan: free = 2 products total, 2 automated submissions per product; pro unlimited. Skips channels with an existing active submission (idempotent). Writes `approved_payload` snapshot (incl. launch_post, long_description, public_contact_email, inbox_address placeholder) + `submission_jobs` row in one transaction.
- Existing `approve_targets` kept as thin wrapper or removed; `enforce_beta_product_limit` reads plan.

## Encryption
AES-256-GCM, key = base64 32 bytes in env `TOKEN_ENCRYPTION_KEY`. Ciphertext format `v1:<b64 iv 12B>:<b64 ciphertext+tag>`. Same format in Python (API) and Node (worker).

## Env vars
`TOKEN_ENCRYPTION_KEY` (api, worker), `ANTHROPIC_API_KEY` (api), `CAPSOLVER_API_KEY` (worker), `PLATFORM_INBOX_ADDRESS`, `PLATFORM_INBOX_APP_PASSWORD` (worker). Missing optional keys must degrade (feature disabled + logged), not crash.

## Dashboard display states (API -> web)
`queued|running -> "Queued"/"Sending"`, `pending_review|succeeded -> "Submitted"`, `live -> "Live"`, `unconfirmed|needs_manual -> "Needs attention"`, `failed|not_published -> "Failed"/"Not published"`.

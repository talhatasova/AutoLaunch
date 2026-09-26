# DirectoryLaunch v1

## Goal

Help a solo SaaS founder submit accurate product details to curated, free directory targets and know what happened at each one. DirectoryLaunch is a working name; `xxx.com` and `app.xxx.com` are placeholder marketing and application hosts.

## Founder workflow

1. Sign in with a Supabase email link or Google.
2. Add a product URL. Fetch safe public metadata into a draft; the founder reviews the name, description, category, contact identity, and any required assets before sending.
3. Browse the curated catalog. Show free, paid, and manual entries with factual price, conditions, category, review timing when known, and evidence date. Only verified automatic free entries are selectable for submission.
4. Select up to two eligible directories per product. Show the exact fields each will receive and any directory-specific terms. A backlink or badge target requires confirmation that the obligation is installed. Approve the selection as one batch.
5. Show each directory's progress, receipt, uncertainty, review state, and live URL. The founder may add an approval URL received by email; the application checks public evidence before calling it live.
6. Show coverage and outcome counts by product and directory. Do not invent traffic, SEO, or publication results.

The free beta allows two products per founder and two directory submissions per product. Sent product details are immutable in the beta. A founder edits a live listing at the directory. A later paid service may use a directory's edit API where available.

## Directory eligibility

The catalog is curated by the team. A target is eligible only when its entire submission path has been observed end to end, its required fields and detectable receipt are known, it is free to submit, and its site rules do not prohibit the planned automation. No account, CAPTCHA, email confirmation, or payment may be needed for the send itself. Editorial review after a receipt is allowed and remains pending until publication is verified.

Recheck automatic targets at least every seven days, including free terms and form shape, and scan the rendered page for challenges immediately before sending. If a path changes, stop that target, mark the integration unavailable, and tell the founder why. Never solve or work around a challenge. The current seed is candidate research, not proof of eligibility.

## Submission outcomes

For each product and directory, keep one active submission and the exact approved payload snapshot. Queue and processing events are visible. A reliable form/API receipt means submitted or pending review, not live. If a click may have sent the form but no reliable receipt appears, mark the result unconfirmed and do not retry automatically. A clear pre-send failure can be retried only by the founder. A public listing URL, checked by the application or supplied by the founder and then checked, is required for live status.

## Technical boundaries

- Railway hosts the marketing/application frontend, FastAPI backend, and Playwright worker.
- React renders the marketing and application experiences at separate hosts. The API owns validation, authorization, product and catalog access, submission orchestration, and analytics. The worker owns third-party browser actions.
- Supabase owns Postgres and Auth. Enforce tenant ownership at the database boundary and verify user tokens at the API. Keep privileged credentials out of the browser. Make submission enqueueing durable and idempotent.
- Validate fetched URLs against SSRF and redirect risks. Rate limit outbound requests by directory host. Keep an audit trail without storing unnecessary secrets or raw third-party pages.
- Keep modules small and cohesive; introduce abstractions only where multiple implementations or real seams require them.

## Release gate

Do not advertise automatic coverage until at least five free directory targets have been verified end to end with current evidence. A local form fixture tests the worker, but cannot count toward the five. The existing seed has two form candidates and 21 manual entries; its historical classifications require review. Deployment requires the intended Supabase project and Railway services to be connected and verified.

# DirectoryLaunch v2: one-click automated publishing

**Status:** ready-for-agent
**Supersedes:** `.scratch/directorylaunch-v1/spec.md` (the strict "no account, no CAPTCHA, never solve a challenge" eligibility rule is dropped)

## Problem Statement

A SaaS founder who wants visibility has to find directories and launch channels, create an account on each, fight CAPTCHAs and verification emails, re-type the same product details, and then remember to check whether each listing ever went live. It takes days, and most founders give up after two or three sites. The founder wants to hand the product over once and see, in one place, where it was published.

## Solution

The founder signs in to DirectoryLaunch (email link or Google), adds a product URL, reviews the auto-filled profile and the generated launch text, and clicks **Publish** once. DirectoryLaunch then submits the product to every automated channel the founder's plan allows. It uses its own platform accounts on each channel, its own inbox for verification emails, and a solver service for CAPTCHAs. The founder never creates or verifies a third-party account. A dashboard shows every channel's state from queued through receipt to live, with the public listing URL once the worker finds it. Channels that cannot be automated appear as manual entries with a copy-ready kit; paid channels appear with price and a link out.

The public launch bar is five certified free channels, live-tested with the team's own product, beyondELO (https://beyondelo.com).

## User Stories

### Access
1. As a founder, I want to sign in with a magic email link, so that I don't need another password.
2. As a founder, I want to sign in with Google, so that I can start in one click.
3. As a founder, I want my session to persist across visits, so that I don't re-authenticate every time.
4. As a founder, I want to sign out, so that a shared machine doesn't expose my products.
5. As a prospective founder, I want a marketing site separate from the app, so that I can learn what the product does before signing in.
6. As a prospective founder, I want the marketing site's call to action to take me to the app's sign-in, so that I can start immediately.
7. As a signed-in founder visiting the marketing site, I want a clear "Open dashboard" link, so that I can get back to work.

### Product profile
8. As a founder, I want to paste my product URL and have the name, tagline, description, logo, and social image fetched automatically, so that I don't type what my site already says.
9. As a founder, I want to review and edit every fetched field before publishing, so that directories receive accurate details.
10. As a founder, I want to choose a category for my product, so that directories file it correctly.
11. As a founder, I want to provide an optional public contact email, so that directories with a public-contact field show a real address.
12. As a founder, I want generated launch text (a short social post and a longer description) created from my profile, so that I don't have to write marketing copy.
13. As a founder, I want to edit the generated text or replace it with my own from scratch, so that the voice is mine.
14. As a founder, I want to see which fields each channel will receive, so that I know exactly what gets published in my name.
15. As a free-plan founder, I want to add up to two products, so that I can try the service.
16. As a pro-plan founder, I want unlimited products, so that I can launch everything I build.
17. As a founder, I want sent details to be frozen per submission, so that I have an exact record of what each channel received.

### Catalog
18. As a founder, I want to browse every channel in the catalog with type (Directory, Social, Article, List), cost, and status, so that I understand my options.
19. As a founder, I want automated channels clearly marked, so that I know which ones need nothing from me.
20. As a founder, I want manual channels (e.g. Product Hunt, Hacker News) shown with a link and a copy-ready kit of my product text, so that I can still do them quickly myself.
21. As a founder, I want paid channels shown with price and a link to the directory, so that I can decide whether to pay them directly.
22. As a founder, I want to know when a channel is temporarily unavailable and why, so that I'm not surprised when it is skipped.
23. As a founder, I want to know if a channel requires a backlink or badge, so that I can meet the obligation.

### Publishing
24. As a founder, I want one **Publish** click per product to send it to all eligible automated channels, so that I'm not bothered per channel.
25. As a free-plan founder, I want to pick up to two automated channels per product, so that I get real results within the free tier.
26. As a pro-plan founder, I want Publish to cover every automated channel, so that I get maximum coverage.
27. As a founder, I want repeated clicks never to create duplicate submissions, so that I don't spam directories with my product.
28. As a founder, I want channels added to the catalog later to be publishable for an existing product, so that coverage grows over time.
29. As a founder, I want submissions to require no action from me (no third-party accounts, emails, or CAPTCHAs), so that the process is genuinely hands-off.

### Tracking
30. As a founder, I want a dashboard card per product with counts by state (Queued, Sending, Submitted / Pending review, Live, Needs attention, Failed), so that I see progress at a glance.
31. As a founder, I want a table of channels per product with type, cost, state, receipt or live URL, and last event time, so that I can see the detail.
32. As a founder, I want to open a channel's event trail, so that I understand what happened and when.
33. As a founder, I want a receipt shown as "Submitted / Pending review", never as "Live", so that I'm not misled.
34. As a founder, I want a listing marked Live only when its public page with a link to my product has been found, so that "Live" is trustworthy.
35. As a founder, I want the system to find my live listing automatically, so that I don't have to check each directory.
36. As a founder, I want to paste a listing URL myself if I spot it first, so that it's verified and marked Live sooner.
37. As a founder, I want submissions that never go live within 30 days marked "Not published", so that the dashboard reflects reality.
38. As a founder, I want ambiguous sends (form may have gone through, no clear receipt) shown under "Needs attention" rather than retried automatically, so that my product isn't double-submitted.
39. As a founder, I want to retry a submission that clearly failed before sending, so that a transient error doesn't cost me a channel.
40. As a founder, I want a "Needs attention" list across all products, so that I see anything that needs a decision.
41. As a founder, I want overall coverage numbers (channels attempted, pending, live) per product, without invented traffic or SEO figures, so that the numbers are honest.

### Operator (DirectoryLaunch team)
42. As an operator, I want to set a founder's plan to free or pro manually, so that I can grant access before billing exists.
43. As an operator, I want each channel's automation recipe (form fields, success signal, account needs, verification step, challenge type) in the catalog, so that adding a channel means adding data plus at most a small driver.
44. As an operator, I want the worker to log in with the platform account for a channel, so that founders never need their own.
45. As an operator, I want the worker to read the platform inbox and follow the verification link for the right submission, so that email confirmations complete without anyone.
46. As an operator, I want CAPTCHA solving through a solver service with the cost recorded per submission, so that I can track spend.
47. As an operator, I want per-host rate limits and one submission per product per channel, so that we don't look like spam and get banned.
48. As an operator, I want each catalog entry to record whether its terms prohibit automation, so that I can drop any site that objects.
49. As an operator, I want a channel automatically paused when its form or page shape changes or a solve fails repeatedly, so that broken integrations stop quietly failing.
50. As an operator, I want every automated channel rechecked at least every seven days, so that breakage is caught before founders hit it.
51. As an operator, I want to certify a channel by a real end-to-end submission of beyondELO from the production worker, so that "automated" means proven.
52. As an operator, I want third-party credentials and tokens encrypted at rest and never sent to the browser, so that a leak of the web bundle or the database doesn't expose them.
53. As an operator, I want a claimed job that crashed mid-send left for inspection rather than reclaimed, so that a crash can't cause a duplicate send.

## Implementation Decisions

### Product rules replacing v1 eligibility
- **Fully automated** means no founder action after the single Publish click. One-time setup by the DirectoryLaunch team (platform accounts) is allowed.
- The worker may create and use platform accounts, follow email verification links, and solve CAPTCHAs (reCAPTCHA, hCaptcha, Turnstile, simple arithmetic questions) through a solver service. It still stops on any challenge the solver cannot clear, and on unexpected page shapes.
- An **eligible target** is a catalog entry whose automation recipe has passed live certification and whose last recheck is within seven days. Price evidence is still recorded; free channels are prioritized.
- Each catalog entry carries a terms-prohibit-automation flag. Its effect is informational, so the operator decides.

### Channels for release
Certify these five: The Startup Project, Startup Collections, Launching Next, Uneed, and SaaSHub. Bluesky and Mastodon launch-feed posts are a bonus or fallback. Next in line are Startup Stash and KillerStartups. dev.to is excluded until founder-connected accounts exist, because a platform account posting about every customer breaks its promotional-content rule.

### Accounts and identity
- **Platform accounts:** one DirectoryLaunch account per account-required channel submits every founder's product, the way an agency does. Credentials live encrypted in the database and are decrypted only by the worker.
- **Platform inbox:** one Gmail mailbox read over IMAP with an app password. Each submission uses a plus-address (mailbox + submission id) so verification emails map to their submission. This will move to a catch-all on the product domain once one is chosen.
- **Email on forms:** the submission and verification email is the platform plus-address. The founder's public contact email is used only where a form has a separate public-contact field.
- **Encryption:** AES-GCM with a key held only by the API and worker environments (`TOKEN_ENCRYPTION_KEY`). The browser never receives secrets.

### Plans
- A `plan` attribute on the founder, either `free` or `pro`, set by an operator. There is no billing.
- `free` allows 2 products and 2 automated channels per product. `pro` is unlimited.
- The existing beta-limit trigger and approval function read the plan instead of hard-coded limits.

### Content generation
- The API generates a short social launch post (at most 300 characters) and a long description from the product profile, using the Anthropic API with `claude-sonnet-5-5`. The key is held by the API only.
- The generated text is stored on the product as editable fields. The founder can edit it or write it from scratch. Publishing freezes it into each submission's payload snapshot.

### Publishing flow
- One Publish call per product. It selects all eligible automated channels, capped by the plan, minus channels that already have an active submission. It writes the payload snapshots and jobs in one transaction, as today, and is idempotent.
- The worker claims each job once (`FOR UPDATE SKIP LOCKED`) and runs the channel's recipe. A crashed claimed job is never reclaimed automatically.

### Worker modules (deep modules, small interfaces)
- **Channel driver:** given a payload, recipe, and services, it produces an outcome (receipt / unconfirmed / pre-send failure / challenge-blocked) plus events. Drivers:
  - generic form driver (existing, extended with challenge solving and an optional login step)
  - social API drivers for Bluesky (AT Protocol) and Mastodon (statuses API)
- **Challenge solver:** given a page and a detected challenge, it returns a solved token, or an unsolvable result with its cost. It is backed by CapSolver.
- **Inbox:** waits for a message to a plus-address, matching a sender or subject, within a timeout, and returns the verification link. It is backed by Gmail IMAP.
- **Platform session:** logs into a channel's platform account and reuses stored browser state between jobs.
- **Live detector:** after a receipt, it checks the channel every 24 hours for 30 days, using the recipe's listing lookup (listing URL pattern, site search, or a search on the product domain). On finding a page that links to the product domain, it marks the submission Live with that URL. After 30 days it marks the submission `not_published`. A founder-supplied URL goes through the same verifier.
- Per-host rate limiting and the seven-day recheck remain worker responsibilities.

### Schema changes (migrations only)
- Founder plan: a `plan` column on a founder profile record, defaulting to `free`.
- Product: `public_contact_email`, `launch_post`, and `long_description` columns.
- Channel catalog:
  - `channel_type` (directory, social, article, list)
  - `automation` (automated, manual, paid_link)
  - `terms_prohibit_automation`
  - `challenge_kind`
  - `needs_platform_account`
  - `needs_email_verification`
  - a listing-lookup recipe
- Platform accounts: a new service-role-only table holding channel, username, encrypted secret, encrypted session state, and status.
- Submission: a `not_published` status, `next_live_check_at`, `live_check_deadline`, and the challenge cost in cents.
- The beta-limit trigger and approval function become plan-aware.

### API (FastAPI)
- Existing routes stay.
- New routes:
  - Publish for a product: one call, using the eligible set capped by plan.
  - Generate launch text for a product.
  - Dashboard summary: per-product state counts and a "Needs attention" list.
- Live URL verification moves from the web service's internal route into the worker or API so that one verifier exists. Delete the duplicate.

### Web (app) and marketing
- **New marketing service:** a static site that owns the landing page and links to the app's sign-in. It is deployed as its own Railway service and domain.
- **`apps/web`:** the application only, on its own Railway domain. The host-aware middleware is simplified accordingly.
- **Dashboard:**
  - product cards with state counts
  - a channel table per product
  - an event trail drawer
  - a "Needs attention" list
  - add/edit product with metadata fetch and a launch-text editor
  - a catalog view with Automated, Manual (copy kit), and Paid (link out) groups
- **Delete:** the legacy fixture-backed dashboard, the composer, and the pg-boss queue code in the web app and the worker.

### Infrastructure
Railway runs four services: marketing, web (app), API, and worker. Generated Railway domains stand in until the product domain exists.

New secrets go in Railway variables, never in the repo:
- `TOKEN_ENCRYPTION_KEY` (API, worker)
- `ANTHROPIC_API_KEY` (API)
- `CAPSOLVER_API_KEY` (worker)
- `PLATFORM_INBOX_ADDRESS` and `PLATFORM_INBOX_APP_PASSWORD` (worker)

Supabase Auth's site URL and redirect allow list must include the app domain.

### Human-only setup (`ready-for-human`)
- Create the platform Gmail with 2FA and an app password.
- Create a CapSolver account and add $5 of credit.
- Optionally choose a public contact email for beyondELO.
- Enter the secrets directly into Railway variables.

## Testing Decisions

- **Unit and E2E tests are deferred** while the product is in development and the behavior is still moving. When the product settles, tests go at the agreed seams:
  1. the worker submission runner, with fake pages, solver, inbox, and clock (prior art: the worker's approved-runner and form-driver tests)
  2. the FastAPI routes via the test client (prior art: the existing API tests)
- **Existing tests:** don't extend them. When a change intentionally breaks one, delete or minimally adjust it rather than leave a red suite. Typecheck must still pass.
- **Live certification is kept**, because it is the release gate, not a unit test. Each of the five channels is certified by a real beyondELO submission from the production worker, with evidence recorded. The team pauses before each channel's first live send.

## Out of Scope

- Stripe or any billing; plans are set manually.
- Founder-connected third-party accounts (dev.to, Hashnode, LinkedIn, X), which is a later optional pro feature.
- Per-founder account creation on third-party channels.
- Product Hunt and Hacker News automation (no posting APIs; manual kit only).
- Paying for paid directory placements on the founder's behalf.
- Editing a listing after it is live.
- Traffic, SEO, backlink, or domain-rating analytics.
- A custom domain and domain-based email routing (later).

## Further Notes

- Risk accepted by the founder: solving CAPTCHAs and automating account-gated directories may breach some sites' terms. Mitigations are one submission per product per channel, per-host rate limits, terms flags, and the ability to drop a channel. Expect occasional IP, account, or product-domain bans. Certify from the worker's Railway egress IP, because Cloudflare gating has been seen to flip intermittently.
- Live channel research (2026-10-09) is in `.scratch/research/channels-2026-10.md`.
- The test product is beyondELO: "Live ELO rankings for European football clubs across the UCL, UEL, and UECL with multiple adjustable ELO systems, player ratings, and historical tables." Category: Sports / Analytics. Brand assets live in its frontend repo; the share image is at `beyondelo.com/assets/og/og-default.jpg`.

# Free channels research, 2026-10-09

Method: curl (browser UA, follow redirects) against all 23 seed submit URLs on 2026-10-09 plus WebFetch/WebSearch for API facts. Static fetch only; JS-injected CAPTCHAs (e.g. Future Tools) are NOT visible this way, so seed verdicts from the 2026-08-24 Chrome checks stand unless noted. Third-party blog claims are marked "unverified".

## 1. Re-check of the 23 seed entries (2026-10-09)

| Slug | Result today | Free? | Login | CAPTCHA seen | Email confirm | Submit URL / notes |
|---|---|---|---|---|---|---|
| the-startup-project | 200, 1 form, no captcha markers | Free ("Free Listing" on page) | No | None; honeypot `fax_number` | Not seen | /submit-startup/. Fields #companyName #tagline #website #description #industry #email #founderName #consent. ToS (/terms) has no bot clause; robots allows *. Unchanged vs seed. |
| startup-collections | 200, 3 forms (submit + newsletter + search), no captcha | Free (no fee seen) | No | None | Not seen | /submit/. Fields name, collection, website, content, submitter_name, submitter_email. No terms page (404). Success string still unverified. |
| product-hunt | 200 but redirects to /login?origin=/posts/new (no Cloudflare page on this fetch; seed saw 403 on 08-24) | Free | Yes | n/a | n/a | API v2 still has no create-post mutation (search found none; docs say read-only by default; commercial use needs PH contact). Tier 3 stays. |
| alternativeto | 403 Cloudflare interstitial | Free | Yes (/manage/) | CF challenge | n/a | Tier 3 unchanged |
| saashub | 200, 2 forms, no captcha | Free | Email verification link | None | Yes | /services/submit is a URL gate then email verify. Tier 3 unchanged |
| indie-hackers | NOW 403 Cloudflare (seed saw 200 SPA shell) | Free | Yes | CF challenge | n/a | Tier 3; note the evidence changed, worse than seed |
| theres-an-ai-for-that | 403 Cloudflare | Free-ish (paid boosts, unverified) | Likely | CF challenge | n/a | Tier 3 unchanged |
| betalist | 200 Turbo redirect to /sign_in (no form) | PAID (seed price_kind paid) | Yes | none | n/a | Tier 3, drop from free list |
| wellfound | 403 Cloudflare | Free | Yes | CF challenge | n/a | Tier 3 unchanged. Company profile, not really a product directory |
| about-me | 200, reCAPTCHA x5 + hCaptcha x1 | Free | Signup | reCAPTCHA+hCaptcha | likely | Weak fit (personal profiles); candidate for removal |
| topai-tools | 403 Cloudflare (seed saw 200) | Unknown | Yes | CF challenge | n/a | Tier 3 |
| peerlist | 403 Cloudflare (seed saw 200) | Free | Yes | CF challenge | n/a | Tier 3 |
| launching-next | **NOW 200, plain form, no Cloudflare, no reCAPTCHA** (seed saw 403 interstitial, even on robots.txt) | Free queue; $99 upsell on next page | No | None, but a text "Quick Check: What is 2+3?" field (`math`) | Email sent if published | /submit/. POST form fields: startupname, startupurl, description (max 100), fulldescription, tags, funding (radio 0-3), marketing_budget (radio), user, email, newsletter_optin (checkbox, default checked - must uncheck unless consented), math, formSubmit. robots: only /try/ disallowed. /terms/ has no automation clause. **Candidate for re-promotion to Tier 2**, but needs a live Chrome check (Cloudflare may be intermittent, math question must be solved, the post-submit upsell page must be handled). Intermittent CF is a real risk since it flipped between two runs. |
| future-tools | 200, 1 form, no captcha in static HTML (seed's Chrome check found injected Turnstile) | Free | No | Turnstile (JS-injected, per seed) | n/a | Tier 3 stays; static fetch cannot disprove it |
| uneed | 200, 1 form, Turnstile in HTML | Free listing + paid boosts (unverified) | Login ref | Turnstile | n/a | Tier 3 |
| startup-stash | 200, 1 form, reCAPTCHA x9 | Free (unverified today) | No | reCAPTCHA | n/a | Tier 3 |
| killer-startups | 200, 0 forms, reCAPTCHA x6 | Free | No | reCAPTCHA | n/a | Tier 3 |
| openalternative | 200 at /auth/login?next=/submit | Free for open-source only (unverified) | Yes | none | n/a | Tier 3; also only fits open-source alternatives |
| startupbase | redirect to /login | Free queue needs badge (seed note) | Yes | none | n/a | Tier 3 |
| fazier | 200 SPA, 0 forms | Free (unverified) | Yes | none | n/a | Tier 3 |
| startup-fast | 200, 0 forms | Free requires badge, 90-day queue; $9 paid (seed) | Yes | none | n/a | Tier 3 |
| softwaresuggest | 200, 5 forms | Free | No | none | n/a | Tier 3 because required fields (phone, employees, customers, competitors) are not in payload; sales lead form |
| aitools-inc | 200, 0 forms (pricing page, Typeform off-site) | Free, 30-90 day queue; $129 fast lane | No | none (Typeform) | n/a | Tier 3; Typeform ToS issue per seed |

Summary: only two form directories are genuinely automatable today: The Startup Project and Startup Collections (both already Tier 2). Launching Next changed state and is worth a Chrome re-verification. Nothing in the seed is paid except BetaList.

## 2. API / machine-friendly channels

| Channel | Auth | Cost | Rate limits | Automation ToS / notes | Evidence |
|---|---|---|---|---|---|
| dev.to (Forem) | `api-key` header (key from user's account settings) | Free | Not stated on the API page (read 100k of 168k chars) | `POST /api/articles` returns 201; `published:false` default (draft). Terms s.11: content must not be "designed primarily for the purposes of promotion or creating backlinks"; no bot clause. Frame as a genuine build/launch article. | developers.forem.com/api/v1 and dev.to/terms, 2026-10-09 |
| Hashnode | Personal Access Token in `Authorization` header (reportedly no Bearer prefix), `publishPost` mutation on gql.hashnode.com, needs publicationId | Free (one blog claims Pro required since 2026-05-13: UNVERIFIED, check before relying) | Mutations 500/min, queries 20k/min (secondary sources) | No bot clause found. Official docs host redirected to an Apollo sandbox that would not load; fields unverified. | WebSearch 2026-10-09 (third-party) |
| Bluesky | App password or OAuth, `com.atproto.repo.createRecord` | Free | Official page did not load; widely documented ~5,000 points/hr, 35,000/day, create = 3 points (from memory, unverified today) | Open protocol; bot accounts allowed if labeled. Low audience for SaaS. | docs.bsky.app (redirect), 2026-10-09 |
| Mastodon | OAuth user token, scope `write:statuses`, `POST /api/v1/statuses` | Free | Per-instance; default 300 req/5 min (unverified today) | Instance rules vary; many ban unlabeled bots/promo. Pick an instance deliberately. | docs.joinmastodon.org/methods/statuses, 2026-10-09 |
| LinkedIn (profile) | OAuth 3-legged, "Share on LinkedIn" product gives `w_member_social`, reportedly self-serve | Free | ~100-150 calls/member/day (sources disagree) | Company pages need vetted Community Management API (closed to individuals). Tokens ~60 days, no programmatic refresh for self-serve. Monthly API version header; 202510 sunsets 2026-10-15 (secondary). One source says partner verification is needed: conflicting. | WebSearch 2026-10-09 (third-party) |
| X (Twitter) | OAuth 2 user token | Pay per use since 2026-02-06; ~$0.015 per plain post, ~$0.20 per post containing a URL; free tier closed to new signups | Not capped publicly | Pay-per-post makes it cheap but not free; link posts cost 13x. Verify in Developer Console. | WebSearch (blotato, postproxy, bundle.social), 2026-10-09 |
| Reddit | OAuth | Free tier is non-commercial; commercial use requires contract; sources say new self-serve app approval is closed/slow (2-4 weeks, single vendor claim) | 100 QPM per client | Main blocker is subreddit self-promo rules and sitewide spam/ban risk, not the API. Treat as manual. | WebSearch 2026-10-09 (vendor blogs, weak) |
| Medium | Integration tokens | Free | n/a | **No new tokens issued since 2025-01-01**; only pre-existing tokens work (guide + n8n/Make deprecation). Not viable for new users. | WebSearch 2026-10-09 |
| Product Hunt API v2 | OAuth / developer token | Free | complexity-based | Read-only for posting: no create mutation found; seed evidence says only userFollow mutations. Cloudflare login wall for the site. | producthunt.com/v2/docs search result; seed |
| Hacker News Show HN | none | Free | n/a | No official write API. Guidelines: must be your own project and you must be around to discuss; no vote asking. Browser automation of a logged-in account would be possible but violates the spirit; manual only. | news.ycombinator.com/showhn.html (search result) |
| GitHub awesome-* lists | GitHub OAuth/PAT, PR via REST | Free | normal GitHub limits | sindresorhus/awesome template: "Fully AI-generated pull requests are not accepted", must review 4 other PRs, list must be 30+ days old and non-generated. Per-list rules vary; mostly manual curation. | github.com/sindresorhus/awesome PR template, 2026-10-09 |

## 3. Ranked table (by automation feasibility)

| # | Channel | Type | Cost | Account | Captcha | ToS on automation | Feasibility | Evidence (date 2026-10-09 unless noted) |
|---|---|---|---|---|---|---|---|---|
| 1 | dev.to | API (API key) | Free | Yes (user's own) | None | No bot clause; no-backlink-primary-purpose content rule | High | developers.forem.com/api/v1; dev.to/terms |
| 2 | The Startup Project | Directory form | Free | No | None (honeypot) | None found (/terms) | High | startupproject.org/submit-startup/ |
| 3 | Startup Collections | Directory form | Free | No | None | No terms page | High (success signal unverified) | startupcollections.com/submit/ |
| 4 | Bluesky | OAuth/app-password API | Free | Yes | None | Open protocol, bots allowed | High technically, low reach | docs.bsky.app |
| 5 | Mastodon | OAuth API | Free | Yes | None | Instance-specific | Med | docs.joinmastodon.org |
| 6 | Launching Next | Directory form (math question) | Free ($99 upsell) | No | Arithmetic field, no CAPTCHA seen; CF flipped since 08-24 | None found | Med (needs Chrome re-verify) | launchingnext.com/submit/ |
| 7 | Hashnode | GraphQL API (PAT) | Free (Pro claim unverified) | Yes | None | None found | Med | search results; docs unreachable |
| 8 | LinkedIn profile | OAuth API | Free | Yes | None | Self-serve scope disputed | Med | search results (third-party) |
| 9 | SaaSHub | Form + email verify | Free | Email | None | robots allows | Low-Med (needs inbox) | saashub.com/services/submit |
| 10 | X | OAuth API | ~$0.20 per link post | Yes | None | Paid | Med technically, not free | search results |
| 11 | Product Hunt | Manual | Free | Yes | Cloudflare | API cannot post | Low | seed + 2026-10-09 |
| 12 | GitHub awesome lists | PR | Free | Yes | None | AI-generated PRs rejected | Low | sindresorhus/awesome template |
| - | Show HN, Reddit, Medium | Manual / not viable | Free | Yes | - | Maker presence; subreddit rules; no new tokens | Low / none | see section 2 |

## 4. Recommended first 5

1. The Startup Project - plain form, no account, no CAPTCHA, live today, already Tier 2.
2. Startup Collections - same, free dofollow listing; confirm the success string on first run.
3. dev.to - official API key publish, drafts by default, gives founder-authored content and a backlink.
4. Launching Next - public form is open again; re-verify in Chrome (Cloudflare flip-flop, math field) before promoting to Tier 2.
5. Bluesky (or Hashnode as alternate) - clean open API with no review; low reach but the cheapest second API integration. Pick Hashnode instead if the Pro-plan claim proves false and a developer audience matters more.

Caveats: static curl cannot see JS-injected Turnstile; Cloudflare gating appears intermittent per-IP (PH, Launching Next differed from 08-24), so re-certify from the worker's actual egress IP before release. Rate-limit figures for Bluesky/Mastodon are from memory and need a live check.

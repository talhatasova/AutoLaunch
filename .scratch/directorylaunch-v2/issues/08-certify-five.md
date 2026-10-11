# 08: Certify Startup Project, Startup Collections, Launching Next, Uneed, SaaSHub (+ Bluesky/Mastodon)
**Blocked by:** 01, 03, 06, 07  **Status:** ready-for-agent
- [ ] Recipe per channel, platform accounts created, pause before each first live send, evidence recorded.

## Comments

### 2026-10-11 automation-pipeline: certify CLI + dry runs (no submission sent)

CLI: `pnpm --filter worker certify <slug> [--send] [--payload <json>]` (`apps/worker/src/certify.ts`, default payload `apps/worker/certify/beyondelo.json`). It loads the row from `seed/directories.json` and runs the real `Tier2FormDriver` through `PlaywrightPool`. In a dry run it stops at the submit boundary after a trial click, which checks that the button can be clicked without clicking it. In both modes it screenshots the form to `apps/worker/certify/out/` (gitignored) and prints a field report. `--send` clicks submit, prints receipt, unconfirmed or failed, and prints the certification SQL without running it. Not run yet.

**The Startup Project**: dry run OK, screenshot `certify/out/the-startup-project-filled.png`.
- Required fields per the react-hook-form rules in the page JS: founderName, email, companyName, website, tagline (max 150), industry, stage, mrrRange, teamSize, description (min 50), consent. `fax_number` is a honeypot and stays empty. traction is optional and unmapped.
- Mapping: the payload fields as before. industry is filled from `category` through the new option picker in `net/browser.ts`. "Sports / Analytics" has no matching option, so the picker chooses `other`. Added constant extras stage=`launched`, mrrRange=`pre-revenue`, teamSize=`solo`. These are true for beyondELO only.
- Challenge: none after render.
- Success signal: text "Your startup has been submitted!". It comes from the site's JS success branch after `POST /api/submit-startup` returns ok. Confidence: medium-high. It is UNVERIFIED on a real submit.
- live_lookup: `url_pattern` `https://startupproject.org/startups/`. This is one catalog page of about 1 MB, with outbound `<a href="https://product">` links that are nofollow. Raised verifyListing maxBytes to 4 MB.
- Obligation: the consent text says a link back to the listing is required to keep it. This is now recorded in the seed `obligation`. beyondELO must add the backlink.
- Blocking for other founders: stage, MRR and team size are constants. Do not certify this row for general use until those come from the founder's profile.

**Startup Collections**: dry run OK, screenshot `certify/out/startup-collections-filled.png`.
- Required fields: name, collection, website, submitter_name, submitter_email. content is optional. No honeypot or consent.
- Fix: the form sits in a closed popup with `pointer-events:none` and is off-screen. The submit click would have timed out after the submit boundary. `submission_url` is now `/submit/#submit`, which the theme's hashHandler opens on load. The trial click now passes.
- Collection: the picker chose "Mobile Analytics". beyondELO does not fit this "tools for starters" catalog, so editorial rejection is likely. This puts certification with beyondELO at risk.
- Success signal: changed to `selector_present` `form.loader [data-action-message="submit_resource"][data-status="success"]`. The theme callback sets `data-status` from the AJAX `success` flag. Confidence: high on the mechanism. The message text is server-side and still UNVERIFIED.
- live_lookup: `site_search` `https://startupcollections.com/search/{label}/`. Added a `{label}` placeholder to the detector. Listing pages are `/resource/<slug>/`, and their links are nofollow, which contradicts the earlier "dofollow" note.

Shared: beyondELO's own `og:image` (`/assets/og/og-default.jpg`) returns 404. The platform inbox placeholder `directorylaunch.submit@gmail.com` is unconfirmed. The payload has no field for pricing=free, and neither form asks for it.

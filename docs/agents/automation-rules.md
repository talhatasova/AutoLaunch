# Automation rules (v2)

Source of truth for what the worker may do. Product decisions: `.scratch/directorylaunch-v2/spec.md`.

## Allowed

- **CAPTCHAs** may be solved through CapSolver. Record the cost per submission (`challenge_cost_cents`).
- **Platform accounts** owned by DirectoryLaunch submit on every founder's behalf. Credentials are AES-GCM encrypted and decrypted only by the worker.
- **Email:** forms and verification use the platform Gmail plus-address, one per submission. Follow verification links only when they are on the directory's own host. The founder's `public_contact_email` fills public-contact fields only.

## Limits

- One submission per product per channel.
- Per-host rate limits, honest User-Agent.
- `terms_prohibit_automation` is informational; the operator decides whether to drop the channel.
- Stop and surface "Needs attention" on an unknown page shape or a challenge the solver cannot clear. Pause the channel after repeated solve failures or a changed form.
- A crashed claimed job stays claimed for inspection; an ambiguous send is investigated before any retry.
- Recheck every automated channel at least every seven days.

## Outcomes

- Receipt is not live. A submission is Live only after the channel's public page links the product domain. After 30 days without that, it is `not_published`.
- A channel is eligible only after live certification with a real beyondELO submission.

## Accepted risk

The founder accepts that CAPTCHA solving and account-gated automation may breach some sites' terms and can cause IP, account, or domain bans. Mitigations are the limits above and dropping any channel that objects.

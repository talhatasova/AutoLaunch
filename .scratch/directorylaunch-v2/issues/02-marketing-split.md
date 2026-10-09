# 02: Separate marketing app; delete legacy web code
**Blocked by:** none  **Status:** ready-for-agent
- [ ] New `apps/marketing` (static, own Dockerfile) with the landing page; CTA -> `${APP_URL}/auth/sign-in`.
- [ ] `apps/web` becomes app-only: `/` -> `/dashboard`; middleware simplified.
- [ ] Delete fixture dashboard, launch composer, pg-boss queue code in web.

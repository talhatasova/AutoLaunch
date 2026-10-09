# 06: Railway: marketing service, app domain, env vars, Supabase redirects
**Blocked by:** 02  **Status:** ready-for-agent

## Facts (2026-10-09)
- Railway project `sweet-inspiration` (4bb40d5a-ea47-4f18-8cb1-0bf66b0944cb); envs `dev`, `production`.
- Services: api (2857b7fb…), web (629d5b33…), worker (4f2eaa21…). Marketing service not yet created.
- Dev preview: web https://web-dev-f23b.up.railway.app, api https://api-dev-b714.up.railway.app.
- [ ] Create `marketing` service (Dockerfile apps/marketing/Dockerfile), generate domain, set NEXT_PUBLIC_APP_URL.
- [ ] Web: NEXT_PUBLIC_MARKETING_URL -> marketing domain; NEXT_PUBLIC_APP_URL -> web domain; rebuild.
- [ ] Supabase Auth site URL + redirect allow list include web domain.
- [ ] Generate TOKEN_ENCRYPTION_KEY into api + worker.

# Static marketing site. Build from the repository root:
#   docker build -f apps/marketing/Dockerfile -t directorylaunch-marketing .
FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter marketing...
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter marketing build

FROM caddy:2-alpine
COPY --from=build /app/apps/marketing/out /srv
# Railway injects $PORT; Caddy expands env vars in its Caddyfile.
RUN printf ':{$PORT:8080} {\n\troot * /srv\n\tencode gzip\n\tfile_server\n}\n' > /etc/caddy/Caddyfile

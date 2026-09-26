# DirectoryLaunch worker: approved Postgres jobs + Playwright.
#
# Build from the REPOSITORY ROOT, not from apps/worker:
#   docker build -f apps/worker/Dockerfile -t directorylaunch-worker .
# The build needs pnpm-workspace.yaml and packages/shared, which live above this directory.
#
# ---------------------------------------------------------------------------------------
# BASE IMAGE: the tag MUST match the `playwright` version in apps/worker/package.json.
#
# The image ships browser binaries built for that exact release and Playwright refuses to
# launch a browser it did not install. A drifted tag fails at runtime with
# "Executable doesn't exist at /ms-playwright/chromium-XXXX/..." - after deploy, not during
# build. Bump these two together or not at all:
#
#   playwright package : 1.62.1
#   base image tag     : v1.62.1-noble
#
# Using the official image rather than hand-installing libgtk/libnss/etc. means the system
# dependency list is Microsoft's problem, and it is a long and easy list to get subtly wrong.
# ---------------------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.62.1-noble AS base

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
# Browsers are already in the image at /ms-playwright; do not re-download them.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# ---- Dependencies. Manifests only, so a source edit does not invalidate the install layer.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter worker...

# ---- Runtime.
FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

# The playwright image ships a non-root `pwuser`. Chromium's sandbox works under it, so
# there is no reason to run as root and no need for --no-sandbox.
USER pwuser

# This service listens on no HTTP port. Job progress is visible in submission_events.
WORKDIR /app/apps/worker
CMD ["pnpm", "start"]

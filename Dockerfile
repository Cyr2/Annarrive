# syntax=docker/dockerfile:1
# Talaria: one container, the API server also serves the built PWA.

FROM node:26-alpine AS base
RUN npm install -g pnpm@12.18.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/coach/package.json packages/coach/
COPY packages/protocol/package.json packages/protocol/
# Only so the lockfile matches the workspace; the e2e tests never run in the image.
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY apps/server apps/server
COPY packages packages
RUN pnpm --filter @talaria/web build
# Keep only what the server needs at runtime.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
 && pnpm install --prod --frozen-lockfile --filter "@talaria/server..."

FROM node:26-alpine AS run
ENV NODE_ENV=production \
    PORT=8787 \
    WEB_DIST=/app/apps/web/dist \
    DATA_DIR=/app/data
WORKDIR /app
# SQLite and the change log live on this volume (mount it in Coolify).
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/server ./apps/server
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
WORKDIR /app/apps/server
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "--import", "tsx", "src/index.ts"]

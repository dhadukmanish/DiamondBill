# syntax=docker/dockerfile:1
# Build context is the REPO ROOT (pnpm workspace), not apps/api.

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- install full deps (needs every workspace manifest for a frozen lockfile) ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# ---- bundle the API (esbuild inlines @diamondbill/shared) ----
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @diamondbill/api build

# ---- production-only node_modules, same paths so pnpm symlinks still resolve ----
FROM base AS prod-deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --prod

# ---- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=4000 UPLOAD_DIR=/app/apps/api/uploads
RUN apk add --no-cache curl && addgroup -S app && adduser -S app -G app

COPY --from=prod-deps /app/node_modules           ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules  ./apps/api/node_modules
COPY --from=build     /app/apps/api/dist          ./apps/api/dist
# migrate.js resolves its SQL as ../../drizzle → /app/apps/api/drizzle
COPY apps/api/drizzle ./apps/api/drizzle
COPY apps/api/docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p "$UPLOAD_DIR" && chown -R app:app /app

USER app
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:4000/api/health || exit 1
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/server.js"]

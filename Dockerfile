# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the SAM example host. Tenants typically copy
# this Dockerfile, replace the entrypoint with their own host package
# (which loads only the modules they want), and rebuild.
#
# Result: a slim Node 20 Alpine image with the compiled monorepo and
# the example host as `node ./examples/host/dist/main.js`.

ARG NODE_VERSION=20-alpine

# ── Builder ──────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /repo

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy manifests first so layer caching works on dep installs
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/tsconfig.json packages/core/
COPY packages/web/package.json packages/web/tsconfig.json packages/web/
COPY packages/modules/drucker/package.json packages/modules/drucker/tsconfig.json packages/modules/drucker/
COPY packages/modules/energie/package.json packages/modules/energie/tsconfig.json packages/modules/energie/
COPY packages/modules/mailcow/package.json packages/modules/mailcow/tsconfig.json packages/modules/mailcow/
COPY packages/modules/telefonbuch/package.json packages/modules/telefonbuch/tsconfig.json packages/modules/telefonbuch/
COPY packages/modules/unterschriftenlisten/package.json packages/modules/unterschriftenlisten/tsconfig.json packages/modules/unterschriftenlisten/
COPY packages/modules/verteiler/package.json packages/modules/verteiler/tsconfig.json packages/modules/verteiler/
COPY packages/modules/verwaltung/package.json packages/modules/verwaltung/tsconfig.json packages/modules/verwaltung/
COPY packages/modules/waschkueche/package.json packages/modules/waschkueche/tsconfig.json packages/modules/waschkueche/
COPY packages/modules/wohnungen/package.json packages/modules/wohnungen/tsconfig.json packages/modules/wohnungen/
COPY examples/host/package.json examples/host/tsconfig.json examples/host/

RUN pnpm install --frozen-lockfile=false

# Now the sources
COPY packages ./packages
COPY examples ./examples

RUN pnpm build && pnpm --filter @sam/example-host build

# Strip dev deps for a smaller runtime layer
RUN pnpm --prod --ignore-scripts deploy --filter @sam/example-host /pruned

# ── Runtime ──────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production
RUN apk add --no-cache tini && addgroup -S sam && adduser -S sam -G sam

# Copy pruned deps + compiled artifacts. We need each workspace
# package's dist/ for runtime imports of @sam/* packages.
COPY --from=builder --chown=sam:sam /pruned/node_modules ./node_modules
COPY --from=builder --chown=sam:sam /pruned/package.json ./package.json
COPY --from=builder --chown=sam:sam /repo/examples/host/dist ./examples/host/dist
COPY --from=builder --chown=sam:sam /repo/packages/core/dist ./node_modules/@sam/core/dist
COPY --from=builder --chown=sam:sam /repo/packages/core/package.json ./node_modules/@sam/core/package.json
COPY --from=builder --chown=sam:sam /repo/packages/modules/drucker/dist ./node_modules/@sam/module-drucker/dist
COPY --from=builder --chown=sam:sam /repo/packages/modules/drucker/migrations ./node_modules/@sam/module-drucker/migrations
COPY --from=builder --chown=sam:sam /repo/packages/modules/drucker/package.json ./node_modules/@sam/module-drucker/package.json
COPY --from=builder --chown=sam:sam /repo/packages/modules/energie/dist ./node_modules/@sam/module-energie/dist
COPY --from=builder --chown=sam:sam /repo/packages/modules/energie/migrations ./node_modules/@sam/module-energie/migrations
COPY --from=builder --chown=sam:sam /repo/packages/modules/energie/package.json ./node_modules/@sam/module-energie/package.json
COPY --from=builder --chown=sam:sam /repo/packages/modules/mailcow/dist ./node_modules/@sam/module-mailcow/dist
COPY --from=builder --chown=sam:sam /repo/packages/modules/mailcow/migrations ./node_modules/@sam/module-mailcow/migrations
COPY --from=builder --chown=sam:sam /repo/packages/modules/mailcow/package.json ./node_modules/@sam/module-mailcow/package.json
COPY --from=builder --chown=sam:sam /repo/packages/modules/telefonbuch/dist ./node_modules/@sam/module-telefonbuch/dist
COPY --from=builder --chown=sam:sam /repo/packages/modules/telefonbuch/package.json ./node_modules/@sam/module-telefonbuch/package.json
COPY --from=builder --chown=sam:sam /repo/packages/modules/unterschriftenlisten/dist ./node_modules/@sam/module-unterschriftenlisten/dist
COPY --from=builder --chown=sam:sam /repo/packages/modules/unterschriftenlisten/migrations ./node_modules/@sam/module-unterschriftenlisten/migrations
COPY --from=builder --chown=sam:sam /repo/packages/modules/unterschriftenlisten/package.json ./node_modules/@sam/module-unterschriftenlisten/package.json
COPY --from=builder --chown=sam:sam /repo/packages/modules/verteiler/dist ./node_modules/@sam/module-verteiler/dist
COPY --from=builder --chown=sam:sam /repo/packages/modules/verteiler/migrations ./node_modules/@sam/module-verteiler/migrations
COPY --from=builder --chown=sam:sam /repo/packages/modules/verteiler/package.json ./node_modules/@sam/module-verteiler/package.json
COPY --from=builder --chown=sam:sam /repo/packages/modules/verwaltung/dist ./node_modules/@sam/module-verwaltung/dist
COPY --from=builder --chown=sam:sam /repo/packages/modules/verwaltung/migrations ./node_modules/@sam/module-verwaltung/migrations
COPY --from=builder --chown=sam:sam /repo/packages/modules/verwaltung/package.json ./node_modules/@sam/module-verwaltung/package.json
COPY --from=builder --chown=sam:sam /repo/packages/modules/waschkueche/dist ./node_modules/@sam/module-waschkueche/dist
COPY --from=builder --chown=sam:sam /repo/packages/modules/waschkueche/migrations ./node_modules/@sam/module-waschkueche/migrations
COPY --from=builder --chown=sam:sam /repo/packages/modules/waschkueche/package.json ./node_modules/@sam/module-waschkueche/package.json
COPY --from=builder --chown=sam:sam /repo/packages/modules/wohnungen/dist ./node_modules/@sam/module-wohnungen/dist
COPY --from=builder --chown=sam:sam /repo/packages/modules/wohnungen/migrations ./node_modules/@sam/module-wohnungen/migrations
COPY --from=builder --chown=sam:sam /repo/packages/modules/wohnungen/package.json ./node_modules/@sam/module-wohnungen/package.json

USER sam
EXPOSE 3000
ENV PORT=3000 \
    TENANT_CONFIG=/etc/sam/tenant.config.json

ENTRYPOINT ["/sbin/tini", "--", "node", "./examples/host/dist/main.js"]

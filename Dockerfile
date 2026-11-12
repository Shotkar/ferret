ARG NODE_IMAGE=node:26-bookworm-slim

# ── Build ────────────────────────────────────────────────────────────────────
# The bundles are the same on every platform, so this stage runs on the builder's own (no emulation for arm64).
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /src
# Node 25+ no longer bundles Corepack; it still picks the pnpm in package.json's packageManager.
RUN npm install -g --no-audit --no-fund corepack && corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/docs/package.json apps/docs/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# What the bundled server keeps outside it (the native bits — libSQL, sharp, the canvas PDFs are drawn on — and pdf.js,
# whose worker and fonts come from its own package): the server's production dependencies, at exactly the versions in
# the lockfile, as a plain node_modules for this platform.
FROM ${NODE_IMAGE} AS runtime-deps
WORKDIR /deps
RUN npm install -g --no-audit --no-fund corepack && corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY apps/server/scripts/runtime-deps.mjs /tmp/
RUN pnpm install --frozen-lockfile --prod --filter @ferret/server --ignore-scripts \
      --config.node-linker=hoisted --config.supported-architectures.libc=glibc \
 && node /tmp/runtime-deps.mjs node_modules

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE}
# Which Ferret this is (scripts/version.sh): CI passes it; Settings → Server shows it.
ARG FERRET_VERSION=dev
ENV FERRET_VERSION=$FERRET_VERSION \
    NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/data \
    WEB_DIST=/app/web \
    DOCS_DIST=/app/docs
WORKDIR /app
COPY --from=runtime-deps /deps/node_modules ./node_modules
COPY --from=build /src/apps/server/dist ./dist
COPY --from=build /src/apps/web/dist ./web
COPY --from=build /src/apps/docs/.vitepress/dist ./docs
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/server.js"]

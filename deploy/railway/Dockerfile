# Source-only private Railway pilot image. Not deployed; do not add a Railway public domain.
# The official Tailscale image is pinned to the inspected v1.102.5 multiarch digest.
FROM tailscale/tailscale:v1.102.5@sha256:c507f3a2a6ab1cabd8d809b98edeb41edbd5c3fb6ad9632ffd098b4c7d0b4065 AS tailscale

FROM node:22.13.0-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY --from=tailscale /usr/local/bin/tailscale /usr/local/bin/tailscale
COPY --from=tailscale /usr/local/bin/tailscaled /usr/local/bin/tailscaled
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && node --check server/index.mjs && bash -n deploy/railway/start-private.sh
ENV NODE_ENV=production QURAN_ENVIRONMENT=production PORT=3000
# Deliberately no EXPOSE: Node binds only 127.0.0.1 and Serve is a tailnet-only listener.
# Railway public networking, generated domains and public TCP proxies must remain absent.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bash", "deploy/railway/start-private.sh"]

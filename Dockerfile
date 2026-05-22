# syntax=docker/dockerfile:1.7
# Mirrors collablists Dockerfile pattern · Cloud Run friendly.

# ============================================================
# Stage 1: install deps
# ============================================================
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm install` (vs `npm ci`) since we haven't committed a lockfile yet
# for v0.0.1. Switch to `npm ci` once lockfile is committed.
# Explicitly install the linux x64 SWC binary that Next.js needs in
# Cloud Build (lockfiles generated on macOS-arm64 omit it).
RUN npm install --omit=dev=false \
 && npm install --no-save @next/swc-linux-x64-gnu

# ============================================================
# Stage 2: build
# ============================================================
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ============================================================
# Stage 3: runtime
# ============================================================
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

EXPOSE 8080

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public 2>/dev/null || true

USER nextjs
CMD ["node", "server.js"]

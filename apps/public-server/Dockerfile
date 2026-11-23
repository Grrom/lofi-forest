# Stage 1: Build packages and server
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/public-server/package.json apps/public-server/tsconfig.json ./apps/public-server/

RUN pnpm install --frozen-lockfile

COPY packages/shared/src ./packages/shared/src
COPY apps/public-server/src ./apps/public-server/src

RUN pnpm --filter @lofi/shared build && pnpm --filter public-server build

# Stage 2: Install production dependencies only
FROM node:22-alpine AS deps

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/public-server/package.json ./apps/public-server/

RUN pnpm --filter public-server install --prod --frozen-lockfile

# Stage 3: Minimal runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Run as non-root user
USER node

# Copy production dependencies and build artifacts
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=deps /app/apps/public-server/node_modules ./apps/public-server/node_modules
COPY --chown=node:node --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --chown=node:node --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --chown=node:node --from=builder /app/apps/public-server/package.json ./apps/public-server/package.json
COPY --chown=node:node --from=builder /app/apps/public-server/dist ./apps/public-server/dist

WORKDIR /app/apps/public-server

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health > /dev/null || exit 1

CMD ["node", "dist/index.js"]

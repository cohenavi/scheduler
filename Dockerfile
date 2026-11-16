# Stage 1: Build frontend & backend
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.server.json vite.config.ts ./
COPY client ./client
COPY server ./server

RUN npm run build

# Stage 2: Production runtime
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install postgresql-client (pg_dump/psql) for Milestone 2 backups & health diagnostics
RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=2800

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
COPY docker-entrypoint.sh ./

RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

EXPOSE 2800

ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]

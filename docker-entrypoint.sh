#!/bin/sh
set -e

echo "Running Prisma database migrations..."
npx prisma migrate deploy

echo "Running idempotent database seed..."
node dist/server/seed.js

echo "Starting Team Scheduler server on port ${PORT:-2800}..."
exec node dist/server/index.js

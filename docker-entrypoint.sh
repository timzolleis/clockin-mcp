#!/bin/sh
set -e
pnpm exec drizzle-kit migrate --config db/drizzle.config.ts
exec "$@"

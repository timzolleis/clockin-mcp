FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.29.2 --activate
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:20-bookworm-slim AS runner
RUN corepack enable && corepack prepare pnpm@10.29.2 --activate
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=/app/data/app.db
COPY package.json pnpm-lock.yaml ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY db ./db
COPY app/lib/db/schema.ts app/lib/db/auth-schema.ts ./app/lib/db/
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["pnpm", "start"]

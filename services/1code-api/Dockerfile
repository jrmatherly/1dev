# Base image pinning: use `docker pull <image> && docker inspect --format='{{index .RepoDigests 0}}' <image>`
# to get the digest, then replace the tag below. Re-pin when upgrading Bun or Node versions.
# Last pinned: 2026-04-12

# -- Stage 1: Install dependencies --
FROM oven/bun@sha256:8956c7667fa17beb6e3c664115e66bdacfe502da5d99603626e74c197bdef160 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# -- Stage 2: Build --
FROM oven/bun@sha256:8956c7667fa17beb6e3c664115e66bdacfe502da5d99603626e74c197bdef160 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY src/ src/
COPY drizzle/ drizzle/
COPY changelog/ changelog/
COPY tsconfig.json ./
RUN bun build src/index.ts --outdir dist --target node --format esm

# -- Stage 3: Runtime --
# oven/bun digest = bun:1, distroless digest = nodejs24-debian12 (upgraded from nodejs22)
FROM gcr.io/distroless/nodejs24-debian12@sha256:61f4f4341db81820c24ce771b83d202eb6452076f58628cd536cc7d94a10978b
WORKDIR /app

# Copy built output and production deps
COPY --from=deps /app/node_modules node_modules/
COPY --from=build /app/dist dist/
COPY --from=build /app/drizzle drizzle/
COPY --from=build /app/changelog changelog/

ENV NODE_ENV=production
ENV PORT=8000
EXPOSE 8000

CMD ["dist/index.js"]

# -- Stage 1: Install dependencies --
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# -- Stage 2: Build --
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY src/ src/
COPY drizzle/ drizzle/
COPY changelog/ changelog/
COPY tsconfig.json ./
RUN bun build src/index.ts --outdir dist --target node --format esm

# -- Stage 3: Runtime --
FROM gcr.io/distroless/nodejs22-debian12
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

# syntax=docker/dockerfile:1

FROM node:26-slim AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Install the pnpm version pinned by package.json's `packageManager`.
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM node:26-slim
# Node ignores SIGTERM when it runs as PID 1, so `docker stop` would wait and
# then kill it; tini forwards signals so the server exits right away.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    DATA_DIR=/data \
    TZ=UTC
RUN mkdir /data && chown node:node /data
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json LICENSE ./
USER node
VOLUME /data
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=3s \
  CMD ["node", "-e", "fetch(`http://localhost:${process.env.PORT}/`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "./dist/server/entry.mjs"]

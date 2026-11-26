# Build from the repository root: docker build -f apps/server/Dockerfile .
# Node 23+ is required for the built-in node:sqlite module.
FROM litestream/litestream:0.3.13 AS litestream

FROM node:24-slim
# Litestream needs the system CA bundle to reach R2 over HTTPS (slim images ship without it).
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev --workspace @ludo/server --include-workspace-root
COPY packages/engine packages/engine
COPY apps/server apps/server
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/server-entrypoint.sh /usr/local/bin/server-entrypoint
ENV NODE_ENV=production \
    PORT=4000 \
    DATABASE_PATH=/data/ludo.db
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4000
CMD ["sh", "/usr/local/bin/server-entrypoint"]

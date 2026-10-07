# Build from the repository root: docker build -f apps/server/Dockerfile .
# Node 23+ is required for the built-in node:sqlite module.
FROM node:23-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev --workspace @ludo/server --include-workspace-root
COPY packages/engine packages/engine
COPY apps/server apps/server
ENV NODE_ENV=production \
    PORT=4000 \
    DATABASE_PATH=/data/ludo.db
VOLUME /data
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "@ludo/server"]

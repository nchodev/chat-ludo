# Build from the repository root: docker build -f apps/web/Dockerfile .
FROM node:23-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci
COPY packages/engine packages/engine
COPY apps/web apps/web
# Public URL of the game server, baked into the client bundle at build time.
ARG NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
RUN npm run build -w @ludo/web

FROM node:23-slim
WORKDIR /app
ARG NEXT_PUBLIC_SERVER_URL
ENV NODE_ENV=production \
    NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
COPY --from=build /app /app
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@ludo/web"]

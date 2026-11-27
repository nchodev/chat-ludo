#!/bin/sh
# Starts the game server. When an R2 bucket is configured, Litestream first restores the
# database if the volume is empty, then streams every change to R2 while the server runs.
set -e

# Node runs directly (not through npm) so the stop signal reaches the server, which then saves
# every room before exiting (see shutdown() in apps/server/src/index.ts).
cd /app/apps/server
START="node --import tsx src/index.ts"

if [ -z "$LITESTREAM_BUCKET" ]; then
  echo "LITESTREAM_BUCKET absent : base de données NON sauvegardée."
  exec $START
fi

litestream restore -if-db-not-exists -if-replica-exists "$DATABASE_PATH"
exec litestream replicate -exec "$START"

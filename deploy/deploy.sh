#!/bin/sh
# Updates the production server to the latest master and rebuilds what changed.
# Run by GitHub Actions over SSH (the deploy key is locked to this script in authorized_keys),
# or by hand on the server: sh ~/chat-ludo/deploy/deploy.sh
set -eu

APP_DIR="${APP_DIR:-/root/chat-ludo}"
cd "$APP_DIR"

# One deploy at a time: a second push waits for the first one to finish.
exec 9>/tmp/luchat-deploy.lock
flock 9

echo "==> Récupération de master"
git fetch --quiet origin master
git reset --quiet --hard origin/master
git log --oneline -1

echo "==> Construction et redémarrage des services modifiés"
docker compose up -d --build --remove-orphans

echo "==> Vérification du serveur de jeu"
i=0
until docker compose exec -T server node -e "fetch('http://localhost:4000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "Le serveur ne répond pas après 60 s :"
    docker compose ps
    docker compose logs --tail=40 server
    exit 1
  fi
  sleep 2
done
docker compose ps --format 'table {{.Service}}\t{{.Status}}'

echo "==> Nettoyage des anciennes images"
docker image prune -f >/dev/null

echo "==> Déploiement terminé"

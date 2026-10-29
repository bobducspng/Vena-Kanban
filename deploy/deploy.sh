#!/usr/bin/env bash
# Deploy do Fluxos na VM. Rode na raiz do repo (ou aponte REPO_DIR).
# Idempotente: pode rodar a cada push. Chame-o do SEU gatilho de deploy
# (git pull manual, GitHub Actions via SSH, webhook — tanto faz).
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/fluxos}"
cd "$REPO_DIR"

echo "==> git pull"
git pull --ff-only

echo "==> instala dependências"
# --include=dev: o build precisa do vite/tsc mesmo se NODE_ENV=production.
npm ci --include=dev

echo "==> build (server -> app)"
# O app lê VITE_API_URL/VITE_BASE_PATH de app/.env.production (ver replica/deploy.md).
npm run build

echo "==> migrations"
# DB_* do mesmo .env do serviço. Carregado SÓ aqui: antes do npm ci, o
# NODE_ENV=production faria o npm pular as devDependencies (vite, tsc).
# Lido literalmente (não como shell): valores com < > $ não quebram o deploy.
. deploy/load-env.sh
load_env server/.env
npm run -w server db:migrate

echo "==> restart do serviço"
sudo systemctl restart fluxos-api

echo "==> ok. status:"
sudo systemctl --no-pager status fluxos-api | head -5
echo "Healthcheck:"
# O Node leva alguns segundos para subir após o restart: tenta por até 30s.
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:"${PORT:-4000}"/health; then echo; exit 0; fi
  sleep 1
done
echo "API não respondeu em 30s — veja: journalctl -u fluxos-api -n 50" >&2
exit 1

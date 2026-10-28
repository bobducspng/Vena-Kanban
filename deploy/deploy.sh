#!/usr/bin/env bash
# Deploy do Fluxos na VM. Rode na raiz do repo (ou aponte REPO_DIR).
# Idempotente: pode rodar a cada push. Chame-o do SEU gatilho de deploy
# (git pull manual, GitHub Actions via SSH, webhook — tanto faz).
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/fluxos}"
cd "$REPO_DIR"

# DB_*/PORT etc. do mesmo .env do serviço (a migração precisa deles).
set -a; . server/.env; set +a

echo "==> git pull"
git pull --ff-only

echo "==> instala dependências"
npm ci

echo "==> build (server -> app)"
# O app lê VITE_API_URL de app/.env.production; deixe-o VAZIO (origin único).
npm run build

echo "==> migrations"
npm run -w server db:migrate

echo "==> restart do serviço"
sudo systemctl restart fluxos-api

echo "==> ok. status:"
sudo systemctl --no-pager status fluxos-api | head -5
echo "Healthcheck:"
curl -fsS http://127.0.0.1:"${PORT:-4000}"/health && echo

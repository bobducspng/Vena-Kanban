#!/usr/bin/env bash
# Configura o envio de e-mail do Fluxos (SMTP do Google Workspace) no server/.env
# e reinicia a API. Pede a senha de app sem mostrá-la na tela.
# Uso, na VM:  bash /opt/fluxos/deploy/setup-email.sh
set -euo pipefail

ENV_FILE="${REPO_DIR:-/opt/fluxos}/server/.env"
USER_EMAIL="${1:-comunicacao@vena.app.br}"

echo "Conta que vai enviar: $USER_EMAIL"
read -rsp "Cole a senha de app (16 letras; não aparece): " PASS; echo
PASS="${PASS// /}"   # o Google mostra a senha em blocos com espaços
if [ "${#PASS}" -ne 16 ]; then
  echo "A senha de app tem 16 letras; recebi ${#PASS}. Nada foi alterado." >&2
  exit 1
fi

# Remove uma configuração anterior, se houver, e grava a nova.
sed -i '/^SMTP_/d' "$ENV_FILE"
cat >> "$ENV_FILE" <<EOF
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=$USER_EMAIL
SMTP_PASS=$PASS
SMTP_FROM=Fluxos Vena <$USER_EMAIL>
EOF
unset PASS
chmod 600 "$ENV_FILE"

sudo systemctl restart fluxos-api
sleep 3
echo "Linhas SMTP gravadas: $(grep -c '^SMTP_' "$ENV_FILE") (esperado: 5)"
echo "API: $(systemctl is-active fluxos-api) (esperado: active)"

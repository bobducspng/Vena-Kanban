#!/usr/bin/env bash
# Backup noturno do MySQL do Fluxos. Instale no cron (ver deploy.md):
#   0 3 * * *  /opt/fluxos/deploy/backup.sh >> /var/log/fluxos-backup.log 2>&1
set -euo pipefail

# Lê DB_* do mesmo .env do serviço.
set -a; . /opt/fluxos/server/.env; set +a

DEST="/var/backups/fluxos"
mkdir -p "$DEST"
STAMP="$(date +%F_%H%M)"
FILE="$DEST/${DB_NAME}_${STAMP}.sql.gz"

mysqldump --single-transaction --quick --host="${DB_HOST:-127.0.0.1}" \
  --port="${DB_PORT:-3306}" --user="$DB_USER" --password="$DB_PASSWORD" \
  "$DB_NAME" | gzip > "$FILE"

echo "backup -> $FILE"

# Retenção: mantém os últimos 14 dias.
find "$DEST" -name "${DB_NAME}_*.sql.gz" -mtime +14 -delete

#!/usr/bin/env bash
# Backup noturno do Venaflow: o banco (mysqldump) e os arquivos (anexos, PDFs, vias
# assinadas e logos em data/uploads). Instalado pelo deploy/setup-backup.sh (cron do root).
#   /var/backups/fluxos/db/<banco>_<data>.sql.gz      um arquivo por noite
#   /var/backups/fluxos/files/<data>/                  uma cópia por noite; arquivos que não
#                                                      mudaram são "hard links" (não ocupam espaço de novo)
#   /var/backups/fluxos/status.json                    resultado da última execução (a tela de
#                                                      Configurações mostra)
# Mantém as últimas 14 noites. Se falhar, os administradores recebem um e-mail.
set -euo pipefail

APP=/opt/fluxos
DEST=/var/backups/fluxos
KEEP=14
STAMP="$(date +%F_%H%M)"
STATUS="$DEST/status.json"

. "$APP/deploy/load-env.sh"
load_env "$APP/server/.env"
UPLOADS="${UPLOAD_DIR:-$APP/data/uploads}"

write_status() { # ok|failed, message
  printf '{"status":"%s","at":"%s","message":"%s","dbFile":"%s","dbBytes":%s,"filesCount":%s,"filesBytes":%s,"diskFree":"%s"}\n' \
    "$1" "$(date -Iseconds)" "${2//\"/\'}" "${DB_FILE:-}" "${DB_BYTES:-0}" "${FILES_COUNT:-0}" "${FILES_BYTES:-0}" \
    "$(df -h "$DEST" | awk 'NR==2 {print $4}')" > "$STATUS.tmp"
  mv "$STATUS.tmp" "$STATUS"
  chmod 644 "$STATUS"
}

on_error() {
  local msg="Backup falhou na linha $1 ($(date '+%d/%m/%Y %H:%M')). Veja /var/log/fluxos-backup.log na VM."
  echo "ERRO: $msg"
  write_status failed "$msg" || true
  # Avisa os administradores pelo e-mail do próprio Venaflow.
  (cd "$APP" && node server/dist/scripts/backupAlert.js "$msg") || echo "aviso por e-mail também falhou"
}
trap 'on_error $LINENO' ERR

mkdir -p "$DEST/db" "$DEST/files" "$UPLOADS"
chmod 755 "$DEST"

# 1. Banco ------------------------------------------------------------------------------
# --no-tablespaces: o usuário do app não tem o privilégio PROCESS (MySQL 8 recusaria).
PART="$DEST/db/.${DB_NAME}_${STAMP}.sql.gz.part"
MYSQL_PWD="$DB_PASSWORD" mysqldump --single-transaction --quick --no-tablespaces --routines \
  --host="${DB_HOST:-127.0.0.1}" --port="${DB_PORT:-3306}" --user="$DB_USER" "$DB_NAME" | gzip > "$PART"
gzip -t "$PART"                                             # o arquivo abre?
zcat "$PART" | tail -n 1 | grep -q "Dump completed"         # o dump chegou ao fim?
DB_FILE="$DEST/db/${DB_NAME}_${STAMP}.sql.gz"
mv "$PART" "$DB_FILE"
chmod 600 "$DB_FILE"                                        # contém os dados: só o root lê
DB_BYTES="$(stat -c %s "$DB_FILE")"
echo "banco    -> $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"

# 2. Arquivos ---------------------------------------------------------------------------
LAST="$(ls -1d "$DEST"/files/20* 2>/dev/null | tail -n 1 || true)"
SNAP="$DEST/files/$STAMP"
rsync -a --delete ${LAST:+--link-dest="$LAST"} "$UPLOADS/" "$SNAP/"
chmod 700 "$SNAP"
FILES_COUNT="$(find "$SNAP" -type f | wc -l)"
FILES_BYTES="$(du -sb "$SNAP" | cut -f1)"
echo "arquivos -> $SNAP ($FILES_COUNT arquivos, $(du -sh "$SNAP" | cut -f1))"

# 3. Retenção: as últimas $KEEP noites (por nome, que é a data) -----------------------------
ls -1 "$DEST"/db/*.sql.gz 2>/dev/null | head -n -"$KEEP" | xargs -r rm -f
ls -1d "$DEST"/files/20* 2>/dev/null | head -n -"$KEEP" | xargs -r rm -rf

write_status ok "Backup concluído"
echo "ok $(date '+%d/%m/%Y %H:%M') · livre no disco: $(df -h "$DEST" | awk 'NR==2 {print $4}')"

#!/usr/bin/env bash
# Confere se o último backup realmente restaura, sem tocar no banco de produção:
# carrega o dump num banco temporário, compara a quantidade de linhas das tabelas
# principais com o banco em uso e confere os arquivos. Depois apaga o temporário.
# Rode com sudo:  sudo /opt/fluxos/deploy/restore-test.sh
# (o setup-backup.sh agenda uma vez por semana, domingo 05:00)
#
# RESTAURAR DE VERDADE (só em caso de perda; pare o app antes):
#   sudo systemctl stop fluxos-api
#   gunzip -c /var/backups/fluxos/db/<arquivo>.sql.gz | sudo mysql <nome do banco>
#   sudo rsync -a /var/backups/fluxos/files/<data>/ /opt/fluxos/data/uploads/
#   sudo systemctl start fluxos-api
set -euo pipefail

APP=/opt/fluxos
DEST=/var/backups/fluxos
TEST_DB=fluxos_restore_test
. "$APP/deploy/load-env.sh"
load_env "$APP/server/.env"
UPLOADS="${UPLOAD_DIR:-$APP/data/uploads}"

DUMP="$(ls -1 "$DEST"/db/*.sql.gz | tail -n 1)"
SNAP="$(ls -1d "$DEST"/files/20* | tail -n 1)"
echo "testando $DUMP"

# O root do MySQL entra pelo socket (sudo mysql) no Ubuntu.
mysql -e "DROP DATABASE IF EXISTS $TEST_DB; CREATE DATABASE $TEST_DB"
trap 'mysql -e "DROP DATABASE IF EXISTS '"$TEST_DB"'" || true' EXIT
gunzip -c "$DUMP" | mysql "$TEST_DB"

FAIL=0
for t in pipes phases fields cards card_fields attachments users signature_requests; do
  b="$(mysql -N -e "SELECT COUNT(*) FROM $TEST_DB.\`$t\`")"
  l="$(mysql -N -e "SELECT COUNT(*) FROM \`$DB_NAME\`.\`$t\`")"
  # Produção pode ter crescido desde a noite; menos linhas que o backup é que seria estranho.
  if [ "$b" -gt "$l" ]; then mark="??"; FAIL=1; else mark="ok"; fi
  printf '  %-20s backup %6s · agora %6s  %s\n' "$t" "$b" "$l" "$mark"
done

# Todo anexo registrado no backup do banco tem o arquivo no backup de arquivos?
missing=0
while read -r card id; do
  [ -f "$SNAP/$card/$id" ] || missing=$((missing + 1))
done < <(mysql -N -e "SELECT card_id, id FROM $TEST_DB.attachments WHERE card_id IS NOT NULL")
echo "  anexos sem arquivo no backup: $missing"
[ "$missing" -eq 0 ] || FAIL=1

if [ "$FAIL" -eq 0 ]; then echo "RESTAURAÇÃO OK ($(date '+%d/%m/%Y %H:%M'))"; else echo "ATENÇÃO: algo não bateu, veja acima"; exit 1; fi

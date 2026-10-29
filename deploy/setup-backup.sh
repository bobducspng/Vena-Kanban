#!/usr/bin/env bash
# Instala o backup noturno do Venaflow (rode uma vez na VM):
#   sudo bash /opt/fluxos/deploy/setup-backup.sh
# Agenda: backup todo dia 03:30; teste de restauração domingo 05:00. Roda os dois agora.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash $0"; exit 1; }

command -v rsync >/dev/null || apt-get install -y rsync
chmod +x /opt/fluxos/deploy/backup.sh /opt/fluxos/deploy/restore-test.sh

cat > /etc/cron.d/fluxos-backup <<'CRON'
# Venaflow: backup do banco + arquivos (deploy/backup.sh) e teste semanal de restauração.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 3 * * * root /opt/fluxos/deploy/backup.sh >> /var/log/fluxos-backup.log 2>&1
0 5 * * 0 root /opt/fluxos/deploy/restore-test.sh >> /var/log/fluxos-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/fluxos-backup

# O backup antigo (só banco) pode estar no crontab do ubuntu ou do root: tira para não rodar duas vezes.
for u in ubuntu root; do
  if crontab -u "$u" -l 2>/dev/null | grep -q "deploy/backup.sh"; then
    crontab -u "$u" -l | grep -v "deploy/backup.sh" | crontab -u "$u" -
    echo "removido o agendamento antigo do usuário $u"
  fi
done

cat > /etc/logrotate.d/fluxos-backup <<'ROT'
/var/log/fluxos-backup.log {
  monthly
  rotate 6
  compress
  missingok
  notifempty
}
ROT

echo "== backup agora =="
/opt/fluxos/deploy/backup.sh 2>&1 | tee -a /var/log/fluxos-backup.log
echo
echo "== teste de restauração =="
/opt/fluxos/deploy/restore-test.sh 2>&1 | tee -a /var/log/fluxos-backup.log
echo
echo "Pronto. Agendado em /etc/cron.d/fluxos-backup. Último resultado aparece em Configurações > Backup."

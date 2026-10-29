#!/usr/bin/env bash
# Libera envios de até 30 MB pelo nginx (o padrão é 1 MB: anexos e logos maiores falham).
#   sudo bash /opt/fluxos/deploy/fix-upload-limit.sh
# Grava /etc/nginx/conf.d/fluxos-upload.conf (vale para todos os sites), testa a
# configuração e só recarrega o nginx se o teste passar.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash $0"; exit 1; }

CONF=/etc/nginx/conf.d/fluxos-upload.conf
echo "client_max_body_size 30m;" > "$CONF"
if nginx -t; then
  systemctl reload nginx
  echo "ok: limite de envio = 30 MB"
else
  rm -f "$CONF"
  echo "o teste do nginx falhou; nada foi alterado"
  exit 1
fi
# Um site com limite próprio menor ganha deste: avisa se houver.
grep -rn "client_max_body_size" /etc/nginx/sites-enabled/ 2>/dev/null && echo "ATENÇÃO: o site acima tem limite próprio; me mande esta saída." || true

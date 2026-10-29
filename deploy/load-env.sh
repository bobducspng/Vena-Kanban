# Carrega um arquivo .env (KEY=valor por linha) como variáveis exportadas, sem
# interpretá-lo como shell: "<", ">", "$", espaços etc. no valor ficam como estão.
# Aspas em volta do valor (simples ou duplas) são removidas, como faz o systemd.
# Uso: . deploy/load-env.sh; load_env server/.env
load_env() {
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue ;; esac
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    val="${line#*=}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$val" =~ ^\"(.*)\"$ || "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
    export "$key=$val"
  done < "$1"
}

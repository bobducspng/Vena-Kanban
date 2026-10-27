# Deploy: Fluxos (replica_pipefy) — uso interno na VM Oracle + ngrok

Date: 2026-10-27 · Go do usuário: **não ainda** (checklist abaixo)

> Este runbook é adaptado ao seu caso (uso interno, VM própria, ngrok free,
> deploy via GitHub) — **não** ao caminho Vercel/Stripe/domínio da skill
> `replica-deploy`, que é para SaaS público. Arquivos de apoio em `deploy/`.

## Topologia escolhida: **origin único**

O front é estático (build do Vite) e o backend é Express. Com ngrok free você tem
**um túnel**. Então o **Express serve o `app/dist`**: API e front no mesmo
endereço público. Benefícios: sem CORS entre origens, cookie de sessão simples, e
o OAuth/redirect num domínio só.

```
Navegador ──https──▶ ngrok (domínio estático) ──http──▶ Express :4000
                                                   ├── /auth/*   (OAuth)
                                                   ├── /trpc/*   (API)
                                                   └── /*        (SPA app/dist)
```

Mudanças de código já feitas para isso:
- `server/src/index.ts` — serve `app/dist` + fallback SPA, `trust proxy`, CSP off.
- `server/src/http/authRoutes.ts` + `env.ts` + `auth/google.ts` — **allowlist de
  login** (só e-mails verificados e autorizados; em produção, *fail closed*).
- `app/src/screens/Login.tsx` — mostra "conta não autorizada" quando bloqueado.
- Build: `npm run build` (server→app) passa com 0 erros.

## Preflight (trave aqui se algo falhar)

- [x] Sem bugs S1/S2 em aberto (ver `bugs.md`: 6/6 corrigidos).
- [x] Build de produção passa (`npm run build`).
- [ ] Suíte e2e verde **na VM** (`npx playwright test`) — não roda na máquina Win.
- [x] **Allowlist de login** implementada (crítico: sem ela, qualquer conta
      Google viraria admin).
- [ ] `ALLOWED_EMAIL_DOMAINS`/`ALLOWED_EMAILS` preenchidos no `.env` de produção.
- [ ] Backup noturno do MySQL ligado.
- [ ] (uso interno) Política de privacidade/termos: dispensável se for só para a
      equipe; necessário só se expor a terceiros.

## Runbook (ordem)

### 1. Google Cloud Console (você faz)
Em *APIs & Services → Credentials → OAuth client*:
- **Authorized redirect URI**: `https://SEU-DOMINIO.ngrok-free.app/auth/google/callback`
- **Authorized JavaScript origin**: `https://SEU-DOMINIO.ngrok-free.app`
- Tela de consentimento: como usa só escopos `openid email profile` (não
  sensíveis), não precisa de verificação do Google; em "Testing" só e-mails de
  teste entram — publique como "In production" (ou adicione os e-mails como
  testers) se quiser liberar a equipe.

### 2. ngrok com domínio estático (você faz)
- No painel ngrok, reserve o domínio free (1 grátis).
- Na VM: `ngrok config add-authtoken <TOKEN>`.
- Suba como serviço: `deploy/fluxos-ngrok.service` (troque o `--domain`).

### 3. MySQL de produção (na VM)
```bash
# Banco e usuário dedicados (NÃO reaproveite um banco de dev):
sudo mysql -e "CREATE DATABASE fluxos CHARACTER SET utf8mb4;"
sudo mysql -e "CREATE USER 'fluxos'@'localhost' IDENTIFIED BY 'SENHA_FORTE';"
sudo mysql -e "GRANT ALL ON fluxos.* TO 'fluxos'@'localhost'; FLUSH PRIVILEGES;"
```

### 4. Código na VM + env
```bash
sudo git clone <SEU_REPO> /opt/fluxos         # ou já está clonado
cd /opt/fluxos
cp server/.env.example server/.env            # preencha (ver abaixo)
printf 'VITE_API_URL=\n' > app/.env.production # VAZIO = origin único
```
No `server/.env` de produção:
- `NODE_ENV=production`
- `DB_*` do banco criado no passo 3
- `GOOGLE_CLIENT_ID/SECRET`
- `PUBLIC_BASE_URL=https://SEU-DOMINIO.ngrok-free.app`
- `APP_ORIGIN=https://SEU-DOMINIO.ngrok-free.app`  ← igual ao de cima
- `SESSION_SECRET=` (gere: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `ALLOWED_EMAIL_DOMAINS=suaempresa.com`  (e/ou `ALLOWED_EMAILS=...`)

### 5. Primeiro build + migração + (opcional) seed
```bash
cd /opt/fluxos
npm ci && npm run build
npm run -w server db:migrate
# Seed é DADO DE DEMONSTRAÇÃO. Em prod, normalmente NÃO rode.
# Rode só se quiser os cards de exemplo: npm run -w server db:seed
```

### 6. Serviço systemd da API
```bash
sudo cp deploy/fluxos-api.service /etc/systemd/system/
# ajuste User/WorkingDirectory se não for /opt/fluxos
sudo systemctl daemon-reload
sudo systemctl enable --now fluxos-api fluxos-ngrok
curl -fsS http://127.0.0.1:4000/health   # {"ok":true}
```

### 7. Deploy contínuo: Claude Desktop → GitHub → Actions → VM

Seu fluxo é: você edita no **Claude Desktop**, ele **commita e dá push** no
GitHub. A página de indicadores é estática (o GitHub publica direto); **o Fluxos
não é** — tem backend + MySQL que precisam rodar na VM. Então um **GitHub Action**
fecha o ciclo: a cada push na `main`, ele entra na VM por SSH e roda
`deploy/deploy.sh`. Workflow já versionado em **`.github/workflows/deploy.yml`**.

**7a. Secrets no GitHub** (repo → Settings → Secrets and variables → Actions →
*New repository secret*) — você preenche os valores:

| secret | valor |
| --- | --- |
| `VM_HOST` | IP público da VM Oracle |
| `VM_USER` | usuário SSH (ex.: `ubuntu` ou `fluxos`) |
| `VM_SSH_KEY` | **chave privada** de um par dedicado ao deploy (conteúdo inteiro) |
| `VM_PORT` | `22` (opcional) |
| `VM_REPO_DIR` | `/opt/fluxos` (opcional) |

**7b. Preparo único na VM:**
- Gere um par de chaves só para o deploy e autorize a pública:
  ```bash
  ssh-keygen -t ed25519 -f ~/deploy_key -N ""
  cat ~/deploy_key.pub >> ~/.ssh/authorized_keys
  # o conteúdo de ~/deploy_key (privada) vai no secret VM_SSH_KEY
  ```
- A VM precisa **puxar do GitHub** no `git pull` do `deploy.sh`. Se o repo é
  privado, adicione uma **deploy key** de leitura no GitHub (repo → Settings →
  Deploy keys) com uma chave da VM, ou use um remote HTTPS com token.
- `deploy.sh` reinicia o serviço com `sudo`; libere **sem senha** só esse comando:
  ```bash
  echo '%fluxos ALL=(root) NOPASSWD: /usr/bin/systemctl restart fluxos-api' | \
    sudo tee /etc/sudoers.d/fluxos-deploy
  ```
  (troque `fluxos` pelo grupo/usuário do SSH.)

**7c. Testar:** faça um push qualquer (ou use *Actions → Run workflow*). Veja o log
do job no GitHub e o `journalctl -u fluxos-api` na VM.

> Alternativa sem Actions: se preferir, você mesmo roda
> `ssh vm 'cd /opt/fluxos && ./deploy/deploy.sh'` após o push. O workflow só
> automatiza isso.

### 8. Backup noturno
```bash
sudo cp deploy/backup.sh /opt/fluxos/deploy/ && sudo chmod +x /opt/fluxos/deploy/backup.sh
( crontab -l 2>/dev/null; echo "0 3 * * * /opt/fluxos/deploy/backup.sh >> /var/log/fluxos-backup.log 2>&1" ) | crontab -
```

### 9. Verificar no ar
- `journalctl -u fluxos-api -f` enquanto testa.
- Abra `https://SEU-DOMINIO.ngrok-free.app`, faça login com um e-mail **da
  allowlist** (deve entrar) e um de fora (deve ver "conta não autorizada").
- Fluxo central: criar pipe → novo card → mover até Concluído.

## Observações honestas / limites

- **ngrok free** mostra uma página de aviso (interstitial) antes do app e tem
  limites de banda/conexões — ok para uso interno pequeno; para algo mais sério,
  um domínio próprio + proxy (Caddy/nginx) na VM remove o aviso.
- **`npm ci` na VM ARM** compila deps nativas (mysql2 é JS puro; ok). Se faltar
  memória no build do Vite na A1, use swap.
- **Sessão/cookie**: `secure` liga em produção; como o navegador fala HTTPS com o
  ngrok, funciona. `trust proxy` já está setado.
- Primeiro usuário autorizado a logar vira **admin** (cria a org). Os demais
  entram como **member**. Se quiser que um específico seja admin, ajuste a regra
  no callback — me avise.

## Pendências antes do "go"
1. Rodar e2e verde na VM.
2. Preencher a allowlist no `.env`.
3. Ligar o backup.
4. Passo 7: adicionar os 3 secrets no GitHub + preparo da chave SSH na VM
   (workflow já está em `.github/workflows/deploy.yml`).

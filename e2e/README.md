# E2E (Playwright) — Fluxos

Testes ponta a ponta do `app` ligado ao `server` + MySQL. Cobrem as fatias
construídas: **F01** (criar pipe) e **F02** (card do início à conclusão),
incluindo os gates de campo obrigatório e um scan de acessibilidade (`axe`) por
tela. Fluxos em stub (F03–F06) ainda não têm specs.

## Por que há um `global-setup`

O login é **só Google OAuth real**, que não dá para automatizar. Em vez de abrir
um atalho de login no backend (superfície de ataque), o `global-setup.ts`
escreve uma linha em `sessions` para um usuário do seed — exatamente o que o
fluxo real faria — e grava o cookie `sid` em `e2e/.auth/state.json`, usado como
`storageState` por todos os specs. Nada no servidor muda.

## Pré-requisitos

1. **MySQL no ar** e `server/.env` preenchido (o setup lê `DB_*` de lá).
2. Migrar + semear:
   ```bash
   npm run -w server db:migrate
   npm run -w server db:seed
   ```
3. **Backend no ar**: `npm run dev:server` (http://localhost:4000).
4. **app/.env.local** com `VITE_API_URL=http://localhost:4000`.
   (O Playwright sobe o `app` sozinho via `webServer`.)
5. Instalar dependências de teste (na raiz do repo):
   ```bash
   npm i -D @playwright/test @axe-core/playwright dotenv
   npx playwright install chromium
   ```

## Rodar

```bash
npx playwright test          # tudo
npx playwright test f02      # só F02
npx playwright show-report   # relatório HTML
```

## Variáveis opcionais

| var | padrão | para quê |
| --- | --- | --- |
| `APP_URL` | `http://localhost:5173` | origem do front |
| `E2E_USER_EMAIL` | `ana@empresa.com` | usuário do seed usado na sessão |

## Ainda não coberto (precisa de trabalho de ambiente)

- **F02-E8 isolamento entre orgs**: o seed põe todos na mesma org. Semear uma 2ª
  org + usuário e um segundo `storageState` para provar que dados de outra org
  ficam invisíveis.
- **F02-E4 conflito em 2 abas**: hoje falha por BUG-005 (front não envia
  `version`). Vira teste de regressão depois do fix.
- **Casos manuais** (fuso/DST, mobile 390px fino, leitor de tela real): ver
  `replica/test-plan.md`.

> Nota honesta: estes specs **não foram executados** no ambiente de
> desenvolvimento (Windows, sem MySQL/OAuth). São para rodar na VM ou em CI com a
> stack de pé. Ajuste seletores se algum texto de UI mudar.

# Bugs — Fluxos (replica_pipefy)

Build: wired-to-tRPC (pré-commit) · Date: 2026-10-27

> **Natureza desta lista.** Estes achados vêm de **revisão de código** da camada
> recém-ligada ao tRPC, não de execução — este ambiente não tem MySQL nem o
> OAuth real para subir a stack (ver nota em `test-plan.md`). Cada item tem passo
> a passo e o trecho de código que o causa; o status é **a reproduzir** até rodar
> contra a stack na VM. Nenhum foi "achado no escuro": todos saem de um caminho
> de código concreto. Itens realmente incertos estão em "A verificar" no fim.

Severidade: S1 perda de dados/segurança/fluxo central travado · S2 feature
quebrada sem contorno · S3 quebrada com contorno ou visivelmente errada · S4
cosmético.

---

### BUG-001: Deslogado cai numa tela vazia, não no login

- Severity: S2
- Flow / case: F01-N1, F02-E9
- Screen: S02 (OrgHome) / app inteiro
- Build: wired-to-tRPC · Browser/device: qualquer

Steps
1. Sem sessão (cookie `sid` ausente ou expirado), abrir `/`.
2. `OrgHome` dispara `api.pipe.list()`.
3. O servidor responde `UNAUTHORIZED` (`protectedProcedure`, `trpc.ts:31`).

Expected: redirecionar para `/login` (único lugar que inicia o OAuth).
Actual: `OrgHome` só trata `isLoading` e "lista vazia" (`OrgHome.tsx:44-54`).
Com a query em erro, `isLoading=false` e `pipes=undefined` → renderiza o estado
**"Nenhum pipe ainda"** para um usuário deslogado. O `/login` só é alcançável
digitando a URL à mão; nada no app leva até lá. Além disso o React Query
**repete o 401 três vezes** (retry padrão) antes de desistir.
Evidence: `app/src/App.tsx` (sem rota-guarda), `app/src/screens/OrgHome.tsx:21,44-54`,
`app/src/lib/trpc.ts` (sem tratamento de 401), `server/src/trpc/trpc.ts:30-35`.
Suspected cause: nenhuma guarda de rota; o cliente tRPC não traduz 401 → login.
Status: **corrigido (a validar verde na VM)**.
Fix aplicado:
- `app/src/components/app/RequireAuth.tsx` — gate que checa `user.me`; em
  `UNAUTHORIZED` faz `<Navigate to="/login" replace>`, mostra spinner enquanto
  verifica, e uma mensagem (sem loop) em outros erros.
- `app/src/App.tsx` — rotas `/`, `/pipes/:id` e os stubs embrulhadas em
  `RequireAuth`; `/login` e `/design` seguem públicas.
- `app/src/lib/trpc.ts` — `isUnauthorized(err)` (checa `TRPCClientError.data.code`).
- `app/src/data/store.ts` — `api.user.me()`.
- `app/src/main.tsx` — QueryClient não faz retry em `UNAUTHORIZED`.
Teste de regressão: `e2e/f00-auth.spec.ts` (deslogado em `/` e em `/pipes/:id`
vai para `/login`; não vaza "Nenhum pipe ainda"). Build do monorepo: 0 erros.
Falta: rodar o spec contra a stack na VM para ver verde.

### BUG-002: O cabeçalho mostra sempre o usuário de demonstração

- Severity: S3
- Flow / case: todos (layout)
- Screen: Header (todas as telas)

Steps
1. Logar como qualquer usuário real via Google.
2. Olhar o avatar no canto superior direito.

Expected: avatar/identidade do usuário logado.
Actual: o `Header` lê `currentUserId` e `users` de `src/data/seed.ts` — dados de
demonstração fixos. Mostra sempre "Ana Souza" (ou quem for o seed), não quem
logou. Não há `user.me` no backend para resolver o usuário atual.
Evidence: `app/src/components/app/Header.tsx:3,6,20`.
Status: **corrigido (a validar verde na VM)**.
Fix aplicado: o Header agora lê `api.user.me` (cache `["me"]` do RequireAuth) e
mostra nome/e-mail/avatar reais; não importa mais nada de `seed.ts`.
Evidence do fix: `app/src/components/app/Header.tsx`.
Teste de regressão: `e2e/f03-header.spec.ts` ("mostra o usuário autenticado").

### BUG-003: O detalhe do card só mostra os campos da fase inicial

- Severity: S3 (latente hoje; vira armadilha assim que houver campo fora do start)
- Flow / case: F02-E7
- Screen: S06 (CardDetailModal)

Steps
1. Ter um campo definido numa fase que **não** é a inicial (hoje só via seed/SQL,
   já que o editor S11 é stub).
2. Abrir um card e tentar preencher/ver esse campo.

Expected: o detalhe mostra os campos da fase atual do card (ou todos, agrupados).
Actual: `CardDetailModal` filtra **só** os campos cujo `phaseId` é o da fase
`isStart` e renderiza apenas esses (`CardDetailModal.tsx:52,82`). Campos de
outras fases ficam invisíveis e não-editáveis. Pior: o gate de obrigatórios do
`move` checa os obrigatórios da **fase atual** (`server/.../card.ts:119-123`); se
um obrigatório morar numa fase do meio, o avanço fica **impossível de satisfazer
pela UI** — card travado sem saída.
Evidence: `app/src/components/app/CardDetailModal.tsx:52,82`, `server/src/trpc/routers/card.ts:119-123`.
Status: **corrigido (a validar verde na VM)**.
Fix aplicado: o detalhe agora mostra **todos os campos agrupados por fase** (na
ordem das fases), com a fase atual marcada — nenhum campo fica invisível, e os
obrigatórios de qualquer fase podem ser preenchidos. Para exercitar o cenário, o
seed ganhou um campo opcional "Parecer da análise" na fase "Em análise".
Evidence do fix: `app/src/components/app/CardDetailModal.tsx`, `server/src/seed.ts`.
Teste de regressão: `e2e/f04-fixes.spec.ts` (BUG-003).

### BUG-004: Avatares de responsável somem para usuários reais

- Severity: S4
- Flow / case: F02-E13
- Screen: S03 (PipeKanban), Header

Steps
1. Atribuir um usuário real a um card (`card_assignees`).
2. Ver o card no kanban.

Expected: o avatar do responsável aparece no card.
Actual: o kanban resolve `assigneeIds` contra `users` do `seed.ts`; IDs reais não
batem → `u ? <Avatar/> : null` renderiza **nada**. Responsáveis ficam invisíveis.
Evidence: `app/src/screens/PipeKanban.tsx:13,74-77`.
Status: **corrigido (a validar verde na VM)**.
Fix aplicado: o kanban busca os membros via `api.user.list` e resolve os avatares
por um mapa id→usuário; se faltar, mostra um avatar neutro ("Usuário") em vez de
sumir. Não importa mais `users` do seed. O seed ganhou um responsável (Ana no
card "Notebooks…") para exercitar o caso.
Evidence do fix: `app/src/screens/PipeKanban.tsx`, `server/src/seed.ts`.
Teste de regressão: `e2e/f05-assignees.spec.ts`.

### BUG-005: Trava otimista de versão nunca dispara (mover em 2 abas)

- Severity: S3
- Flow / case: F02-E4
- Screen: S06 → move

Steps
1. Abrir o mesmo card em duas abas.
2. Avançar a fase na aba A; depois avançar na aba B (sobre estado velho).

Expected: a aba B detecta o conflito (`CONFLICT`, "recarregue").
Actual: o backend suporta a trava (`card.move` compara `version` quando enviada,
`card.ts:108-134`), mas o front **nunca envia `version`** — `api.card.move` só
passa `{cardId, toPhaseId}` (`store.ts:100`) e o `CardDetailModal` idem
(`CardDetailModal.tsx:42`). Logo o caminho de conflito é inalcançável; a aba B
sobrescreve sem aviso.
Evidence: `app/src/data/store.ts:100-106`, `app/src/components/app/CardDetailModal.tsx:41-45`.
Status: **corrigido (a validar verde na VM)**.
Fix aplicado: `Card.version` passou a existir no front (`types.ts`), é mapeado do
servidor (`store.ts`) e enviado no `move`; o `CardDetailModal` detecta `CONFLICT`
(`isConflict` em `lib/trpc.ts`), mostra "alterado por outra pessoa. Recarregado."
e refaz o fetch.
Evidence do fix: `app/src/data/types.ts`, `app/src/data/store.ts`,
`app/src/lib/trpc.ts`, `app/src/components/app/CardDetailModal.tsx`.
Teste de regressão: `e2e/f04-fixes.spec.ts` (BUG-005, duas abas).

### BUG-006: Não há como sair (logout) pela interface

- Severity: S3
- Flow / case: —
- Screen: Header / app inteiro

Steps
1. Logado, procurar uma ação de "Sair".

Expected: um controle de logout que chama o backend e volta ao login.
Actual: o servidor expõe `/logout` (`http/authRoutes.ts`) mas **nenhum
componente** o chama; não há menu de usuário. Só dá para sair limpando o cookie
à mão.
Evidence: `app/src/components/app/Header.tsx` (sem menu/logout); rota de logout
existe no servidor mas sem consumidor.
Status: **corrigido (a validar verde na VM)**.
Nota: a rota real é **POST `/auth/logout`** (não GET `/logout`).
Fix aplicado: menu Radix no avatar do Header com "Sair" → `fetch(POST
/auth/logout, credentials:"include")`, limpa o cache do React Query e navega
para `/login`.
Evidence do fix: `app/src/components/app/Header.tsx`.
Teste de regressão: `e2e/f03-header.spec.ts` ("logout encerra a sessão e vai ao
/login").

---

## A verificar (não reproduzido / pode ser intencional)

- **Org escolhida de forma não-determinística**: `createContext` usa a *primeira*
  membership do usuário sem ordenação (`trpc.ts:20`). Para uso interno de uma org
  só, tudo bem; com multi-org o usuário pode cair numa org arbitrária.
- **Voltar de fase (←) bloqueado por obrigatório da fase atual**: o gate roda
  também no move para trás (`card.ts:119`). Pode ser intencional; confirmar a
  regra desejada.
- **Teste de isolamento (F02-E8) precisa de 2ª org no seed**: hoje os 3 usuários
  do seed estão na mesma org; o `db:seed` é idempotente e não cria uma segunda.
  Sem isso não dá para provar "dados de outra org invisíveis".
- **`card.updateField` retorna `{...card}` lido antes do update** (`card.ts:105`):
  como só muda valor de campo (rehidratado), as colunas do card seguem válidas;
  verificar que nada mais mudou nesse meio-tempo.
- ~~**Retry de 401 pelo React Query** (3×)~~ — resolvido junto do BUG-001
  (`main.tsx` não faz retry em `UNAUTHORIZED`).

## Resumo

| severidade | abertos | corrigidos (a validar) |
| --- | --- | --- |
| S1 | 0 | — |
| S2 | 0 | BUG-001 |
| S3 | 0 | BUG-002, BUG-003, BUG-005, BUG-006 |
| S4 | 0 | BUG-004 |

**Nenhum bug em aberto.** Todos os 6 corrigidos, com teste de regressão, e o
build do monorepo passa. Falta só rodar a suíte contra a stack na VM para ver o
verde (aqui não há MySQL/OAuth). Itens da lista "A verificar" seguem pendentes
(não são bugs confirmados).

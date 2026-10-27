# Test plan: Fluxos (replica_pipefy)

Build: wired-to-tRPC (pré-commit) · Date: 2026-10-27 · Env: local dev + MySQL seed

Scope deste ciclo = o que está **construído**: F01 (criar pipe) e F02 (card do
início à conclusão). F03–F06 dependem de telas ainda em stub (S11, S12, S13,
S08) — cases listados mas marcados **bloqueado (não construído)**.

Convenção da coluna `result`: `pass` / `fail BUG-xxx` / `blocked` /
`not run` (não executável neste ambiente — ver nota no fim).

## Pré-condições

- `server` no ar com MySQL migrado + `db:seed` rodado (org "Minha Empresa",
  usuários ana/bruno/carla, pipe "Solicitações de compra").
- `app` apontando para o backend via `VITE_API_URL`.
- Sessão autenticada. **Login é só Google OAuth real** → testes automatizados
  injetam uma sessão direto no banco (ver `e2e/README.md`, `global-setup.ts`).
- Autorização cross-org (F02-E8) exige **uma segunda org + usuário** semeados —
  o seed atual põe os 3 usuários na *mesma* org (ver BUG/na lista "a verificar").

---

## F01 — Construir um pipe

Construído: criar pipe (nome) + fases/campos padrão via backend. Editor de fases
e form builder (S11) são **stub** → os cases de definir fase/campo ficam
bloqueados.

| case | tipo | passos | esperado | auto | result |
| --- | --- | --- | --- | --- | --- |
| F01-H1 | happy | `/` → "Novo pipe" → nome "Onboarding" → Criar | redireciona p/ `/pipes/:id`, kanban com fases padrão, toast de sucesso | e2e | not run |
| F01-E1 | edge: nome vazio | abrir modal, deixar em branco | botão "Criar" desabilitado; submit não cria | e2e | not run |
| F01-E2 | edge: só espaços | nome = "   " | botão continua desabilitado (`.trim()`) | e2e | not run |
| F01-E3 | edge: nome muito longo | 300+ chars | aceita ou erro claro; sem quebra de layout | manual | not run |
| F01-E4 | edge: acentos/emoji | nome "Pedidos 🚀 çãé" | salvo e exibido intacto | e2e | not run |
| F01-E5 | edge: duplo clique em Criar | clicar 2× rápido | **1** pipe criado, não 2 (botão entra em `loading`) | e2e | not run |
| F01-E6 | edge: refresh após criar | criar, F5 na home | pipe aparece na lista | e2e | not run |
| F01-E7 | edge: teclado | Tab até "Novo pipe", Enter, digitar, Enter | fluxo completo sem mouse | e2e(axe) | not run |
| F01-E8 | edge: mobile 390px | criar pipe na largura mobile | modal e lista usáveis, sem scroll horizontal | manual | not run |
| F01-N1 | neg: sem sessão | abrir `/` deslogado | vai ao `/login` (BUG-001 corrigido; `e2e/f00-auth.spec.ts`) | e2e | fix BUG-001 (a validar) |
| F01-B1 | bloqueado | adicionar/reordenar fase na UI | — | — | blocked (S11 stub) |
| F01-B2 | bloqueado | adicionar campo ao start form na UI | — | — | blocked (S11 stub) |
| F01-B3 | bloqueado | apagar fase com cards | — | — | blocked (S11 stub) |

## F02 — Criar um card e levá-lo até o fim

Construído por inteiro: start form → card na 1ª fase → detalhe → mover fase a
fase → fase final marca **Concluído**. Gate de obrigatórios bloqueia o avanço.

| case | tipo | passos | esperado | auto | result |
| --- | --- | --- | --- | --- | --- |
| F02-H1 | happy | kanban → "Novo card" → preencher obrigatórios → criar | card na fase inicial; modal fecha | e2e | not run |
| F02-H2 | happy | abrir card → avançar fase a fase até o fim | em cada avanço muda a `Tag` da fase; última marca "Concluído ✓"; histórico registra "movido" | e2e | not run |
| F02-H3 | happy | editar um campo no detalhe | valor persiste após reabrir; evento "Campo atualizado" no histórico | e2e | not run |
| F02-N1 | neg: obrigatório vazio no create | submeter start form sem "Item solicitado" | erro inline no campo + toast; card **não** criado | e2e | not run |
| F02-N2 | neg: obrigatório vazio no move | esvaziar obrigatório, tentar avançar | move bloqueado, toast "Preencha os campos obrigatórios: …" | e2e | not run |
| F02-E1 | edge: título vazio | criar sem título | backend grava "(sem título)"; card aparece | e2e | not run |
| F02-E2 | edge: valores longos/emoji | texto gigante + emoji num campo | salvo e relido igual | e2e | not run |
| F02-E3 | edge: duplo clique em avançar | clicar "avançar" 2× | avança **uma** fase só (botão `loading`/disabled) | e2e | not run |
| F02-E4 | edge: duas abas | mover o mesmo card em 2 abas | 2º move detecta conflito (version) — BUG-005 corrigido (`e2e/f04-fixes.spec.ts`) | e2e | fix BUG-005 (a validar) |
| F02-E5 | edge: refresh no meio | criar card, F5, reabrir | estado consistente (card na fase certa) | e2e | not run |
| F02-E6 | edge: voltar fase (←) | avançar, depois voltar | volta uma fase; `done` deixa de valer | e2e | not run |
| F02-E7 | edge: campo de fase não-inicial | card com campo definido numa fase do meio | detalhe mostra campos de todas as fases (agrupados) — BUG-003 corrigido (`e2e/f04-fixes.spec.ts`) | e2e | fix BUG-003 (a validar) |
| F02-E8 | edge: dados de outra org | logar como usuário de outra org, abrir pipe por id | 404/vazio (isolamento) — precisa 2ª org no seed | e2e | not run |
| F02-E9 | edge: sessão expirada | expirar `sessions.expires_at`, agir | 401 → `RequireAuth` manda ao login (BUG-001 corrigido) | manual | fix BUG-001 (a validar) |
| F02-E10 | edge: fuso horário | criar card, conferir data | exibida em pt-BR local; armazenada UTC (`DATETIME(3)` UTC) | manual | not run |
| F02-E11 | edge: mobile 390px | fluxo completo em 390px | colunas com scroll horizontal; modal usável | manual | not run |
| F02-E12 | edge: teclado + leitor de tela | criar e mover só com teclado | foco visível, `aria-label` nas colunas/campos; axe sem violações | e2e(axe) | not run |
| F02-E13 | edge: avatar do responsável | card com assignee real | avatar do responsável aparece — BUG-004 corrigido (`e2e/f05-assignees.spec.ts`) | e2e | fix BUG-004 (a validar) |

## F03 — Criar uma automação — **bloqueado (S12 stub)**
Cases planejados: evento→condição→ação; task medida mesmo com condição falsa;
ação apontando p/ fase/campo apagado. Sem UI e sem engine → não testável.

## F04 — Tabela de banco conectada a um pipe — **bloqueado (S13/S14 stub)**

## F05 — Relatório/dashboard — **bloqueado (S16/S18 stub)**

## F06 — Receber solicitação externa (form público) — **bloqueado (S08 stub)**

---

## Acessibilidade (roda junto nos specs e2e)

Cada spec: falha em erro de console, falha em resposta 5xx, e scan `@axe-core`
em cada tela (Login, OrgHome, PipeKanban, modais). Alvo: 0 violações sérias.

## Nota de execução (honesta)

Os cases marcados `not run` **não foram executados neste ambiente**: a máquina de
trabalho (Windows) não tem MySQL nem as credenciais do Google OAuth, e o front,
agora ligado ao backend real, não sobe sem a stack. Os specs em `e2e/` estão
prontos para rodar na VM (ou em qualquer máquina com MySQL + seed). Os cases
marcados `fail BUG-xxx` vêm de **revisão de código** (ver `bugs.md`), e precisam
de confirmação num ambiente rodando — estão listados lá como "a reproduzir".

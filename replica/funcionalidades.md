# Fluxos — Funcionalidades a construir (paridade com o Pipefy) e backlog

Data: 2026-10-28 · Substitui `features.csv` (46 itens, raso) como fonte da verdade do produto.

Fontes (só públicas, sem login — clean-room):
- `recon-ajuda.md` — central de ajuda (~320 artigos, 25 módulos). Referência citada como **[A §x.y]**.
- `recon-api.md` — API GraphQL (338 tipos, 53 enums, ~140 mutations). Citada como **[API §x]**.
- `recon-comunidade.md` — comunidade, lançamentos 2023–2026, dores e casos de uso BR. Citada como **[C §x]**.

Legenda de status no Fluxos: ✅ feito · 🟡 parcial · ⬜ falta · ➖ fora de escopo (decisão abaixo).
Coluna **M** = marco do backlog (seção 3) em que o item entra.

---

## 1. Princípios do Fluxos (onde ser melhor que o Pipefy)

Tirados das dores mais citadas na comunidade [C §2, §4]:

1. **Sem limites de plano**: automações, condicionais, papéis, relatórios e API sem cota mensal (a maior dor do Pipefy é o limite de "jobs" que conta até gatilho que não executa).
2. **Automação observável**: log por execução com motivo da falha, aviso ao dono quando uma regra falha e botão "testar regra" com um card de exemplo (ideia mais votada da comunidade).
3. **Condicional que também obriga** (não só mostra/oculta) e **regra para mover card** — pedidos antigos não atendidos.
4. **Campo fórmula de verdade** (pedido desde 2018; no Pipefy só existe como ação de automação).
5. **SLA em dias úteis com feriados nacionais** e SLA a partir de um campo de data.
6. **Dados prontos para BI**: relatórios que cruzam cards conectados e acesso de leitura para Power BI.
7. Excluir fase com cards **é bloqueado** (no Pipefy apaga tudo) e exclusões vão para uma **lixeira**.

---

## 2. Catálogo por módulo

### 2.1 Pipes [A §1]
| Funcionalidade | Detalhe | Status | M |
| --- | --- | --- | --- |
| Criar pipe do zero | nasce com 3 fases e formulário inicial | ✅ | — |
| Ícone e cor do pipe | aparecem na home, formulários, conexões | ⬜ | M2 |
| Nome do objeto | renomear "card" (ticket, pedido, candidato) | ⬜ | M2 |
| Título do card a partir de um campo | campo do formulário inicial vira o título (vale para cards novos) | ⬜ | M2 |
| Subtítulos do card | campos exibidos no card fechado (e no card conectado) | ⬜ | M2 |
| Texto do botão "criar card" | ex.: "Nova solicitação" | ⬜ | M2 |
| Editar/excluir pipe | excluir exige digitar confirmação | ⬜ | M2 |
| Visibilidade público/privado | privado = só admins e convidados | ⬜ | M10 |
| Só responsáveis editam cards / só admin exclui | políticas do pipe | ⬜ | M10 |
| Quem cria card pelo formulário | membros/convidados da empresa/externos | ⬜ | M7 |
| Visualização padrão do pipe | kanban/lista/calendário; cada usuário pode trocar | ⬜ | M9 |
| Clonar pipe | copia fases, campos, automações, condicionais, templates; não copia cards; regras de clonagem [A §1.4] | ⬜ | M10 |
| Versões da configuração | snapshot JSON numerado, baixar, restaurar a última | ⬜ | M10 |
| Aba Flow | fases + campos + automações ligadas a cada fase, setas de movimento | ⬜ | M11 |
| Mapa de processos | grafo de pipes/databases ligados (conexão, automação, campo) | ⬜ | M11 |
| Pastas para organizar pipes | pedido aberto na comunidade (~200 votos) | ⬜ | M10 |
| Favoritar pipe e busca na home | por usuário | ⬜ | M9 |

### 2.2 Fases [A §2]
| Funcionalidade | Detalhe | Status | M |
| --- | --- | --- | --- |
| Criar, renomear, cor, reordenar, excluir | excluir só vazia e não inicial (melhor que o Pipefy) | ✅ | M1 |
| Inserir fase entre duas | "+" entre colunas | 🟡 (adiciona no fim e reordena) | M2 |
| Descrição da fase | exibida no quadro | ⬜ | M2 |
| Fase final (várias permitidas) | card concluído, pode voltar | ✅ | M1 |
| Fase inicial | onde nasce o card / formulário inicial | ✅ | M1 |
| Permitir criar card nesta fase | além da inicial | ⬜ | M2 |
| **Mover para (transições permitidas)** | switch por fase destino; nova fase liga às vizinhas; editável também no card [A §2.3, API `phase_transitions`] | ⬜ | M2 |
| Movimento manual uma fase por vez | automações podem pular | 🟡 (botões anterior/próxima) | M2 |
| Obrigatórios travam a saída | | ✅ | — |
| Responsáveis da fase | atribuídos a todo card enquanto estiver na fase | ⬜ | M2 |
| SLA da fase (atraso) | tempo máximo na fase → "atrasado" + contador | ⬜ | M6 |
| Ordenação dos cards por fase | vencimento, criação, atualização, alfabética, manual | ⬜ | M9 |
| Coletar e-mail (autenticação) no formulário da fase | | ⬜ | M7 |
| Limite WIP por fase | não documentado no Pipefy; opcional | ⬜ | M9 |

### 2.3 Campos [A §4, API §2]
Tipos do Pipefy (23 + fórmula e conteúdo dinâmico):
| Tipo | Status | M |
| --- | --- | --- |
| Texto curto, texto longo, número, moeda, data, data e hora, e-mail, telefone, seleção (dropdown), radio | ✅ | M1 |
| Sim/Não (booleano) | ✅ (extra do Fluxos) | M1 |
| Checklist (múltipla escolha) | ⬜ | M2 |
| Hora | ⬜ | M2 |
| Data de vencimento (alimenta alertas) | ⬜ | M2 |
| Seleção de responsável (membros) | ⬜ | M2 |
| Etiqueta (labels do pipe) | ⬜ | M2 |
| Anexo (upload) | ⬜ | M2 |
| Documento CPF/CNPJ (máscara + validação de dígito) | ⬜ | M2 |
| ID (código do card) | ⬜ | M2 |
| Conteúdo dinâmico (texto rico com variáveis de fases anteriores) | ⬜ | M4 |
| Conexão de pipe / conexão de database | ⬜ | M4 |
| **Fórmula** (nativa, recalcula ao salvar) | ⬜ | M5 |

Opções de cada campo:
| Opção | Detalhe | Status | M |
| --- | --- | --- | --- |
| Obrigatório | | ✅ | — |
| Descrição e texto de ajuda | | ⬜ | M2 |
| Editável em outras fases | se desligado, só se edita na própria fase | ⬜ | M2 |
| Valor único | 8 tipos; rejeita duplicado no pipe/database | ⬜ | M2 |
| Validação por regex | texto curto e databases | ⬜ | M2 |
| Visualização mínima | campo numa linha | ⬜ | M2 |
| Tipo imutável após criar | Pipefy não permite trocar tipo (Fluxos hoje permite — decidir) | 🟡 | M2 |
| Arquivar / restaurar campo | some dos formulários, continua legível em relatórios/automações | ⬜ | M2 |
| Dependências do campo | onde é usado (automações, condicionais, templates) | ⬜ | M10 |
| Slug estável (`index_name`) | nome original para URL/API/templates | ⬜ | M2 |
| Valor inicial via URL | `?campo=valor` em formulário público | ⬜ | M7 |

### 2.4 Condicionais de campo [A §5, API §2.3]
| Funcionalidade | Detalhe | Status | M |
| --- | --- | --- | --- |
| Editor de condicionais por formulário | inicial, fase, público, database | ⬜ | M3 |
| Cenário com grupos E/OU | até 300 condições/ações | ⬜ | M3 |
| 19 operadores | equals, not_equals, present, blank, contains, not_contains, maior, menor, data hoje/ontem/semana/mês/ano atual e anterior, data é/antes/depois | ⬜ | M3 |
| Ações "se sim" / "se não" | mostrar/ocultar campos | ⬜ | M3 |
| **Tornar obrigatório condicionalmente** | melhoria sobre o Pipefy (lá é contorno "trava") | ⬜ | M3 |
| Oculto não exige preenchimento | servidor valida respeitando condicionais | ⬜ | M3 |
| Fonte em campo de registro conectado | ex.: "vaga aberta?" do database | ⬜ | M4 |
| Padrões cascata e trava | resultado natural do editor | ⬜ | M3 |

### 2.5 Cards [A §3]
| Funcionalidade | Detalhe | Status | M |
| --- | --- | --- | --- |
| Criar pelo formulário inicial | | ✅ | — |
| ID sequencial (#1042) e busca por ID/título | | ✅ | M1 |
| Arrastar e soltar no kanban | respeita transições e obrigatórios | ⬜ | M2 |
| Card aberto em duas colunas | dados anteriores à esquerda; fase atual, atividades e "mover para" à direita | 🟡 | M2 |
| Editar dados de fases anteriores | só campos "editáveis em outras fases" | 🟡 (edita tudo) | M2 |
| Título editável | | ⬜ | M2 |
| Responsáveis (atribuir/remover) | | 🟡 (só exibe) | M2 |
| Etiquetas: cadastro por pipe + no card | | ⬜ | M2 |
| Data de vencimento | cores cinza/amarelo/vermelho | ⬜ | M2/M6 |
| Comentários com @menção | menção notifica | ⬜ | M2 |
| Anexos | | ⬜ | M2 |
| Checklist do card | | ⬜ | M2 |
| Liga/desliga recursos do card por pipe | responsáveis, vencimento, etiquetas, anexos, comentários, checklist | ⬜ | M2 |
| Excluir card (com lixeira) | lixeira é novidade 2025–26 | ⬜ | M2 |
| Duplicar card | existe na API (`cardDuplicate`) | ⬜ | M2 |
| Cards pai/filho | via conexão; atalhos nos dois lados | ⬜ | M4 |
| Desconectar card/registro | | ⬜ | M4 |
| Histórico do card | | 🟡 (criado/movido/campo) | M2 |
| Linha do tempo com métricas | duração, fases visitadas, % automatizado, trocas de responsável, gargalo | ⬜ | M9 |
| Timers (desde criação, na fase, última atualização) | | ⬜ | M6 |
| Gerar PDF do card | | ⬜ | M11 |

### 2.6 Formulários e portal [A §6, §7, §8]
| Funcionalidade | Detalhe | Status | M |
| --- | --- | --- | --- |
| Formulário inicial interno | | ✅ | — |
| Opções do formulário | título, texto do botão, campo-título | ⬜ | M2 |
| Formulário público (link, sem login) | rota pública; captcha | ⬜ | M7 |
| Embutir em site (iframe) | | ⬜ | M7 |
| Personalização | logo, título, descrição, cor, fundo, texto do botão, múltiplos envios, autopreencher envios anteriores | ⬜ | M7 |
| Níveis de compartilhamento | público com link / pessoas selecionadas / organização | ⬜ | M7 |
| Formulário de fase por link (por card) | atualiza o card, não cria | ⬜ | M7 |
| Tarefa (formulário de fase por e-mail, até 30 pessoas) | página "Tarefas e Solicitações" | ⬜ | M7 |
| Autenticação por e-mail (link de 30 min) | | ⬜ | M7 |
| Formulário inicial de outro pipe dentro de uma fase | cria card filho | ⬜ | M4 |
| Portal: páginas, texto, link, imagem, vídeo, formulários | até 50 subportais com permissão própria | ⬜ | M7 |
| Valores padrão fixos/dinâmicos no portal | ex.: nome/e-mail do usuário logado | ⬜ | M7 |
| Rastreador de solicitações ("meus pedidos") | status, histórico, mensagens solicitante↔equipe | ⬜ | M7 |
| Convidados da empresa e externos | só veem formulários liberados | ⬜ | M7 |

### 2.7 Conexões e databases [A §9, §10, API]
| Funcionalidade | Detalhe | Status | M |
| --- | --- | --- | --- |
| Databases: criar, colunas (campos), registros CRUD | mesmos tipos de campo | ⬜ | M4 |
| Formulário do database (interno e público) + condicionais | | ⬜ | M4 |
| Etiquetas e status do registro (ativo/concluído) | | ⬜ | M4 |
| Layout de resumo do registro | o que aparece na conexão | ⬜ | M4 |
| Exportar database (xlsx) | | ⬜ | M4 |
| Importar planilha para database/pipe | | ⬜ | M10 |
| Conexão pipe↔pipe e pipe↔database | nome, alvo, função buscar/criar/ambos, único/múltiplo | ⬜ | M4 |
| Campo de conexão em fase/formulário | obrigatório, filtro ativos/concluídos | ⬜ | M4 |
| **Autopreenchimento (field map)** | copiar do registro/pai, valor fixo — "puxar dados do BD" | ⬜ | M4 |
| Regras pai/filho | filho deve existir para concluir o pai; todos os filhos concluídos para mover/concluir o pai | ⬜ | M4 |
| Exibição de dados do conectado no card | subtítulos do conectado | ⬜ | M4 |
| Aviso: conectar dá acesso aos dados | | ⬜ | M4 |

### 2.8 Automações [A §11, API §2.4]
| Funcionalidade | Detalhe | Status | M |
| --- | --- | --- | --- |
| Motor evento → condições → ação | fila no MySQL + worker; sem limite de uso | ⬜ | M5 |
| Eventos (10) | card criado; entrou em fase; saiu de fase; campo atualizado; todos os conectados em fase; recorrente (30 min/hora/dia/semana/mês, cron); alerta (vencido/atrasado/expirado); e-mail recebido; resposta HTTP; disparo manual | ⬜ | M5 (e-mail: M8) |
| Condições em grupos E/OU | mesmos 19 operadores | ⬜ | M5 |
| Cenários do recorrente | filtro de cards com lista ao vivo; lote de 300 | ⬜ | M5 |
| Ação mover card / mover vários | | ⬜ | M5 |
| Ação atualizar campo (card ou conectado) | valor fixo, dinâmico (outro campo, atributo), datas relativas | ⬜ | M5 |
| Ação criar card/registro e criar conectado | com mapeamento de campos | ⬜ | M5 |
| Ação mover card pai | | ⬜ | M5 |
| Ação distribuir responsáveis | rodízio ou aleatório | ⬜ | M5 |
| Ação fórmula | `+ - * / % ^`, SUM, AVERAGE, MIN, MAX, ROUND, IF_NULL, datas | ⬜ | M5 |
| Ação enviar template de e-mail / enviar tarefa | | ⬜ | M8 / M7 |
| Ação requisição HTTP | método, headers, corpo, autenticação, schema da resposta | ⬜ | M5 |
| Ação aplicar regras de SLA | expediente, feriados, fuso → calcula vencimento | ⬜ | M6 |
| Ação gerar com IA | | ⬜ | M11 |
| Gestão | lista com filtros (status/evento/ação), busca, ordenação, ativar/desativar, duplicar (nasce desativada) | ⬜ | M5 |
| **Logs por execução + alerta de falha + testar regra** | melhoria sobre o Pipefy | ⬜ | M5 |
| Automações entre pipes | evento num pipe, ação em outro | ⬜ | M5 |

### 2.9 SLA, alertas e notificações [A §12]
| Funcionalidade | Detalhe | Status | M |
| --- | --- | --- | --- |
| Vencido (data de vencimento) | cinza → amarelo → vermelho | ⬜ | M6 |
| Atrasado (SLA da fase) | relógio + contador no cabeçalho da fase | ⬜ | M6 |
| Expirado (SLA do pipe) | até chegar à fase final | ⬜ | M6 |
| Somente dias úteis + feriados BR + expediente | | ⬜ | M6 |
| SLA a partir de campo de data | pedido da comunidade | ⬜ | M6 |
| Histórico de tempo por fase | entradas/saídas, duração, ficou atrasado | ⬜ | M6 |
| "Meu trabalho" | meus cards: perto do vencimento, vencidos, atrasados, expirados, concluídos | ⬜ | M6 |
| Notificações in-app (sino) | menções, atribuição, falha de automação, e-mail recebido | ⬜ | M6 |
| Notificações por e-mail configuráveis | | ⬜ | M8 |

### 2.10 E-mail [A §13]
| Funcionalidade | Detalhe | Status | M |
| --- | --- | --- | --- |
| Templates de e-mail | variáveis de campos (até 100), padrão do pipe, idioma/fuso | ⬜ | M8 |
| Enviar e-mail do card (manual) | até 10 destinatários | ⬜ | M8 |
| SMTP próprio (remetente @vena.app.br) | | ⬜ | M8 |
| Endereço por pipe e por card + caixa de entrada | e-mail recebido cria/atualiza card, anexos viram campos | ⬜ | M8 |
| Respostas prontas e assinatura | | ⬜ | M8 |
| Anexo real no e-mail enviado | pedido da comunidade | ⬜ | M8 |

### 2.11 Visualizações, relatórios e dashboards [A §14–16]
| Funcionalidade | Detalhe | Status | M |
| --- | --- | --- | --- |
| Kanban | | ✅ | — |
| Lista (tabela, colunas escolhidas) | | ⬜ | M9 |
| Ações em massa na lista | editar, mover, excluir (com confirmação) | ⬜ | M9 |
| Calendário (por vencimento) | | ⬜ | M9 |
| Filtros E/OU (fase, responsável, etiqueta, campos) | | 🟡 (busca simples) | M9 |
| Filtros salvos | | ⬜ | M9 |
| Relatório de pipe | colunas, filtros (período/relativo/absoluto), fórmulas soma/média/mín/máx, salvar, exportar xlsx | ⬜ | M9 |
| Relatório da empresa (vários pipes) | | ⬜ | M9 |
| Relatório com campos de cards conectados | pedido da comunidade | ⬜ | M9 |
| Dashboards | medida × dimensão × período, gráficos (barra, linha, pizza, número, tabela), drill-down | ⬜ | M9 |
| Acesso para Power BI | usuário MySQL somente leitura / views | ⬜ | M9 |

### 2.12 Permissões, auditoria e organização [A §17–20]
| Funcionalidade | Detalhe | Status | M |
| --- | --- | --- | --- |
| Login Google + allowlist de domínio | | ✅ | — |
| Papéis da organização (admin/membro) | primeiro usuário vira admin | 🟡 | M10 |
| Papéis do pipe | admin, membro, visão restrita (só os meus), somente leitura | ⬜ | M10 |
| Papéis do database | admin, membro, somente leitura | ⬜ | M10 |
| Grupos de usuários | vale o maior acesso | ⬜ | M10 |
| Campo sensível por papel | pedido da comunidade | ⬜ | M10 |
| Gestão de membros (convidar, remover, trocar papel) | | ⬜ | M10 |
| Atividades do pipe (cards e configuração) | quem/o quê/quando, exportar CSV | ⬜ | M10 |
| Lixeira (cards, campos, fases) | | ⬜ | M2/M10 |
| Webhooks de saída | eventos de card/registro | ⬜ | M10 |
| API com token | | ⬜ | M10 |
| Importar cards/registros de planilha | | ⬜ | M10 |

### 2.13 Extras [A §22–24, C §3]
| Funcionalidade | Detalhe | Status | M |
| --- | --- | --- | --- |
| IA: ler documento (NF-e, boleto) e preencher campos | com validação humana | ⬜ | M11 |
| IA: "gerar com IA" como ação | usando Claude | ⬜ | M11 |
| Gerador de PDF | | ⬜ | M11 |
| Assinatura eletrônica | | ⬜ | M11 |
| Interfaces (telas montadas sobre dados) | | ⬜ | M11 |
| Atalhos de teclado | | ⬜ | M11 |

### 2.14 Fora de escopo (decisão)
- ➖ Planos, cobrança, contagem de jobs/créditos, painel de consumo — uso interno, sem cobrança.
- ➖ White label, SSO corporativo/SAML, MFA próprio — o login Google já cobre.
- ➖ Galeria de modelos do Pipefy, marketplace e hub de integrações (iPaaS) — conteúdo deles; usamos webhooks/HTTP.
- ➖ App móvel nativo — o web será responsivo.
- ➖ Multi-organização — uma organização (Vena).

---

## 3. Backlog priorizado (marcos)

Ordem pensada para destravar valor cedo e porque cada marco depende do anterior. O que você pediu na conversa está marcado com ★.

| Marco | Conteúdo | Por que nessa ordem |
| --- | --- | --- |
| **M1 ✅** | Editor de fases e campos por fase; #ID; busca | já entregue |
| **M2 — Card completo** | ★ transições permitidas ("mover para"), arrastar no kanban, uma fase por vez; opções de campo (descrição, ajuda, editável em outras fases, único, regex); tipos que faltam (checklist, hora, vencimento, responsável, etiqueta, anexo, CPF/CNPJ, ID); responsáveis, etiquetas, comentários com menção, anexos e checklist no card; título/subtítulos do card; config do pipe (ícone, cor, nome do objeto, botão); responsáveis da fase; criar card em outra fase; arquivar campo; excluir/duplicar card com lixeira | é o uso diário; todo o resto (condicionais, automações, relatórios) lê esses dados |
| **M3 — Condicionais** | ★ editor com grupos E/OU, 19 operadores, mostrar/ocultar e **obrigar**; servidor valida respeitando ocultos | depende dos tipos de campo do M2 |
| **M4 — Databases e conexões** | ★ databases (tabelas, registros, formulário, status); campo de conexão pipe/database; ★ autopreenchimento a partir do registro; pai/filho e suas regras; conteúdo dinâmico | "dados vindos do BD" depende de databases + conexão |
| **M5 — Automações** | ★ motor e catálogo completo (mover automático, criar card em outro pipe, atualizar campo, mover pai, rodízio, fórmula, HTTP); recorrentes; logs, alerta de falha, testar regra; campo fórmula | precisa de conexões (M4) para as ações entre pipes |
| **M6 — SLA e trabalho do dia** | vencido/atrasado/expirado, dias úteis + feriados, histórico de tempo por fase, timers, "Meu trabalho", notificações in-app | eventos de alerta alimentam automações |
| **M7 — Formulários externos e portal** | formulário público e de fase, tarefas, portal com páginas, rastreador "meus pedidos", convidados | precisa de condicionais (M3) e permissões básicas |
| **M8 — E-mail** | templates, SMTP próprio, envio manual e por automação, caixa de entrada do pipe/card | exige definir provedor de e-mail (decisão abaixo) |
| **M9 — Visões e relatórios** | lista, ações em massa, calendário, filtros salvos, relatório de pipe e da empresa, dashboards, linha do tempo com métricas, acesso BI | lê tudo dos marcos anteriores |
| **M10 — Governança** | papéis por pipe/database, grupos, campo sensível, gestão de membros, auditoria, clonar pipe, versões, pastas, importação, webhooks, API | importante quando mais áreas entrarem |
| **M11 — Extras** | IA (NF-e/boleto), PDF, assinatura, Flow e Mapa, interfaces | diferenciais depois do essencial |

Critério de "pronto" de cada marco: build sem erros, migração aplicada na VM pelo deploy automático, teste manual dos fluxos do marco em produção, e e2e atualizado para o fluxo principal.

---

## 4. Decisões pendentes (para o usuário)

1. **Ordem dos marcos**: confirmar M2 (card completo) antes de M3 (condicionais) — antes a proposta era condicionais primeiro.
2. **Anexos**: guardar no disco da VM (simples; entra no backup) ou no Google Drive da Vena.
3. **E-mail (M8)**: envio por SMTP de qual conta (Google Workspace?) e se vamos receber e-mails nos cards (exige uma caixa de entrada lida pelo servidor).
4. **Trocar o tipo do campo**: bloquear como o Pipefy (seguro) ou permitir com conversão (flexível).
5. **Quem configura pipes**: só admins ou todos os membros (o Pipefy é ambíguo).

# Recon comunidade: como o Pipefy é usado na prática

Escopo: uso real, dores, pedidos de funcionalidade e novidades de produto do Pipefy.
Fontes: só públicas, sem login (community.pipefy.com, central de ajuda pública,
blog/press da Pipefy, sites de review e Reclame Aqui). Todo o texto abaixo é
paráfrase. Objetivo: alimentar o backlog do "Fluxos" (ferramenta interna).
Data: 2026-10-28. Complementa `recon.md` e `features.csv`, sem repetir o que já está lá.

Legenda de relevância (para uma ferramenta interna de uma empresa brasileira):
**alta** = entra no MVP ou logo depois; **média** = segunda onda; **baixa** = só se sobrar tempo ou não vale a pena.

Observações de método:
- A listagem de ideias da comunidade não tem ordenação pública por votos confiável. As contagens abaixo são as exibidas na página no dia da coleta.
- Capterra e G2 bloquearam acesso direto (403). As queixas de review vêm de trechos indexados (Capterra, GetApp, PeerSpot, Analister) e podem ser antigas (2017-2023).

---

## 1. Funcionalidades mais usadas e como são combinadas

### 1.1 Aprovação como fase + ação de mover
- **Descrição:** o padrão mais comum de aprovação é uma fase "Aguardando aprovação" com um campo de decisão (aprovado/reprovado) e automação que move o card conforme a resposta. Aprovação em vários níveis é feita encadeando fases, ou criando um pipe de aprovação separado por aprovador, ligado ao pipe principal por conexão, com a automação "mover card pai". O próprio blog da Pipefy ensina esse encadeamento. Não existe uma "matriz de alçada" nativa (aprovador por valor/centro de custo). O usuário monta isso com condicionais.
- **Evidência:** https://www.pipefy.com/blog/save-time-automated-approval-flows/ ; https://community.pipefy.com/ask-the-community-43/best-practices-for-automating-multi-step-approval-processes-in-pipefy-4074 ; https://help.pipefy.com/en/articles/6291556-pipefy-for-purchasing-how-to-create-automated-and-centralized-approval-flows
- **Relevância:** **alta**. Aprovação com alçada é o coração de compras, financeiro e RH. O Fluxos pode fazer melhor com um bloco nativo de "aprovação" (aprovadores por regra, N de M, delegação, aprovar por e-mail ou link).

### 1.2 Tasks (pedido de ação a quem está fora do pipe)
- **Descrição:** desde 2023, uma automação ou um usuário pode mandar uma "task" a alguém que não é membro do pipe (aprovar, enviar documento, responder). A pessoa responde por link, sem licença. É muito usado para aprovação de gestor.
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features (Aug/2023 Tasks; Q4/2024 task por automação)
- **Relevância:** **alta**. Evita licença para aprovador eventual. Numa ferramenta interna isso vira "aprovar por link autenticado".

### 1.3 Conexões pai/filho entre pipes
- **Descrição:** um card do pipe A cria cards filhos no pipe B (ex.: compra → pagamento; admissão → TI/acessos). As automações típicas são "criar card conectado", "mover card pai" e "quando todos os filhos chegarem à fase X, mover o pai". O "mover pai" falha em silêncio se o pai tiver campo obrigatório vazio. Houve relato de o pai ser movido duas vezes. Em 2026 surgiu o "Mapa" / "Flow View", que desenha as conexões entre pipes.
- **Evidência:** https://help.pipefy.com/en/articles/8186232-how-to-create-an-automation-for-when-all-connected-cards-are-moved-from-one-phase-to-another ; https://community.pipefy.com/tips-and-inspiration-45/automation-to-move-parent-card-2948 ; https://community.pipefy.com/questions/1801 ; https://community.pipefy.com/product-updates/map-faster-to-open-and-visibility-into-connection-volume-5591
- **Relevância:** **alta**. Processos reais são encadeados. O clone deve mostrar por que uma automação não moveu o card (validação explícita).

### 1.4 Database como cadastro mestre
- **Descrição:** databases fazem papel de tabela de cadastro (fornecedores, clientes, centros de custo, colaboradores, contratos). O card escolhe um registro por um campo de conexão ("buscar registros"; um ou vários). Automações criam ou atualizam registros a partir do card. Limitações: a conexão não copia automaticamente os atributos do registro para campos do card, e "criar card conectado" não pode ter database como alvo.
- **Evidência:** https://help.pipefy.com/en/articles/865712-connection-field ; https://help.pipefy.com/en/articles/1302583-how-to-create-edit-database-records ; https://community.pipefy.com/ideas/automation-create-database-entry-1093 ; https://community.pipefy.com/tips-inspiration-45/how-to-manage-files-in-pipefy-using-databases-573
- **Relevância:** **alta**. O Fluxos pode oferecer "lookup" (puxar campos do registro conectado) e cadastros com validação de CNPJ/CPF.

### 1.5 SLA por fase (alertas de atraso/vencimento) + automação de escalonamento
- **Descrição:** cada fase tem SLA ("late") e o card tem vencimento ("expired"). Desde 2024 há regras avançadas: feriados, horário útil e fuso. O uso típico combina o alerta com uma automação (notificar, mover para "Escalonado") ou com uma automação recorrente de hora em hora que varre datas. Para disparar de novo um alerta, os usuários recorrem a gambiarras, como empurrar a data de vencimento em +7 dias ou mover o card de fase e voltar.
- **Evidência:** https://help.pipefy.com/en/articles/625596-pipe-alerts ; https://help.pipefy.com/en/articles/8067742-how-to-create-alert-based-automations ; https://community.pipefy.com/automations-150/how-to-set-up-automatic-scaling-move-stalled-cards-to-another-stage-5390 ; https://community.pipefy.com/ask-the-community-43/how-can-you-send-additional-automated-emails-from-a-card-in-a-phase-that-has-breached-sla-1343
- **Relevância:** **alta**. Para uma empresa brasileira, SLA em dias úteis com calendário de feriados nacionais e municipais é requisito.

### 1.6 Automações encadeadas (evento → condição → ação), recorrentes e HTTP
- **Descrição:** os usuários encadeiam várias regras simples (card entra na fase → preenche campo → outra regra reage ao campo). Atividades recorrentes rodam a cada 30 minutos ou mais. A ação "HTTP request" (dez/2023) virou a ponte para ERP e outros sistemas. Fórmulas automáticas (nov/2023) fazem cálculos dentro de automações. Para o que falta, o recurso comum é Make/Zapier/n8n ou a API GraphQL.
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features ; https://community.pipefy.com/questions/763 ; https://community.pipefy.com/news-and-announcements-49/celebrating-your-ideas-brought-to-life-3328
- **Relevância:** **alta**. O motor de automação é o diferencial. Sem limite por plano, o clone já ganha (ver 4.1).

### 1.7 Formulários públicos + Portal como "central de solicitações"
- **Descrição:** formulários públicos ou de convidado abrem cards sem login. O Portal (renovado no Q2/2024) junta vários formulários, links e arquivos numa página com a marca da empresa (white label), com permissão por página e por formulário (usuário ou grupo). O solicitante acompanha os seus pedidos numa área unificada de "tasks e requests". Formulários têm condicionais de exibição e, desde 2024, filtros encadeados (estado → cidade).
- **Evidência:** https://help.pipefy.com/en/articles/4173939-how-to-share-public-forms ; https://help.pipefy.com/en/articles/8513933-new-features ; https://community.pipefy.com/product-updates-193/duplicate-conditionals-in-forms-5678
- **Relevância:** **alta**. É a porta de entrada de toda área de serviço (compras, RH, TI, jurídico).

### 1.8 E-mail: templates, envio manual/automático e caixa de entrada do card
- **Descrição:** cada card tem um endereço de e-mail. As respostas caem no histórico do card. Templates com variáveis do card são disparados por automação ou à mão (ex.: pedir cotação a vários fornecedores e receber a resposta no card). É possível configurar SMTP próprio, e em 2026 vieram erros de SMTP mais visíveis. Dor recorrente: anexo do card vai como link, não como anexo real (ver 2.5).
- **Evidência:** https://help.pipefy.com/en/articles/4378163-what-are-email-templates ; https://help.pipefy.com/en/articles/6291628-pipefy-for-purchase-automate-and-centralize-communication-with-requesters-using-email-templates ; https://community.pipefy.com/product-updates-193/improved-error-handling-for-custom-smtp-and-email-5679
- **Relevância:** **alta**. Fornecedor, candidato e cliente externos vivem no e-mail.

### 1.9 Distribuição automática (round robin) e responsáveis
- **Descrição:** atribuição de responsável em rodízio, ou aleatória, entre membros (ago/2023). Muito usada em atendimento e em filas de análise.
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features
- **Relevância:** **média**. Simples de fazer e muito útil em filas.

### 1.10 Relatórios de pipe + exportação para BI externo
- **Descrição:** o uso real é montar o relatório do pipe (colunas e filtros), exportar para Excel e levar ao Power BI. Os dashboards nativos são por pipe. O relatório "de empresa" cruza pipes, mas só o vê quem é membro de todos os pipes envolvidos. Em 2026 passou a ser possível duplicar relatórios. Conectores de terceiros (ex.: Kondado) replicam dados para planilhas e BI.
- **Evidência:** https://help.pipefy.com/en/articles/619297-create-pipe-reports ; https://help.pipefy.com/tutorials/how-to-create-company-reports ; https://community.pipefy.com/ideas/81 ; https://kondado.io/en/pre-built-reports/pipefy.html ; https://community.pipefy.com/tips-inspiration-45/pipefy-updates-august-2026-5512
- **Relevância:** **alta**. Uma ferramenta interna pode expor o banco ou uma view SQL direto ao BI e eliminar a exportação manual.

### 1.11 Interfaces (páginas customizadas que juntam pipes e databases)
- **Descrição:** desde set/2023, a "Interface" é uma página sem código com elementos de dados (listas, gráficos, botões) de vários pipes e databases. Vira o "painel do gestor" ou "minha área". Em 2026 ganhou busca e permissão de exportação por elemento. Há limite de registros por elemento de dados (há uma ideia reclamando disso).
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features ; https://community.pipefy.com/product-updates-193/search-in-interfaces-5677 ; https://community.pipefy.com/ideas
- **Relevância:** **média**. Na prática, cobre o que o dashboard por pipe não cobre.

### 1.12 Assinatura digital (Pipesign) e geração de documentos
- **Descrição:** desde o Q3/2024 dá para coletar assinatura eletrônica dentro do processo, o que é útil em contratos e admissão. Gerar PDF a partir do card e anexá-lo ao e-mail é pedido antigo (ver 2.5).
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features ; https://community.pipefy.com/ideas/automatically-generate-pdf-and-attach-to-email-template-354
- **Relevância:** **média**. No Brasil, integrar com D4Sign, Clicksign ou DocuSign costuma bastar.

---

## 2. Pedidos de funcionalidade recorrentes, limitações e contornos

### 2.1 Pastas / "Solutions" para organizar pipes e databases
- **Descrição:** é uma das ideias mais votadas na listagem (cerca de 200 votos, status "New"). Organizações com dezenas de pipes não conseguem agrupá-los por área. O contorno é usar convenção de nomes e esconder pipes.
- **Evidência:** https://community.pipefy.com/ideas ; https://community.pipefy.com/tips-inspiration-45/product-hacks-hide-pipes-204
- **Relevância:** **alta** (barata). O Fluxos já pode nascer com "Áreas/Pastas" (Compras, Financeiro, RH...).

### 2.2 Notificação de falha de automação
- **Descrição:** é a ideia mais votada da listagem (cerca de 250 + 170 votos em duas versões, PT e EN). Já foi lançada: alertas de execução por webhook e logs. Antes disso, a automação falhava em silêncio (campo obrigatório vazio, fase inválida).
- **Evidência:** https://community.pipefy.com/ideas ; https://community.pipefy.com/tips-inspiration-45/pipefy-updates-june-2026-5354
- **Relevância:** **alta**. O clone deve ter log de execução por card e alerta ao dono da regra desde o dia 1.

### 2.3 Campo fórmula / campo calculado
- **Descrição:** pedido desde 2018 (cerca de 90 votos, 37 respostas). A Pipefy entregou "fórmulas automáticas" como ação de automação (nov/2023), não como campo calculado ao vivo. Usuários também pedem manipulação de texto (concatenar nome no título). O contorno é calcular em automação ou fora (API).
- **Evidência:** https://community.pipefy.com/ideas/46 ; https://help.pipefy.com/en/articles/8513933-new-features
- **Relevância:** **alta**. Valor total = qtd × preço, impostos, datas relativas (vencimento = emissão + 30 dias úteis).

### 2.4 SLA baseado em campo de data personalizado
- **Descrição:** ideia nova (PT e EN). Hoje o SLA é só por fase ou pelo vencimento do card. Quem precisa alertar "90 dias antes do fim do contrato" cria um campo auxiliar preenchido por automação com data relativa e usa automação recorrente.
- **Evidência:** https://community.pipefy.com/ideas ; https://community.pipefy.com/ideas/custom-sla-alert-393
- **Relevância:** **alta**. Contratos, documentos vencendo, férias e renovação.

### 2.5 Anexo real em e-mail e PDF gerado do card
- **Descrição:** o anexo do card vai no template como link. Pede-se anexo de verdade, zip de vários arquivos e PDF do formulário anexado automaticamente. Os contornos são usar a API (sendInboxEmail) ou mandar via Make + Gmail/Outlook.
- **Evidência:** https://community.pipefy.com/ideas/add-an-attachment-from-card-field-to-email-template-1215 ; https://community.pipefy.com/ask-the-community-43/attach-docs-to-email-3662 ; https://community.pipefy.com/ask-the-community-43/how-to-include-a-pdf-with-form-information-in-automated-emails-in-pipefy-4012
- **Relevância:** **alta** (fácil num sistema próprio).

### 2.6 Visibilidade/edição de campo por papel ou grupo
- **Descrição:** não é possível esconder campo conforme o papel do usuário. A equipe da Pipefy sugere como contorno um campo "Perfil" que dirige condicionais. Também se pede permissão granular de administração, por exemplo editar fases sem mexer em automações e integrações.
- **Evidência:** https://community.pipefy.com/ideas/create-a-way-to-differents-type-of-users-use-the-same-pipe-with-differents-options-on-the-form-456 ; https://community.pipefy.com/ideas/custom-user-permissions-configuration-5186
- **Relevância:** **alta**. Salário no RH, dados bancários no financeiro e parecer no jurídico pedem campo sensível com permissão.

### 2.7 Relatórios com campos de cards/registros conectados
- **Descrição:** no relatório do pipe, de um card ou registro conectado só se traz o título. Não dá para trazer, por exemplo, o CNPJ do fornecedor. Os contornos são duplicar o dado no card via automação ou exportar e cruzar no Power BI.
- **Evidência:** https://community.pipefy.com/ideas/incluir-dados-de-campos-conectados-em-relatorios-do-pipe-3806 ; https://community.pipefy.com/ideas/614
- **Relevância:** **alta**. É um JOIN, trivial no banco do clone.

### 2.8 Dashboards entre pipes e filtros cruzados
- **Descrição:** os dashboards ficam isolados por pipe (ideia "Universal Dashboards"). Há outra ideia pedindo filtro interativo cruzado entre gráficos. Review diz que os dashboards são lentos e pouco amigáveis.
- **Evidência:** https://community.pipefy.com/ideas/81 ; https://community.pipefy.com/ideas ; https://origin.peerspot.com/products/pipefy-pros-and-cons
- **Relevância:** **média**. Num MVP, um BI externo resolve. Um painel de visão geral por área é desejável.

### 2.9 Condicional para mover card (bloquear movimento por regra)
- **Descrição:** ideia nova. Hoje só o campo obrigatório bloqueia a mudança de fase. Pede-se regra do tipo "só move para Pagamento se Aprovado = Sim e valor ≤ alçada". Em 2026 chegou o "teste de automação de mover card", que simula a movimentação.
- **Evidência:** https://community.pipefy.com/ideas ; https://community.pipefy.com/tips-inspiration-45/pipefy-updates-july-2026-5469
- **Relevância:** **alta**. Validação de transição é barata e evita erro.

### 2.10 Arquivar pipes e databases
- **Descrição:** pede-se arquivar processos antigos mantendo a consulta histórica, sem deletar e sem ocupar a tela.
- **Evidência:** https://community.pipefy.com/ideas
- **Relevância:** **média**.

### 2.11 Mover ou copiar card para outro pipe
- **Descrição:** não existe mover card entre pipes. A equipe da Pipefy indica criar um card novo no outro pipe por automação. Review pede "copiar o card inteiro para outro pipe".
- **Evidência:** https://community.pipefy.com/ask-the-community-43/need-help-with-setting-up-automation-between-pipes-4086 ; https://community.pipefy.com/ask-the-community-43/how-to-move-a-card-to-a-new-pipe-1711
- **Relevância:** **média**.

### 2.12 Limite de registros em Interfaces / base de conhecimento da IA
- **Descrição:** o elemento de dados da Interface tem teto de registros, e isso limita o assistente de IA que usa a Interface como base.
- **Evidência:** https://community.pipefy.com/ideas
- **Relevância:** **baixa** para o clone (não herdamos esse limite).

### 2.13 Esconder fase final, ajustes de UX e edição em massa
- **Descrição:** há pedidos menores e frequentes: esconder a fase de concluídos do kanban, editar fuso horário de usuários em massa e ações em massa sobre cards. Estas últimas foram entregues no Q4/2024.
- **Evidência:** https://community.pipefy.com/ideas/hide-end-of-the-process-phase-320 ; https://help.pipefy.com/en/articles/8513933-new-features
- **Relevância:** **média**. Ações em massa: **alta**.

### 2.14 Lixeira / restaurar card excluído
- **Descrição:** só chegou em jul/2026 (restauração em até 15 dias). Antes, card excluído era perdido.
- **Evidência:** https://community.pipefy.com/tips-inspiration-45/pipefy-updates-july-2026-5469
- **Relevância:** **alta** (soft delete é barato).

---

## 3. Lançamentos recentes (2023 → out/2026)

### 3.1 Pipefy AI: Builder, Automação por prompt, Co-pilot (2023-2024)
- **Descrição:** o AI Builder cria um pipe a partir de uma descrição do processo (out/2023). A "AI Automation" é uma ação de automação com prompt (ex.: interpretar nota fiscal, ranquear candidatos), lançada no Q2/2024 e anunciada em ago/2024. Também há "AI Analytics" para perguntas sobre o processo.
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features ; https://www.globenewswire.com/news-release/2024/08/13/2929329/0/en/Pipefy-Announces-New-Generative-AI-Features-for-its-Business-Process-Automation-BPA-Solution.html
- **Relevância:** **média**. Uma ação "LLM: preencher campos a partir de texto ou anexo" cobre a maior parte do valor.

### 3.2 Agentes de IA 1.0 → 2.0 (2025)
- **Descrição:** agentes com "comportamentos" escritos em linguagem natural (até 5 por agente, até 3 ações por comportamento) que preenchem campos, criam e movem cards. Decidem com base em databases, PDFs, políticas e histórico, e registram o raciocínio no log. A versão 2.0 saiu em out/2025 (beta). A empresa reportou mais de 4.700 agentes em uso (ago/2025) e crescimento de 500% no uso de IA.
- **Evidência:** https://community.pipefy.com/product-updates/agents-2-0-agents-that-truly-work-with-you-4813 ; https://www.pipefy.com/blog/pipefy-updates-process-automation-ai/ ; https://www.pipefy.com/press-release/pipefy-announces-the-milestone-of-over-4700-ai-agents-in-use-by-its-clients/
- **Relevância:** **média**. Útil em triagem e classificação. No clone, implementar como ação de automação com LLM e log auditável.

### 3.3 Leitura inteligente de documentos (AI Doc Reader / IDP) (2025)
- **Descrição:** OCR + IA para extrair dados de notas, recibos, contratos e documentos escaneados direto para campos do card.
- **Evidência:** https://www.pipefy.com/blog/pipefy-updates-process-automation-ai/ ; https://www.pipefy.com/press-release/pipefy-launches-ai-agents-2-0-and-intelligent-document-processing-for-its-business-orchestration-and-automation-platform/
- **Relevância:** **alta** para contas a pagar (NF-e, boleto). No Brasil, ler o XML da NF-e e a linha digitável do boleto resolve boa parte sem IA.

### 3.4 Assistentes de IA (chat) em Portal, Interface, Slack e Teams (2025)
- **Descrição:** assistente que abre solicitações, consulta status e aprova ações. É gerado automaticamente a partir de Portais e Interfaces (beta), com WhatsApp prometido.
- **Evidência:** https://help.pipefy.com/en/articles/13179278-getting-started-with-auto-generated-ai-assistants-beta ; https://community.pipefy.com/product-updates/automatic-assistants-effortless-support-and-requests-4818
- **Relevância:** **baixa/média**. Abrir chamado e consultar status pelo WhatsApp tem valor no Brasil.

### 3.5 Governança dos agentes (2026)
- **Descrição:** escolha de modelo por comportamento (Lite/Standard/Pro e BYOM com OpenAI, Anthropic, Gemini e OCI), MCP como cliente e servidor, sandbox de cálculo, "esforço máximo", melhoria automática de instruções, teste de comportamento antes de publicar, validação humana dentro do comportamento (com SLA), webhooks de execução, permissão só de leitura para agentes, envio de e-mail pelo agente e base de conhecimento em texto livre.
- **Evidência:** https://community.pipefy.com/tips-inspiration-45/pipefy-updates-may-2026-5239 ; https://community.pipefy.com/tips-inspiration-45/pipefy-updates-june-2026-5354 ; https://community.pipefy.com/tips-inspiration-45/pipefy-updates-july-2026-5469 ; https://community.pipefy.com/tips-inspiration-45/pipefy-updates-august-2026-5512
- **Relevância:** **baixa** como pacote. **Média** para o ponto "validação humana + log", que é o padrão certo para IA em processo financeiro.

### 3.6 Tasks, requests unificados e Round Robin (2023)
- **Descrição:** ver 1.2 e 1.9. Inclui convite de convidados para grupos sem custo, com acesso a formulários.
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features
- **Relevância:** **alta**.

### 3.7 Novo Portal + permissões por página e por formulário + white label (2023-2024)
- **Descrição:** ver 1.7.
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features
- **Relevância:** **alta**.

### 3.8 Interfaces (2023) e melhorias (2026)
- **Descrição:** ver 1.11. Novo editor de texto rico em Portal, Interface e campos dinâmicos (mai/2026).
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features ; https://community.pipefy.com/tips-inspiration-45/pipefy-updates-may-2026-5239
- **Relevância:** **média**.

### 3.9 HTTP request em automações + Integrações (iPaaS) renovadas (2023 → 2026)
- **Descrição:** ação HTTP (dez/2023). A plataforma de "Integrations" ganhou em 2026 roteamento por IA, mais conectores, variáveis de credencial criptografadas, painel de teste, mensagens de erro claras e estatísticas de consumo.
- **Evidência:** https://community.pipefy.com/product-updates/pipefy-integrations-ai-powered-routing-more-connectors-and-a-faster-builder-5593 ; https://community.pipefy.com/product-updates-193/pipefy-integrations-power-scale-and-visibility-5673
- **Relevância:** **alta** para webhook e HTTP de saída/entrada. **Baixa** para um iPaaS completo.

### 3.10 SLA avançado: feriados, horário útil e fuso (Q1/2024)
- **Descrição:** ver 1.5. Também separa alertas de "dia útil" e de "request".
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features ; https://community.pipefy.com/ideas/product-improvement-phase-sla-delayed-card-using-working-days-2720
- **Relevância:** **alta**.

### 3.11 Filtros de campo conectados / dependentes (Q3/2024)
- **Descrição:** as opções de um campo dependem de outro (estado → cidade; categoria → subcategoria; centro de custo → aprovador).
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features
- **Relevância:** **alta**.

### 3.12 Ações em massa em cards (Q4/2024)
- **Descrição:** editar, mover, disparar automação ou excluir vários cards de uma vez.
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features
- **Relevância:** **alta**.

### 3.13 Pipesign: assinatura eletrônica (Q3/2024)
- **Descrição:** ver 1.12.
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features
- **Relevância:** **média**.

### 3.14 Painel de administração, uso e governança (2023 → 2026)
- **Descrição:** histórico de execuções de automação, consumo por processo, chamadas de API, contas e integrações, e uma "Company Overview" com gráficos por pipe e lista do que está perto do limite. Também filtros para revisar acessos em Membros e Permissões (out/2026) e pipes privados por padrão (mai/2026).
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features ; https://community.pipefy.com/product-updates/members-and-permissions-filters-to-review-access-in-a-few-clicks-5671 ; https://community.pipefy.com/tips-inspiration-45/pipefy-updates-may-2026-5239
- **Relevância:** **média**. Sem cobrança por uso, basta revisar acessos e ter logs.

### 3.15 Logs de auditoria e linha do tempo do card (2026)
- **Descrição:** a aba de atividades mostra, em ordem cronológica, transições, campos alterados, quem fez e quais automações e agentes rodaram, com links. Há também um log de alterações de configuração do pipe, com exportação CSV/JSONL via API.
- **Evidência:** https://community.pipefy.com/tips-inspiration-45/pipefy-updates-june-2026-5354 ; https://community.pipefy.com/tips-inspiration-45/pipefy-updates-july-2026-5469
- **Relevância:** **alta**. Auditoria é exigência de financeiro e compliance.

### 3.16 Página dedicada de automações + editor de condicionais redesenhado + teste de "mover card" (2026)
- **Descrição:** lista de automações com busca, filtros e ordenação. Editor de condicionais E/OU mais claro. Simulação de automação antes de ativar. Duplicar condicionais de formulário.
- **Evidência:** https://community.pipefy.com/tips-inspiration-45/pipefy-updates-june-2026-5354 ; https://community.pipefy.com/tips-inspiration-45/pipefy-updates-july-2026-5469
- **Relevância:** **alta** (lista, busca e "testar regra").

### 3.17 Mapa / Flow View do processo (2026)
- **Descrição:** diagrama de ponta a ponta com fases, formulários, agentes, integrações e conexões entre pipes e databases, incluindo o volume de cards por conexão.
- **Evidência:** https://community.pipefy.com/product-updates/map-now-shows-the-connections-your-ai-agents-create-5604 ; https://community.pipefy.com/tips-inspiration-45/pipefy-updates-august-2026-5512
- **Relevância:** **baixa/média**. É bom para documentar processos, mas não é MVP.

### 3.18 Lixeira de cards (jul/2026) e duplicar relatório (ago/2026)
- **Descrição:** ver 2.14 e 1.10.
- **Evidência:** https://community.pipefy.com/tips-inspiration-45/pipefy-updates-july-2026-5469 ; https://community.pipefy.com/tips-inspiration-45/pipefy-updates-august-2026-5512
- **Relevância:** **alta** / **média**.

### 3.19 Grupos com papéis em pipes, donos de grupo e provisionamento SCIM (2023)
- **Descrição:** adicionar um grupo a um pipe com papel definido, com membros sincronizados a partir do provedor de identidade.
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features ; https://community.pipefy.com/news-and-announcements-49/celebrating-your-ideas-brought-to-life-3328
- **Relevância:** **alta** para grupos (ex.: "Aprovadores Financeiro"). **Média** para SCIM; para empresa Google, basta sincronizar com o Workspace.

### 3.20 Soluções verticais com IA (2025)
- **Descrição:** pacotes prontos como "CRM AI Studio", fluxo de crédito com análise de balanço e cobrança via WhatsApp, e soluções para RH e seguros.
- **Evidência:** https://www.pipefy.com/blog/pipefy-updates-process-automation-ai/ ; https://www.pipefy.com/press-release/2025
- **Relevância:** **baixa**. São conteúdo e template, não funcionalidade a clonar.

---

## 4. Dores comuns

### 4.1 Limites de automação, API e e-mail por plano, com bloqueio da conta
- **Descrição:** cada plano tem teto mensal de "jobs" de automação e de chamadas de API. Toda vez que o gatilho dispara, a execução conta como job, mesmo se a condição for falsa e nada acontecer. Ao estourar, a organização pode ser bloqueada temporariamente. No plano free, poucos e-mails automáticos por dia derrubam a conta. Há reclamações no Reclame Aqui de bloqueio para forçar upgrade.
- **Evidência:** https://help.pipefy.com/en/articles/6445865-automation-billing ; https://help.pipefy.com/en/articles/5419654-how-to-use-and-buy-add-ons ; https://community.pipefy.com/ask-the-community-43/pipefy-only-sends-three-automated-emails-per-day-on-the-free-plan-4357 ; https://www.reclameaqui.com.br/empresa/pipefy/
- **Relevância:** **alta**. É a principal razão para ter ferramenta própria: automação sem medidor. Ainda assim, convém proteção contra loop (rate limit interno e detecção de ciclo).

### 4.2 Preço por usuário e recursos travados em planos caros
- **Descrição:** a queixa mais frequente em reviews é que recursos valiosos (relatórios melhores, IA, SLA avançado, portal) ficam em planos superiores. Pagar licença para quem só acompanha card sai caro.
- **Evidência:** https://www.getapp.com/operations-management-software/a/pipefy/ ; https://analister.com/ferramentas/pipefy ; https://www.g2.com/products/pipefy/
- **Relevância:** **alta**. O clone interno pode ter perfis de "observador" e "solicitante" à vontade.

### 4.3 Relatórios e dashboards fracos ou lentos
- **Descrição:** reviews dizem que relatórios são fracos, que o dashboard é lento e difícil de montar e que relatório customizado exige configuração manual. Somam-se os limites de 2.7 e 2.8, e por isso a exportação para o Power BI é rotina.
- **Evidência:** https://origin.peerspot.com/products/pipefy-pros-and-cons ; https://community.pipefy.com/ideas/81 ; https://community.pipefy.com/ideas/incluir-dados-de-campos-conectados-em-relatorios-do-pipe-3806
- **Relevância:** **alta**.

### 4.4 Lentidão e instabilidade da interface
- **Descrição:** relatos de servidor lento em dias de pico, de card que some no meio do arraste (é preciso recarregar) e de pipes que não abrem (threads de 2025-2026 em Troubleshooting). Em 2026 a Pipefy otimizou o carregamento do Mapa.
- **Evidência:** https://origin.peerspot.com/products/pipefy-pros-and-cons ; https://community.pipefy.com/troubleshooting-105/can-t-open-any-pipe-4955 ; https://community.pipefy.com/troubleshooting-105/usage-statistics-won-t-let-me-access-the-pipes-4962
- **Relevância:** **média**. Com volume interno, o kanban precisa de paginação ou virtualização por fase.

### 4.5 Automações que falham em silêncio e são difíceis de depurar
- **Descrição:** "minha automação não move o card" é um dos tópicos mais antigos e recorrentes. As causas são campo obrigatório vazio na fase, fase de destino não permitida, condição mal montada e regras duplicadas. Os logs, o alerta de falha e o teste de regra só chegaram em 2025-2026.
- **Evidência:** https://help.pipefy.com/en/articles/2908614-my-automation-is-not-moving-cards-what-s-wrong ; https://community.pipefy.com/questions/41 ; https://community.pipefy.com/ideas
- **Relevância:** **alta**.

### 4.6 Permissões pouco granulares
- **Descrição:** não há campo por papel nem admin parcial (ver 2.6). Relatório de empresa exige ser membro de todos os pipes. Pipe público ou privado é binário. Só em 2026 vieram pipe privado por padrão e filtros de revisão de acesso.
- **Evidência:** https://community.pipefy.com/ideas/custom-user-permissions-configuration-5186 ; https://help.pipefy.com/tutorials/how-to-create-company-reports
- **Relevância:** **alta**.

### 4.7 Fluxos com muitas ramificações exigem muitas regras
- **Descrição:** montar processo com várias ramificações (alçadas, exceções) leva horas e vira uma teia de regras e pipes de aprovação, difícil de manter.
- **Evidência:** https://analister.com/ferramentas/pipefy ; https://blog.jestor.com/does-pipefy-support-multi-level-approval-flows/ (concorrente; ler com cautela)
- **Relevância:** **alta**. Um bloco nativo de "regra de roteamento/alçada" (tabela de decisão) reduz isso.

### 4.8 E-mail problemático
- **Descrição:** reviews citam integração de e-mail com bugs. Anexo vai como link (2.5). Falhas de SMTP próprio eram silenciosas até 2026.
- **Evidência:** https://origin.peerspot.com/products/pipefy-pros-and-cons ; https://community.pipefy.com/product-updates-193/improved-error-handling-for-custom-smtp-and-email-5679
- **Relevância:** **alta**.

### 4.9 Suporte e cobrança
- **Descrição:** no Reclame Aqui (nota cerca de 5/10), as queixas são de cobrança inesperada, demora do suporte e bloqueio de acesso. Em reviews, o suporte aparece com avaliações mistas.
- **Evidência:** https://www.reclameaqui.com.br/empresa/pipefy/ ; https://www.reclameaqui.com.br/pipefy/suporte-muito-ruim_JrxuGrYFhJgskA6C/
- **Relevância:** **baixa** como funcionalidade, mas reforça o argumento a favor de ferramenta própria.

### 4.10 Integrações nativas limitadas (Jira, Notion, Slack, ERP)
- **Descrição:** reviews relatam dificuldade de integrar com outras ferramentas. Na prática, usam Zapier, Make, n8n, Pluga (no Brasil) ou a API.
- **Evidência:** https://www.g2.com/products/pipefy/ ; https://nfe.io/docs/integracoes/plataformas/pluga/pipefy/
- **Relevância:** **média**. No clone, webhooks de entrada e saída mais uma API REST cobrem esse papel.

---

## 5. Casos de uso típicos no Brasil e o que cada um exige

### 5.1 Compras (requisição → cotação → aprovação → pedido)
- **Descrição:** formulário interno ou portal de requisição. Fase de cotação com e-mail para vários fornecedores, cujas respostas voltam ao card (via e-mail ou formulário de fase). Aprovação por alçada (valor e centro de custo). Geração de pedido no ERP por HTTP. Card filho no pipe de contas a pagar.
- **Funções exigidas:** portal/formulário, campos dependentes (categoria → item), database de fornecedores (CNPJ) e de centros de custo, e-mail com template e caixa do card, campo de cotação repetível (tabela), aprovação com alçada, fórmula (total), conexão pai/filho, HTTP para ERP, SLA por fase, relatório de lead time.
- **Evidência:** https://www.pipefy.com/templates/purchase-process/ ; https://www.pipefy.com/templates/approval-process/ ; https://help.pipefy.com/en/articles/6291556-pipefy-for-purchasing-how-to-create-automated-and-centralized-approval-flows ; https://community.pipefy.com/product-updates/pipefy-for-purchase-automate-and-centralize-communication-with-requesters-using-email-templates-1813
- **Relevância:** **alta**.

### 5.2 Financeiro: contas a pagar
- **Descrição:** entrada de NF ou boleto (e-mail, formulário ou card filho de compras), conferência (3-way match: pedido × NF × recebimento), aprovação, agendamento, pagamento, comprovante e conciliação. A motivação citada pela comunidade são "e-mails perdidos e etapas sem fluxo definido". A IA de leitura de documento entra na extração.
- **Funções exigidas:** e-mail-para-card, anexos, extração de dados de NF-e (XML) e boleto (linha digitável), validação de duplicidade (mesmo nº de NF e CNPJ), database de fornecedores com dados bancários e PIX (campo sensível), vencimento com alerta em dia útil, aprovação por alçada, relatório por vencimento, exportação para o ERP e auditoria.
- **Evidência:** https://community.pipefy.com/finance-procurement-83/accounts-payable-key-tips-to-manage-the-process-efficiently-with-pipefy-1687 ; https://community.pipefy.com/finance-procurement-83/do-you-use-pipefy-to-process-invoices-and-complete-3-way-matching-share-your-use-case-3068 ; https://community.pipefy.com/ask-the-community-43/best-practices-for-automating-an-accounts-payable-tax-document-pipe-5398 ; https://community.pipefy.com/ask-the-community-43/we-want-to-hear-from-you-how-does-pipefy-contribute-to-your-finance-process-425
- **Relevância:** **alta**.

### 5.3 RH: recrutamento e admissão/onboarding
- **Descrição:** abertura de vaga com aprovação do gestor, recrutamento (candidatura por formulário público e e-mails automáticos de andamento), admissão (coleta de documentos do candidato por formulário de fase ou link, conferência, assinatura de contrato) e cards filhos para TI (acessos), facilities e DP (eSocial, folha). Em 2025 a Pipefy lançou agentes de IA voltados a RH (triagem de currículo).
- **Funções exigidas:** formulário público com anexos, formulário de fase enviado ao candidato, checklist de documentos, campos CPF, PIS e data, campos sensíveis (salário) com permissão, conexão pai/filho com TI e DP, SLA com data de início como referência (SLA por campo de data), assinatura eletrônica, LGPD (retenção e exclusão de dados do candidato).
- **Evidência:** https://www.pipefy.com/templates/employee-onboarding/ ; https://www.pipefy.com/templates/recruiting/ ; https://www.pipefy.com/templates/job-opening-request/ ; https://www.pipefy.com/press-release/2025
- **Relevância:** **alta**.

### 5.4 Atendimento / central de serviços interna (TI, facilities, DP)
- **Descrição:** portal com vários formulários por tipo de pedido, triagem e distribuição por round robin, SLA de primeira resposta e de solução, comunicação por e-mail com o solicitante, que acompanha o status em "meus pedidos". Assistente de chat ou WhatsApp para abrir pedidos e consultar status (tendência 2025-2026).
- **Funções exigidas:** portal, área do solicitante, round robin, SLA em horário útil, e-mail bidirecional, etiquetas e prioridade, relatório de SLA cumprido e base de respostas.
- **Evidência:** https://help.pipefy.com/en/articles/8513933-new-features ; https://community.pipefy.com/product-updates/automatic-assistants-effortless-support-and-requests-4818
- **Relevância:** **alta**.

### 5.5 Jurídico: contratos
- **Descrição:** solicitação de contrato pela área de negócio, triagem, minuta (modelo preenchido com campos do card), revisão, negociação com versões em anexo, aprovação, assinatura eletrônica, arquivo em database de contratos e alerta de vencimento e renovação (N dias antes). A Pipefy vende agentes de IA para elaboração e aprovação de contratos.
- **Funções exigidas:** geração de documento a partir de modelo, anexos versionados, assinatura eletrônica, database de contratos conectado, SLA por data personalizada (vencimento do contrato), campo confidencial e relatório de carteira.
- **Evidência:** https://www.pipefy.com/templates/sales-legal-contracts/ ; https://community.pipefy.com/ideas/custom-sla-alert-393 ; https://pipefy.com/products/
- **Relevância:** **média/alta**.

### 5.6 Financeiro: contas a receber, crédito e cobrança
- **Descrição:** análise de crédito com documentos e bureaus, aprovação de limite, cobrança com régua de e-mail e WhatsApp, e emissão de NFS-e por integração (ex.: NFe.io via Pluga, disparada ao mover card).
- **Funções exigidas:** HTTP/webhook, automação recorrente (régua), integração com WhatsApp, fórmulas e datas relativas.
- **Evidência:** https://www.pipefy.com/blog/pipefy-updates-process-automation-ai/ ; https://nfe.io/docs/integracoes/plataformas/pluga/pipefy/
- **Relevância:** **média**.

---

## Top 15 funcionalidades que mais importam na prática

1. **Formulários (internos, públicos e de fase) com condicionais e campos dependentes**: toda demanda entra por eles, e campos dependentes evitam erro de cadastro.
2. **Kanban de fases com campos obrigatórios por fase e validação de transição**: é o controle básico de "não pular etapa", que a comunidade quer estender com regras condicionais.
3. **Motor de automações (evento → condição → ação), sem limite de uso**: é o uso mais citado, e o limite por plano é a maior dor da Pipefy.
4. **Log de execução por card, alerta de falha e "testar regra"**: foi a ideia mais votada da comunidade, e automação que falha em silêncio é a dor nº 1 de suporte.
5. **Aprovação nativa com alçada (por valor, centro de custo ou grupo) e aprovação por link**: hoje o usuário monta isso com fases, pipes extras e Tasks, o que vira teia difícil de manter.
6. **Conexões pai/filho entre pipes com "quando todos os filhos concluírem, mover pai"**: compras → pagamento e admissão → TI são encadeamentos onipresentes.
7. **Databases como cadastro mestre com lookup de campos no card**: fornecedores e centros de custo são usados em tudo, e puxar atributos do registro é uma lacuna atual.
8. **SLA por fase em dias úteis com feriados e SLA por campo de data**: contratos, vencimentos e prazos de RH dependem de data personalizada, que é pedido em aberto.
9. **E-mail bidirecional no card (templates, anexos reais, SMTP próprio)**: fornecedores e candidatos se comunicam por e-mail, e anexo como link é queixa antiga.
10. **Portal de solicitações com área "meus pedidos" para o solicitante**: é a porta de entrada das áreas de serviço e substitui e-mails e planilhas.
11. **Permissões granulares (campo sensível por papel, grupos, pipe privado, admin parcial)**: salário, dados bancários e pareceres exigem isso, e hoje não existe.
12. **Relatórios com campos conectados (JOIN), filtros salvos e exportação/acesso para BI**: relatório fraco é dor recorrente, e todos exportam para o Power BI de qualquer forma.
13. **Campo fórmula / calculado (números, datas e texto)**: é pedido desde 2018 e só foi atendido parcialmente, via automação.
14. **HTTP / webhooks de entrada e saída (ERP, NF-e, WhatsApp)**: é a ponte com o resto da empresa e evita Zapier/Make.
15. **Histórico/auditoria do card, ações em massa e lixeira**: são baratos de fazer, a Pipefy só os entregou em 2024-2026, e financeiro e compliance exigem trilha de auditoria.

Nota sobre IA: agentes, leitura de documentos e assistentes são a principal aposta da Pipefy em 2025-2026. Para o Fluxos, a recomendação é entrar depois do Top 15, como uma ação de automação "extrair/classificar com LLM" e com validação humana, começando pela leitura de NF-e e boleto em contas a pagar.

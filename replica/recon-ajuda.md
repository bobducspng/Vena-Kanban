# Levantamento da Central de Ajuda do Pipefy — funcionalidades detalhadas

> Fonte única: central de ajuda pública (help.pipefy.com, EN e PT-BR), lida em 2026-10-28 (≈320 artigos de 60+ coleções).
> Clean-room: comportamentos descritos com palavras próprias; nada de marca, marketing ou conteúdo de templates.
> Convenção: **Plano** só aparece quando a fonte informa. "Todos" = disponível em todos os planos.
> Prefixo das URLs: `https://help.pipefy.com/en/articles/` — abaixo cito só o slug (ex.: `614659-change-pipe-settings`).
> Os IDs numéricos são os mesmos na versão PT-BR (`https://help.pipefy.com/pt-BR/articles/<id>`).

Índice: 1 Pipes · 2 Fases · 3 Cards · 4 Campos · 5 Condicionais de campo · 6 Formulários · 7 Portais · 8 Convidados, tarefas e solicitações · 9 Conexões · 10 Databases · 11 Automações · 12 Alertas, SLA e notificações · 13 E-mail · 14 Visualizações, busca e filtros · 15 Relatórios · 16 Dashboards e análises · 17 Atividades/auditoria · 18 Permissões e papéis · 19 Organização, conta e segurança · 20 Importação/exportação · 21 Integrações, API e webhooks · 22 Apps de pipe, PDF e assinatura · 23 Interfaces · 24 IA · 25 Planos, consumo e limites · 26 Dúvidas/lacunas

---

## 1. Pipes (processos)

### 1.1 Criar pipe
- Botão "Novo pipe" na Home abre a galeria de modelos, com a opção "começar do zero".
- Pipe do zero nasce com **3 fases**, nenhum card e formulário inicial vazio.
- Quem cria: por padrão só admins da empresa; o admin pode liberar membros e convidados da empresa (configuração por papel no painel de admin).
- Convidado da empresa que cria um pipe é promovido automaticamente a membro (passa a ser cobrado).
- Fontes: `614610-how-to-create-a-pipe`, `6863686-how-to-create-a-pipe-from-scratch`, `6026339-allow-company-guests-to-create-pipes`

### 1.2 Criar pipe com IA
- O usuário descreve o processo em texto livre e a IA propõe fases, campos e formulário inicial; tudo fica editável depois.
- Fontes: `9811035-how-to-build-pipes-from-scratch-with-pipefy-ai`, `8506952-how-to-use-pipefy-s-artificial-intelligence-to-create-the-perfect-processes-for-you`

### 1.3 Configurações do pipe (engrenagem > Configurações do pipe)
Só admin do pipe ou da empresa. Salvamento automático. Todos os planos.
- **Ícone e cor** do pipe (aparecem na Home, portais, formulários, conexões e automações).
- **Nome** do pipe.
- **Objeto do pipe**: renomear "card" para o termo do negócio (ticket, pedido, candidato). Aparece no cabeçalho do pipe e na lista de pipes da Home.
- **Título do card**: escolher um campo do formulário inicial. A mudança só vale para cards novos; os antigos mantêm o título.
- **Subtítulos do card**: campos (de qualquer fase) exibidos no card fechado. Card que ainda não passou pela fase do campo não mostra o subtítulo.
- **Subtítulos de cards conectados**: campos mostrados quando o card aparece como conectado em outro card.
- **Texto do botão "criar card"** (ex.: "Nova solicitação").
- **Alerta de expiração** (ver 12.3), com opção **somente dias úteis**. Quando ligada, **todos** os alertas do pipe (vencimento, atraso, expiração) passam a ignorar sábado e domingo.
- **Visibilidade**: pipe público (qualquer pessoa da empresa entra) ou privado (só admins e pessoas adicionadas). Adicionar papéis além de admin exige assinatura paga.
- **Edição de cards**: qualquer card, ou só os cards em que o usuário é responsável (via campo de responsável).
- **Exclusão de cards**: opção para permitir excluir somente a admins.
- **Quem pode criar cards pelo formulário inicial**: "admins, membros e convidados da empresa" e/ou "convidados externos" (combináveis; permite pessoas que só abrem solicitações sem ver o processo).
- **Visualização padrão** do pipe; cada usuário ainda pode escolher a sua.
- **Excluir pipe** e **Clonar pipe** (abaixo).
- Fontes: `614659-change-pipe-settings`, `6097406-what-is-a-pipe-object`

### 1.4 Clonar / duplicar pipe
- Pela Home (menu ⋯ > "Duplicar este pipe"): copia na mesma empresa.
- Pelas configurações ("Clonar para"): permite escolher outra organização da qual o usuário é membro.
- Requisitos: ser admin do pipe de origem **e** ter permissão de criar pipe no destino.
- Copia fases, campos, automações, condicionais e templates de e-mail. **Não** copia cards, campos de conexão nem cards conectados.
- O nome do clone recebe o sufixo "(Copy 1)".
- Pipes conectados entre si são clonados juntos; automações ligadas a pipes não conectados não são clonadas.
- Automação que o sistema considera "quebrável" não é clonada (ex.: campo que virou obrigatório depois da regra, com autopreenchimento vazio na regra).
- Pipe conectado a si mesmo: é preciso remover a autoconexão antes de clonar e recriá-la depois.
- Condicional que usa campo de conexão é clonada **em branco**; automações que dependem de campo de conexão podem quebrar.
- Fonte: `2908494-how-to-clone-a-pipe`

### 1.5 Excluir pipe
- Pela Home (⋯ > excluir) ou nas configurações. Exige digitar "confirm". Irreversível. Só admin do pipe ou da empresa.
- Fontes: `614607-how-to-delete-a-pipe`, `614659-change-pipe-settings`

### 1.6 Versões da configuração do pipe (snapshot), em Beta
- Plano: Business e Enterprise (ambiente multi-tenant). Para admins do pipe e grupos admin.
- Gerenciar > Histórico de versões > "Criar versão": gera um snapshot JSON legível da configuração. Cobre 19 tipos de elemento (fases, campos, condições, automações, expressões condicionais, conexões de pipe e de campo…). Não inclui integrações, apps, agentes de IA nem cards.
- A geração é assíncrona. Cada versão recebe número sequencial, data/hora e autor. Uma notificação (sino) avisa quando fica pronta. Se falhar, aparece um alerta e nada entra na lista (a lista não atualiza ao vivo; é preciso recarregar).
- Renomear (quantas vezes quiser) e baixar o JSON para comparar em ferramenta de diff externa.
- Criar e renomear ficam registrados em Atividades > Alterações de configuração (com o ID da versão).
- Restaurar: só via API e só para a **última** versão.
- Fonte: `16822013-save-and-download-a-version-of-your-pipe-s-setup`

### 1.7 Aba "Flow" (revisão da configuração do pipe)
- Para admins do pipe; todos os planos. Aba ao lado de Mapa e Kanban.
- Mostra cada fase com os campos que coleta e os "cartões de automação" ligados a ela. Fase sem automação aparece com "Nenhuma automação nesta fase — Adicionar" (vazio é explícito).
- Passar o mouse numa fase destaca, com linha pontilhada, todas as fases para onde o card pode ir. Passar o mouse numa automação "mover card"/"mover card pai" destaca só a origem e o destino dela. Cadeado fixa as linhas enquanto se navega ou dá zoom.
- Posição das automações: dentro do bloco da fase citada no gatilho. As de mover ficam acima; as de criar card ficam abaixo; as sem fase (ex.: expiração no pipe) ficam no início. Várias do mesmo tipo são agrupadas com contador.
- Ordem fixa dentro da fase: IA, tarefas, e-mails, atualização de campo, distribuição de responsáveis, fórmulas, HTTP, SLA.
- Fonte: `5368316-how-to-review-your-pipe-s-setup-in-flow`

### 1.8 Mapa de processos
- Aba "Mapa" no pipe; para admins; todos os planos. O pipe atual aparece com a marca "Você está aqui". À esquerda fica o que alimenta o pipe; à direita, o que ele alimenta.
- Cada linha tem um ícone com a origem da ligação: **conexão** manual, **automação** ou **campo de conexão**. Dois pipes podem ter várias ligações. Clicar no ícone abre os detalhes e leva às configurações.
- Filtros: profundidade (1, 2 ou 3 níveis de vizinhos), objeto (pipes/databases) e tipo de ligação (combináveis).
- Fonte: `15971463-see-how-all-your-processes-connect-on-the-map`

---

## 2. Fases

### 2.1 Criar, posicionar, mover e excluir fases
- "Nova fase" adiciona no fim; o "+" entre duas fases insere no meio.
- Mover fase: menu ⋯ > mover para esquerda/direita (sem restrição de posição).
- Excluir fase: menu ⋯ > excluir. **Apaga todos os cards, dados e configurações da fase** (aviso explícito).
- Editar descrição: clicar no nome da fase no pipe, editar e apertar Enter.
- Quem: todos os membros e admins do pipe. Todos os planos.
- Fontes: `614634-the-basics-about-phases`, `614592-what-are-phases`

### 2.2 Propriedades da fase (editor da fase > Opções avançadas)
- Nome, **cor** e emojis no título, descrição.
- **Fim do processo** (checkbox): pode haver **mais de uma** fase final. Cards nela ficam concluídos/inativos e não avançam, mas podem voltar a fases anteriores.
- **Permitir criar cards nesta fase** (por padrão, cards novos só nascem na primeira fase).
- **Responsáveis da fase**: pessoas atribuídas a todos os cards enquanto estiverem na fase.
- **Alertas/SLA da fase** (ver 12.2).
- **Coletar e-mails** (autenticação) para formulários de fase compartilhados (ver 6.6).
- Campos da fase (formulário da fase) e condicionais.
- Fontes: `614634-the-basics-about-phases`, `6593934-set-up-the-end-of-the-process`, `6863686-how-to-create-a-pipe-from-scratch`

### 2.3 Restrição de movimento ("Mover para" / botões de ação)
- Por fase: modal "Editar Mover para" com um switch por fase de destino. Desligado = cards desta fase não podem ir para aquela.
- Também acessível no card aberto ("Editar opção", à direita).
- Padrão: todos os destinos liberados, mas o **movimento manual anda uma fase por vez, para frente ou para trás** (não pula fases).
- Uso típico: impedir a volta de B para A.
- Fontes: `614656-how-to-edit-a-phase-s-action-buttons`, `614653-moving-cards-through-the-pipe`

### 2.4 Campos obrigatórios travam a saída da fase
- O card só avança se todos os campos obrigatórios da fase atual estiverem preenchidos.
- Fontes: `614653-moving-cards-through-the-pipe`, `614598-what-are-fields-in-a-phase-or-a-form`

---

## 3. Cards

### 3.1 Criar card
- O botão "+" no rodapé (texto configurável) abre o formulário inicial. Ao enviar, o card nasce na **primeira fase** (ou em outra fase que permita criação).
- Outras origens: formulário público, portal, e-mail recebido na caixa do pipe, conexão (card filho), automação, integração/API, importação de planilha.
- Não dá para criar card na tela de edição do formulário.
- Fontes: `614630-managing-cards-in-a-pipe`, `614605-what-is-a-card`

### 3.2 Anatomia do card aberto
- Lado esquerdo: título (editável com clique), responsáveis, data de vencimento, etiquetas, botões de topo, dados do formulário inicial e das fases anteriores.
- Lado direito: fase atual, formulário da fase atual, botão "+ campos" (edita a fase), Atividades (comentários + histórico), botões "Mover card para fase" (fases permitidas) e configuração de movimento.
- Fonte: `614605-what-is-a-card`

### 3.3 Editar dados de fases anteriores
- Passar o mouse sobre o valor > lápis > editar > salvar.
- Só funciona se o campo tiver a opção **"editável em outras fases"** ligada.
- Fonte: `614630-managing-cards-in-a-pipe`

### 3.4 Campos fixos e recursos do card (liga/desliga por pipe)
- O botão "+" ao lado das ações base habilita ou desabilita: responsáveis, vencimento, etiquetas, anexos, comentários e checklist.
- Recursos: gerar PDF, enviar e-mail, criar card em outro pipe (conexão), criar registro em database conectado.
- O campo fixo não pode ser desligado quando a fase atual tem um campo com a mesma função (ex.: campo de responsável).
- Bloquear comentários ou o download de dados: nas preferências de visualização.
- Fonte: `1664781-edit-fixed-fields-and-card-features`

### 3.5 Personalizar a visão do card aberto
- Blocos que podem ser adicionados: Anexos, Checklists, Comentários, E-mails. Cada um pode subir, descer ou ser removido.
- O bloco do formulário inicial pode ser movido mas não removido. O Histórico não pode ser movido nem ocultado.
- Fonte: `1030711-how-to-customize-the-open-card-view`

### 3.6 Comentários e menções
- Em Atividades: digitar e "Postar". `@usuario` menciona e notifica, mas só funciona para **membros do pipe**.
- Fonte: `5323802-how-to-add-comments-in-cards`

### 3.7 Responsáveis
- Três formas: campo fixo de responsáveis (nível card), campo "Seleção de responsável" ou responsáveis herdados da fase.
- Diferença prática: responsável no nível **card** pode ser editado em massa; o herdado da **fase** não (é preciso tirar o card da fase e devolver).
- Fontes: `9660310-bulk-actions-in-pipes`, `1664781-edit-fixed-fields-and-card-features`

### 3.8 Etiquetas (labels)
- Cadastro por pipe em Ferramentas > Etiquetas: criar (nome + cor), editar, excluir.
- Um card pode ter várias etiquetas, exibidas no topo do card fechado e aberto; salva sozinho.
- Servem para filtros e relatórios; também existem como campo "Etiqueta" em formulário ou fase.
- Fontes: `614644-create-or-edit-a-label`, `614651-the-basics-of-card-labels`

### 3.9 Mover card
- Arrastar e soltar no kanban, ou botões de fase no card aberto.
- Regras: só para fases permitidas (2.3), uma fase por vez (manual), obrigatórios preenchidos (2.4).
- Na fase final o card fica concluído, mas pode voltar.
- Automações podem mover sem a regra de uma fase por vez (ver 11).
- Fonte: `614653-moving-cards-through-the-pipe`

### 3.10 Excluir card
- Card aberto > ⋯ > "Excluir este card" > confirmar. Irreversível; perde todos os dados.
- O pipe pode restringir a exclusão a admins (1.3).
- Fontes: `614630-managing-cards-in-a-pipe`, `614659-change-pipe-settings`

### 3.11 Ações em massa (só na visão Lista)
- Para super admin e admin do pipe.
- Selecionar cards (com ajuda do filtro) > barra mostra a contagem > **Editar em massa**, **Mover cards** ou **Excluir cards** (exige digitar uma frase de confirmação; irreversível).
- Limite: até **10.000 cards** por ação; pode levar alguns minutos.
- Não editáveis em massa: ID, Conteúdo dinâmico, Anexo. Responsáveis só se forem campo do card (não herdados da fase).
- Switch "disparar automações": só aparece com **até 100 cards** selecionados.
- Fonte: `9660310-bulk-actions-in-pipes`

### 3.12 Evitar cards duplicados (valor único)
- A opção "valor único" no campo rejeita um valor que já exista em qualquer card do pipe (ou registro do database).
- Tipos aceitos: texto curto, e-mail, telefone, documento (CPF/CNPJ), número, moeda, data e hora, vencimento.
- Só o admin do pipe configura.
- Fonte: `6492517-how-to-avoid-duplicated-cards`

### 3.13 Cards pai e filho
- Nascem do campo de conexão: o card de origem é o **pai** e o criado a partir dele é o **filho**.
- O pai mostra uma seta com atalho para filhos e registros; o filho mostra a conexão como objeto colorido com atalho para o pai.
- Atualizações ficam visíveis nos dois lados.
- Automações podem mover o pai quando o filho se move, entre outros cenários (ver 11).
- ID do pai a partir do filho: só via API (`parent_relations`).
- Fontes: `6449125-what-are-parent-and-child-cards`, `8733034-how-to-obtain-the-id-of-a-parent-card-from-a-linked-child-card`

### 3.14 Desconectar card ou registro conectado
- Campo de conexão na fase atual: clicar no "x" do item. Campo em fase anterior: lápis do campo > "x".
- Fonte: `625620-how-to-unlink-connected-cards`

### 3.15 Limitar criação de cards por disponibilidade (padrão de configuração)
- Combina um database (com campo "disponível?"), um campo de conexão obrigatório de item único, um conteúdo dinâmico de aviso e uma condicional que esconde os demais campos quando o item está indisponível.
- Fonte: `6579825-how-to-limit-card-creation`

### 3.16 ID do card
- O número do card aparece na URL. É usado para pré-preencher conexões e na API.
- Fontes: `4396848-how-to-set-up-initial-values`, `8733034-how-to-obtain-the-id-of-a-parent-card-from-a-linked-child-card`

### 3.17 Cards atribuídos a mim
- Ver 14.6.

---

## 4. Campos

### 4.1 Regras gerais
- Adicionar: arrastar o tipo da paleta para o formulário ou fase, dar um título e salvar. Vale para formulário inicial, fases e databases.
- Quem: membros e admins do pipe (alguns artigos dizem só admin; ver lacunas).
- **O tipo não muda depois de criado.** Trocar = excluir (perdendo os dados) e recriar. A sugestão oficial é esconder o campo antigo com uma condicional.
- Opções comuns de cada campo:
  - **Descrição** e **texto de ajuda**.
  - **Validação customizada** (regex): texto curto e campos de database.
  - **Obrigatório**.
  - **Visualização mínima** (campo em uma linha).
  - **Editável em outras fases**.
  - **Valor único** (tipos listados em 3.12).
- O fuso do campo data e hora é o do perfil do usuário.
- Fontes: `614642-create-and-edit-fields-in-forms-and-phases`, `625205-field-types`

### 4.2 Catálogo de tipos de campo

| Tipo | Comportamento e opções |
| --- | --- |
| Texto curto | linha única; aceita regex e valor único |
| Texto longo | multilinha |
| Conteúdo dinâmico | texto rico somente leitura (links, listas, cor, negrito/itálico/sublinhado, linhas horizontais, tabelas, imagens coladas) com variáveis de campos de fases **anteriores**. No formulário inicial não há variáveis, só mensagem. Se referenciar um anexo, o convidado pode baixar o arquivo. Não editável em massa |
| Anexo | upload de documentos, PDF, planilhas e imagens; não editável em massa |
| Checkbox | múltipla escolha |
| Seleção de responsável | lista de membros do pipe |
| Data | dia, mês e ano |
| Data e hora | data + hora no fuso do perfil |
| Data de vencimento | alimenta o vencimento do card e os alertas |
| Etiqueta | escolhe etiquetas do pipe, que aparecem no topo do card |
| E-mail | validação de e-mail; valor único |
| Telefone | com código do país; valor único |
| Seleção (dropdown) | lista oculta, uma escolha |
| Seleção radio | opções visíveis, uma escolha |
| Hora | seletor de hora |
| Numérico | só números |
| Moeda | só números; quem preenche escolhe a moeda (USD, EUR…) |
| ID | código único gerado por card; não editável em massa |
| Documento (CPF/CNPJ) | aceita valor único |
| Conexão de pipe | liga cards de outro pipe (ver 9) |
| Conexão de database | liga registros de database (ver 9 e 10) |

- Fontes: `625205-field-types`, `5880116-what-is-the-dynamic-content-field`, `5760304-how-to-use-dynamic-content-field-in-a-form`, `8451892-numeric-features-transform-data-in-results-with-pipefy`

### 4.3 Validação por regex
- Em texto curto (formulário e fase) e em campos de database: ligar "Validação customizada" e informar a expressão. Só entram valores que casem com ela.
- Fonte: `5705048-how-to-validate-custom-fields-with-regex`

### 4.4 Arquivar campo
- Menu ⋯ do campo > Arquivar (com confirmação). Alternativa segura a excluir.
- Efeitos: some de formulários e cards e não recebe valores novos. Continua disponível **como leitura** em automações, agentes de IA, condicionais, relatórios e interfaces. Tudo o que **escreve** nele para de funcionar. Continua listado em "Dependências do campo".
- O filtro "Arquivados" do editor mostra esses campos; ⋯ > Restaurar devolve o campo por completo.
- Fonte: `12736688-archive-a-field`

### 4.5 Dependências do campo (em teste)
- Menu ⋯ do campo > Dependências, ou botão no rodapé da edição do campo.
- Deve listar onde o campo é usado (automações, condicionais, conexões, interfaces, templates de e-mail, campos dinâmicos); por enquanto só mostra automações e condicionais.
- Fonte: `10844068-field-dependencies`

### 4.6 Valor inicial via URL (conexão em formulário público)
- Acrescentar `?<nome_original_do_campo>=<id_do_card>` à URL do formulário público exibe aquele card conectado como valor inicial, sem permitir edição.
- O identificador é o **nome original** do campo: renomear não muda o ID interno.
- Fonte: `4396848-how-to-set-up-initial-values`

### 4.7 Autopreenchimento (autofill) via conexão
- Opção avançada da conexão: ao conectar pipe ou database, mapear campos de origem para campos de destino (ex.: nome, e-mail) ou definir valor fixo.
- Todos os planos.
- Fonte: `1303264-how-to-autofill-fields`

### 4.8 Fórmulas
- Não há campo-fórmula nativo. Cálculos são feitos pela **ação de automação "Executar uma fórmula"** (ver 11.4) ou por fórmulas em relatórios (ver 15).
- Fontes: `8499961-automated-formulas`, `8451892-numeric-features-transform-data-in-results-with-pipefy`

---

## 5. Condicionais de campo

### 5.1 Conceito e disponibilidade
- Mostram ou ocultam campos conforme valores de outros campos, em qualquer formulário (inicial, de fase, público, database).
- Plano: Business, Enterprise, Unlimited. Configuração por admin do pipe (outro artigo diz membros e admins).
- Usos: pular obrigatórios ao ocultá-los, pedir informação extra, encurtar formulários.
- Fontes: `1740887-what-are-field-conditionals`, `1740888-how-to-hide-fields-on-forms-with-conditional-rules`

### 5.2 Estrutura de uma condicional
- Nome + cenário (campo, operador, valor) + ações "se acontecer" (mostrar/ocultar campos X) + ações "se NÃO acontecer" (mostrar/ocultar campos Y).
- Várias condições combinadas por **E** / **OU**, em grupos (ex.: (valor > 1000 E não aprovado) OU (área = Engenharia E não aprovado)).
- Limite: até **300 condições e 300 ações** por condicional.
- Operadores citados: "é igual a", "é maior que" (e menor, para número/moeda). A lista completa não é documentada (ver lacunas).
- Campos de conexão podem servir de fonte, inclusive campos do registro conectado (ex.: "vaga aberta?" vindo do database).
- Fontes: `1740888-how-to-hide-fields-on-forms-with-conditional-rules`, `6579825-how-to-limit-card-creation`

### 5.3 Padrões suportados
- **Cascata (waterfall)**: blocos repetidos de campos que aparecem um após o outro ("Adicionar outra despesa?" = sim mostra o bloco 2, e assim por diante).
- **Trava (lock)**: um campo radio obrigatório **sem opções**, exibido por condicional (ex.: valor > 300). O formulário fica impossível de enviar, o que bloqueia a criação ou atualização.
- Campo oculto por condicional não precisa ser preenchido, mesmo se obrigatório.
- Fontes: `6584774-how-to-create-waterfall-conditionals`, `6584925-how-to-create-locks-in-a-process-with-conditional-fields`

---

## 6. Formulários

### 6.1 Formulário inicial
- Um por pipe. Cada envio cria um card na primeira fase.
- Botão "Formulário" no cabeçalho: editar campos, tornar público e pré-visualizar como convidado.
- Quem edita: admins do pipe (alguns artigos incluem membros; convidados nunca). Salvamento automático.
- Opções avançadas do editor: **título do formulário**, **texto do botão de criar card** e **campo usado como título do card** (só para cards novos).
- Fontes: `614596-create-a-start-form`, `614623-edit-the-start-form`, `614615-how-to-create-and-set-up-your-start-forms`

### 6.2 Formulário público
- Versão pública do formulário inicial, sem login. Pode ser compartilhada por link ou **embutida em site via iframe**.
- Personalização (aba "Visão pública"):
  - ligar/desligar e copiar o link;
  - logo (cortar/redimensionar);
  - título (vazio = nome da empresa) e descrição;
  - texto do botão "Enviar" (a mensagem de confirmação **não** é editável);
  - cor da marca (botão e título);
  - fundo (cor ou imagem de banco de imagens);
  - ocultar a marca do fornecedor (só Enterprise);
  - **permitir mais de um envio** ("enviar outra resposta" na tela de confirmação);
  - **autopreencher com dados de envios anteriores** (nome, e-mail, telefone).
- As mudanças visuais também valem para os formulários de fase públicos.
- Imagens e mensagens entram pelo campo de conteúdo dinâmico.
- Fontes: `614621-what-is-a-public-form`, `1096410-how-to-customize-the-public-form`, `6206877-how-to-embed-a-public-form-on-a-website`

### 6.3 Níveis de compartilhamento do formulário
- "Público para qualquer pessoa com o link" (padrão).
- "Restrito a pessoas selecionadas" (usuários ou grupos); permite incluir no portal da organização.
- "Restrito à organização": todos os membros, via portal.
- A busca do portal só mostra formulários que o usuário pode acessar.
- Editar formulários: só admins do pipe, salvo liberação para outros papéis no painel de admin.
- Fontes: `7833696-how-to-share-forms`, `4363488-how-to-enable-request-tracking`

### 6.4 Central de compartilhamento do pipe
- Botão "Compartilhar" reúne:
  - formulário público (switch, link, embed, personalizar);
  - rastreador de solicitações;
  - adicionar membros;
  - configurar caixa de e-mail (e-mails viram cards);
  - adicionar o formulário a um portal;
  - conectar o formulário a uma fase de outro pipe;
  - permitir que não membros criem cards.
- Fonte: `4173939-how-to-share-public-forms`

### 6.5 Formulário de fase
- Cada fase tem um formulário compartilhável por link, **por card**: card > "Compartilhar" (ao lado da fase atual) > ativar link.
- O envio preenche os campos daquela fase no card (não cria card novo).
- Pode ser enviado como **Tarefa** via template de e-mail (ver 8.3).
- Fontes: `4745472-what-are-phase-forms`, `7833696-how-to-share-forms`

### 6.6 Autenticação do formulário de fase ("Coletar endereços de e-mail")
- Configuração por fase (Opções avançadas); vale para todas as tarefas enviadas da fase.
- Quem abre precisa confirmar o e-mail. Usuário com conta usa o login. Quem não tem conta recebe um link de confirmação válido por **30 minutos**; depois disso, precisa pedir acesso temporário de novo.
- Fontes: `4745472-what-are-phase-forms`, `7039271-what-are-tasks`

### 6.7 Formulário inicial de outro pipe dentro de uma fase
- Numa fase do pipe A, adicionar campo de conexão de pipe apontando para o pipe B com função "criar registro". Quem está na fase preenche o formulário inicial de B a partir do card de A, criando um card filho.
- Configura número de itens conectados, opções avançadas de movimento e de pai/filho, descrição, ajuda e obrigatoriedade.
- Fonte: `4057714-connect-start-forms-to-phases-in-different-pipes`

### 6.8 Formulários de database
- Ver 10.4.

### 6.9 Valores padrão em formulários de portal ou interface
- Ao inserir o elemento Formulário num portal ou interface: "Valores padrão" > escolher os campos a pré-preencher.
- **Fixos** (mesmo valor para todos, ex.: uma opção de dropdown) ou **dinâmicos** (dependem do usuário logado, ex.: nome e e-mail).
- Permite colocar o mesmo formulário várias vezes, cada um com uma categoria diferente.
- Tipos pré-preenchíveis (versão antiga do portal): texto curto, texto longo, dropdown, telefone, numérico, radio, e-mail, etiqueta, checkbox.
- Fontes: `10147802-how-default-values-simplify-repetitive-form-entries-in-your-portal`, `4992682-how-to-pre-fill-specific-form-fields-in-portals`

---

## 7. Portais

### 7.1 Portal (versão nova)
- Para super admins e admins da empresa. Todos os planos. Botão "Portal" no topo; já nasce com um portal de exemplo editável.
- Editor: páginas à esquerda (sub-portais), elementos à direita, arrastar e soltar.
- Elementos:
  - **Texto** (título, subtítulo, descrição);
  - **Link**;
  - **Divisor**;
  - **Página** (publica um sub-portal);
  - **Imagem** (banco, upload ou URL);
  - **Vídeo** (YouTube/Vimeo, tamanho, mostrar ou não os controles);
  - **Formulário** (com descrição; liga/desliga coleta de e-mail para rastreamento; valores padrão).
- Cada elemento pode ser movido, excluído ou duplicado.
- A busca do portal encontra páginas, formulários e o conteúdo dos links.
- Renomear o portal atualiza a barra de navegação de todos.
- Fonte: `9113800-how-to-set-up-the-new-portal`

### 7.2 Compartilhamento e papéis do portal
- Permissões: só membros selecionados, todos da empresa (padrão) ou qualquer pessoa com o link.
- Papéis: Admin do portal (edita e adiciona pessoas) e Somente leitura.
- Formulários dentro do portal seguem a permissão do próprio formulário (um formulário privado só aparece para quem tem acesso).
- Fonte: `9113800-how-to-set-up-the-new-portal`

### 7.3 Sub-portais (páginas) com permissão própria
- Até **50** sub-portais, cada um com permissão própria (pessoas selecionadas, organização ou público com link), independente do portal principal.
- Página nova: nome, descrição, capa e texto alternativo. Pode ser renomeada, duplicada ou excluída.
- O sub-portal só fica visível depois de **publicado** (elemento Página no portal principal). Antes disso, só admins em modo de edição o veem.
- Fonte: `10070139-how-to-manage-multiple-contents-portals-within-the-new-portal`

### 7.4 Identidade visual do portal (portal antigo, também nas páginas de Solicitações e Tarefas)
- Logo (upload, zoom, tamanho), imagem de fundo (JPG/GIF/PNG, até 2 MB), títulos e descrições para Portal, Tarefas e Solicitações.
- Favoritar um formulário (estrela) fixa-o no topo.
- Fontes: `7942252-how-to-customize-portals-with-your-company-s-identity`, `3591333-what-are-portals`

---

## 8. Convidados, tarefas e acompanhamento de solicitações

### 8.1 Tipos de convidado
- **Convidado da empresa** (interno, ex.: funcionário que só abre solicitações) e **convidado externo** (fornecedor, cliente).
- Convidado só vê os formulários liberados para ele (nem a lista de usuários).
- Plano: Business, Enterprise, Unlimited. No Starter: até 10 usuários, todos admins, sem convidados.
- Fontes: `5860403-what-is-pipefy-for-guests`, `6026357-share-forms-with-guests`, `6026339-allow-company-guests-to-create-pipes`

### 8.2 Liberar formulários para convidados
- Por pipe: configurações > quem pode criar cards (admins/membros/convidados da empresa e/ou convidados externos).
- Por empresa: Configurações da empresa > "Formulários permitidos a convidados externos" (adicionar vários; remover com o X). Eles aparecem na Home do convidado.
- Fonte: `6026357-share-forms-with-guests`

### 8.3 Tarefas
- Tarefa = formulário de fase enviado via **template de e-mail** (manual ou por automação). Compartilhar só o link não cria tarefa.
- O destinatário vê a página de Tarefas e preenche o formulário sem enxergar os dados do pipe.
- Até **30 pessoas** por tarefa. No card (Compartilhar) dá para ver quem confirmou o recebimento. Compartilhamento manual do link não lista pessoas.
- "Tarefas e Solicitações" no topo: contador de pendentes ainda não vistas, abas Pendentes e Concluídas, filtro por pipe de origem, busca por título.
- Os dados enviados atualizam o card e ficam no log.
- Fontes: `7039271-what-are-tasks`, `8232959-how-to-complete-tasks`

### 8.4 Rastreador de solicitações (request tracker)
- Só o admin do pipe ativa (na tela de compartilhamento do formulário).
- E-mail do solicitante: vem de um campo de e-mail do formulário (escolher qual, se houver mais de um) ou de "perguntar o e-mail" antes do envio (pode ser obrigatório).
- Sem conta: recebe link autenticado por e-mail. Logado: acompanha em "Tarefas e Solicitações" e não recebe e-mails de rastreio (para evitar redundância).
- Lista: título, status e última atualização; ordenada da mais nova para a mais antiga; busca por título; resolvidas aparecem em outra cor no fim da lista.
- Detalhe: dados enviados, histórico de atualizações (data/hora ao passar o mouse) e Mensagens ("Contatar um agente"). A mensagem notifica a equipe e fica registrada no card.
- Fontes: `4363488-how-to-enable-request-tracking`, `5860453-how-to-make-and-track-requests-in-pipefy`, `8218127-how-to-create-and-keep-track-of-your-requests-in-pipefy`

### 8.5 Migração para o novo portal de solicitações
- O portal antigo foi descontinuado; o conteúdo precisa ser migrado (há guias para admins e para solicitantes).
- Fontes: `9722026-migration-to-the-new-request-portal-guide-for-administrators`, `9740059-migration-to-the-new-request-portal-a-guide-for-requesters`

---

## 9. Conexões

### 9.1 Conceito
- Ligam pipe↔pipe ou pipe↔database para os dados fluírem entre processos.
- **Criar uma conexão concede acesso automático** aos dados do pipe/tabela conectado e aos cards/registros existentes (aviso de segurança da fonte).
- Duas formas de transferir dados entre pipes: conexões (card pai/filho que compartilham dados) e automação de criação de card (exige conexão prévia).
- Fontes: `865712-what-is-a-connection-field`, `726676-transfer-data-from-one-pipe-to-another`

### 9.2 Conexão no nível do pipe ("Adicionar conexão")
- Para super admins e admins; todos os planos.
- Configura: nome da conexão; pipe ou database alvo; **função**:
  - buscar cards/registros existentes e ligá-los ao card pai;
  - criar novos cards/registros no alvo;
  - buscar **e** criar.
- **Quantidade de itens conectados**: um só ou vários.
- **Opções avançadas** (switch): incluem autopreenchimento (4.7) e regras de movimento/pai-filho. A fonte de troubleshooting manda **desligá-las** quando a automação não consegue mover cards conectados, o que sugere que elas condicionam o movimento entre pai e filho (detalhe não documentado; ver lacunas).
- A conexão gera atalhos no card (botão "criar card no pipe X" / "criar registro no database Y").
- Fontes: `619209-connect-pipes-to-databases`, `1664781-edit-fixed-fields-and-card-features`, `2908614-my-automation-is-not-moving-cards-what-can-i-do`

### 9.3 Campo de conexão (nível de fase ou formulário)
- Tipos: "Conexão de pipe" e "Conexão de database".
- Opções: rótulo, alvo, função (buscar e/ou criar), número de itens (único/múltiplo), descrição, ajuda, obrigatório, opções avançadas.
- Depois de criado, dá para filtrar registros "em andamento/ativos" (ligados a um card) ou "concluídos".
- Cards ligados aparecem com o **subtítulo de card conectado** definido no pipe de origem (1.3); registros, com o "layout de resumo" escolhido nas configurações do database.
- Fontes: `619209-connect-pipes-to-databases`, `865712-what-is-a-connection-field`, `807667-how-to-create-databases`

### 9.4 Espelhamento / sincronização de dados
- Card filho criado por conexão "carrega as mesmas informações" do pai; o que é preenchido em um aparece no outro (artigos de automação: "o que você preenche no card 1 é preenchido no card 2 e vice-versa").
- Requisitos para casar campos entre pipes: **mesmo tipo** e, em campos de opção (radio, checklist, select, seleção de responsável, etiqueta), **exatamente as mesmas opções** (maiúsculas, espaços).
- Campos obrigatórios do formulário de destino precisam ser mapeados para campos preenchidos na origem; senão o card filho não é criado.
- Fontes: `5864280-how-to-set-an-automation-for-when-a-card-is-created`, `8057555-how-to-create-automations-to-connect-cards`, `2908557-my-automation-is-not-connecting-cards-what-do-i-do`, `2908614-my-automation-is-not-moving-cards-what-can-i-do`

### 9.5 Remover conexão, desconectar itens
- Desconectar item: ver 3.14. Excluir conexão: citado como artigo relacionado (detalhe não disponível).
- Fonte: `625620-how-to-unlink-connected-cards`

### 9.6 Herança de dados pai → filho por ID (via HTTP)
- Para enviar dados do filho para o pai: guardar o ID do pai num campo de texto curto do filho (via autopreenchimento do atributo "ID") e usar a automação "Fazer requisição HTTP" chamando a API GraphQL (`updateFieldsValues`) com o token do usuário.
- Fonte: `8395471-how-to-send-information-from-a-child-card-to-its-parent-card`

---

## 10. Databases (tabelas)

### 10.1 Criar database
- Home > "Novo database" > nome. **Padrão: público** (qualquer pessoa com o link pode ver); mudar em Configurações > Geral > Permissões.
- Colunas = campos (mesmos tipos de campo), com: obrigatório, descrição, **validação customizada (regex)**, **valor único**, **visualização mínima** (só o rótulo, que expande ao clicar).
- Escolher colunas visíveis na tabela (botão Colunas).
- Fontes: `807667-how-to-create-databases`, `614602-what-is-a-database`

### 10.2 Registros
- Criar: botão "Criar registro" (abre o formulário do database), formulário público do database, conexão com pipe, importação (planilha, API, conector externo), automação.
- Editar: clicar na linha > lápis no campo > salvar. Excluir: abrir registro > ⋯.
- Etiquetas (tags) em registros (Ferramentas > Adicionar tags).
- Fontes: `1302583-how-to-create-and-edit-database-records`, `807667-how-to-create-databases`

### 10.3 Status do registro
- Registros ligados a cards aparecem como "em andamento/ativos" e podem ser filtrados separadamente dos "concluídos" (provavelmente conforme o card conectado chega à fase final; ver lacunas).
- Fonte: `865712-what-is-a-connection-field`

### 10.4 Formulário do database
- Cada database tem formulário inicial (botão "+" azul); editar via "Editar formulário" ou engrenagem; arrastar campos; suporta condicionais.
- Pode virar **público** ("Compartilhar formulário inicial" > switch > link). Quem envia não vê os dados a menos que seja membro.
- Fonte: `8233175-how-to-create-and-edit-database-forms`

### 10.5 Configurações do database
- Renomear, excluir, definir quem acessa (público/privado), **layout de resumo** exibido nas conexões, Autorizações (liberar não admins para criar/editar/excluir registros).
- Fontes: `807667-how-to-create-databases`, `3793714-how-to-add-people-and-edit-permissions-in-databases`

### 10.6 Papéis no database

| Permissão | Admin | Membro | Somente leitura |
| --- | --- | --- | --- |
| Ver registros | sim | sim | sim |
| Criar/editar/excluir registros | sim | só se liberado nas configurações | não |
| Editar colunas, criar/editar/excluir campos | sim | não | não |
| Editar configurações, adicionar pessoas | sim | não | não |
| Exportar registros | sim | não* | não* |
| Excluir database | sim | não | não |

- *Contradição: outro artigo diz que "somente leitura" pode exportar (download). Ver lacunas.
- Admin vê todos os databases da conta (públicos ou privados); membro só os que criou ou dos quais participa e **pode criar databases**.
- Convidar: Membros > Convidar (e-mail ou usuário) com papel; convidar gente de fora pode gerar cobrança.
- Fontes: `3793714-how-to-add-people-and-edit-permissions-in-databases`, `807667-how-to-create-databases`

### 10.7 Exportar database
- Ferramentas > Exportar relatório: todos os dados em planilha Excel.
- Fonte: `807667-how-to-create-databases`

---

## 11. Automações

### 11.1 Modelo e gestão
- Lógica **evento → (condições) → ação**. Tela dividida: "Toda vez que…" (evento) à esquerda e "Faça isto…" (ação) à direita. Ao salvar, dar um nome.
- Só admins gerenciam (do pipe ou da empresa; alguns artigos citam "admin member"); ver as automações de toda a empresa exige ser admin da organização.
- Para automações entre pipes, é preciso ser admin de todos os pipes envolvidos para visualizá-las.
- Lista de automações do pipe: nome, evento, ação, data da última atualização e quem modificou; visões **Card** e **Lista**; busca; filtros por **status (ativa/inativa)**, **evento** e **ação**; ordenação por nome (A–Z/Z–A), mais novas, mais antigas.
- Switch ativa/desativa cada regra.
- **Duplicar** automação (⋯ > Duplicar): a cópia nasce **desativada** para evitar conflito.
- Recomendação oficial: testar após criar ou depois de alterar campos, alertas ou membros (remover pessoas pode quebrar automações).
- Fontes: `686823-how-to-create-automations`, `4991746-how-to-manage-automations-in-pipefy`, `8057555-how-to-create-automations-to-connect-cards`, `6445865-how-pipefy-enumerates-automation-jobs-vs-automation-rules`

### 11.2 Eventos (gatilhos)
1. **Card criado** (por qualquer origem: formulário, conexão, e-mail, integração, importação).
2. **Card entra numa fase** (inclusive a criação, quando entra na primeira fase).
3. **Card sai de uma fase**.
4. **Campo atualizado** (escolher fase e campo; formulário inicial ou de fase).
5. **Todos os cards conectados movidos para uma fase** (exige pipes conectados; dispara quando todos os filhos chegam na fase).
6. **Atividade recorrente**: a cada 30 min, a cada hora, diário (horário em passos de 30 min), semanal (um ou mais dias + horário), mensal (dia do mês + horário). **Horário em UTC.**
7. **Alerta disparado**: card vencido (overdue — exige campo de vencimento), atrasado (late — SLA da fase) ou expirado (expired — SLA do pipe).
8. **E-mail recebido** (caixa do card ou caixa compartilhada), por pipe e fase.
9. **Resposta HTTP recebida** (só existe depois de configurar uma ação "Fazer requisição HTTP"; usa o "JSON schema" informado na ação para expor os campos da resposta).
- Fontes: `686823-how-to-create-automations`, `6272628-set-up-an-automation-event`, `8187324-how-to-create-automations-for-recurring-activities`, `8067742-how-to-create-alert-based-automations`

### 11.3 Condições
- Opcionais; avaliadas sobre os valores de campos do formulário inicial e de fases (ex.: "campo = valor", "criado por X", "vencimento é amanhã").
- **Grupos**: condições no mesmo grupo = E; grupos diferentes = OU.
- Atividade recorrente usa **cenários** em vez de condições: filtros sobre cards (fase atual, responsável, datas com opções "Período", "Relativo" (ex.: exatamente N dias antes/depois) e "Absoluto"). O editor mostra a **lista de cards que atendem ao cenário** naquele momento. Limite de **300 cards por lote**; ao atingir, é preciso reconfigurar.
- Fontes: `781230-what-are-automation-conditions`, `781403-how-to-set-up-automation-conditions`, `7973710-how-to-automatically-send-email-templates-before-or-after-due-dates`

### 11.4 Ações
1. **Enviar template de e-mail** (escolher existente ou criar na hora).
2. **Mover card** para uma fase (do mesmo pipe; outro pipe conectado em alguns cenários). Para atividade recorrente, só "mover card" e "criar card/registro" estão disponíveis.
3. **Atualizar campo de card ou registro**:
   - no próprio card, ou em card/registro conectado (seleciona-se o **campo de conexão**, que deve ter um único item, identificado pelo ID);
   - valor **fixo** ou **dinâmico** (vindo de outro campo, de card conectado ou de atributos do evento/card, como "criado em", "finalizado em");
   - datas relativas (N minutos/horas/dias antes ou depois de um atributo). Contagem em **dias corridos**;
   - serve para responsáveis (incluindo vindos de database), etiquetas, vencimentos.
4. **Criar card ou registro** (em qualquer pipe ou database, mapeando campos).
5. **Criar card ou registro conectado** (exige conexão; mapeamento de campos; autopreenchimento recomendado).
6. **Mover card pai** para uma fase (exige pipes conectados; pai precisa estar livre de obrigatórios pendentes).
7. **Distribuir atribuições**: round-robin ou aleatório entre membros escolhidos, preenchendo um campo de responsável.
8. **Executar fórmula** (Beta, acesso sob pedido; artigo de fórmulas diz plano Business/Enterprise/Unlimited):
   - operadores `+ - * / % ^`; funções SUM, AVERAGE, MIN, MAX, MULTIPLY, DIVIDE, SUBTRACT, COUNT, ROUND; comparações `< > <= >= <> =` (resultado verdadeiro/falso);
   - datas: data ± número = data; data − data = dias; data comparada com data = verdadeiro/falso. Com datas é obrigatório usar símbolos (não funções) e **começar a fórmula pela data**;
   - grava o resultado num campo escolhido.
9. **Fazer requisição HTTP** (Beta; ver 21.3).
10. **Aplicar regras de SLA** (Beta; ver 12.4).
11. **Gerar com IA** (ver 24.2).
- Fontes: `686823-how-to-create-automations`, `6272578-set-up-an-automation-action`, `6825067-how-to-update-cards-and-database-records-using-automation`, `8499961-automated-formulas`, `2109244-how-to-create-automations-for-payment-charges-and-communication-deadlines`, `6589778-how-to-create-automations-to-set-assignees-via-database`

### 11.5 Matriz evento × ação documentada
- Card criado, entra em fase, campo atualizado, todos conectados movidos, alerta, e-mail recebido: criar card/registro, criar conectado, mover pai, atualizar campo, mover card, enviar template.
- Card sai de fase: enviar template (e, segundo outro artigo, mover, atualizar, criar).
- Recorrente: criar card/registro, mover card.
- Resposta HTTP: atualizar campo, nova requisição HTTP, criar conectado, executar fórmula.
- Requisição HTTP pode ser disparada por qualquer evento **exceto recorrente**.
- Fontes: `6272628-set-up-an-automation-event`, `8187420-how-to-create-automations-for-when-cards-leave-a-phase`, `8392669-how-to-create-integrations-with-http-requests`

### 11.6 Logs de automação (Beta)
- Para super admins e admins da empresa/pipe; todos os planos.
- Acesso pela tela de Automações ou dentro de uma regra: status de cada execução (sucesso, falha, em andamento), data/hora, motivo de falha, filtros. Histórico dos **últimos 3 meses**; cada registro abre o detalhe.
- Fonte: `9186536-automation-logs`

### 11.7 Contagem e limites ("jobs")
- **Regras** ilimitadas; **jobs** limitados por mês e plano: Starter 15, Business 300, Enterprise 2.000, Unlimited 15 milhões.
- Cada disparo do evento conta 1 job **mesmo se a condição for falsa** (a verificação conta).
- Recorrente conta a cada verificação (a cada 30 min = 1 job a cada 30 min).
- Excedente: pacotes adicionais (add-ons mensais) ou upgrade.
- Fontes: `6445865-how-pipefy-enumerates-automation-jobs-vs-automation-rules`, `5419654-what-to-do-when-reaching-your-automation-integration-or-api-limit`

### 11.8 Motivos comuns de falha (regras de validação a replicar)
- Mover: campo em formato inválido (e-mail/telefone ficam vermelhos); obrigatórios pendentes na fase de origem (inclusive no formulário inicial, quando a regra move logo após a criação); opções avançadas da conexão ativas; card filho exige campos que o pai não forneceu; opções de seleção diferentes entre pai e filho.
- Criar conectado: pipes não conectados; opções divergentes; obrigatórios do destino mapeados para campos vazios na origem.
- Fontes: `2908614-my-automation-is-not-moving-cards-what-can-i-do`, `2908557-my-automation-is-not-connecting-cards-what-do-i-do`

### 11.9 Receitas documentadas (combinações úteis para testes de aceitação)
- Lembrete N dias antes do vencimento: recorrente (a cada 30 min) move cards cujo vencimento está "exatamente N dias à frente" para a fase "Lembrete", e outra regra "entra na fase" envia o template.
- Escalonar vencidos: alerta "vencido" → atualizar responsável ou mover para fase crítica.
- Aprovadores por departamento: database de aprovadores (3 campos de responsável) + conexão obrigatória de item único + regra por fase "entra na fase → responsável = valor dinâmico do registro".
- Etiquetas automáticas por condição.
- Fontes: `7973710-how-to-automatically-send-email-templates-before-or-after-due-dates`, `2843989-how-to-assign-overdue-demands-to-your-team-manager-automatically`, `2844086-how-to-move-overdue-cards-to-another-phase-with-automation`, `6589778-how-to-create-automations-to-set-assignees-via-database`, `6467400-how-to-add-labels-to-cards-automatically`

---

## 12. Alertas, SLA e notificações

### 12.1 Alerta de vencimento (overdue)
- Baseado na data de vencimento do card (campo fixo ou campo "Data de vencimento" no formulário). Pode ficar vazio e ser preenchido depois; salva ao escolher no calendário.
- Cores: **cinza** (há tempo), **amarelo** (vencimento se aproximando), **vermelho** (vencido). Aparece no topo do card aberto e no rodapé do card fechado.
- Fonte: `625596-set-up-alerts-in-the-pipe`

### 12.2 Alerta de atraso (late): SLA por fase
- Fase > engrenagem > Opções avançadas > tempo máximo na fase em minutos, horas ou dias.
- Card atrasado mostra relógio amarelo; ao lado do nome da fase aparece um relógio amarelo com a **contagem de cards atrasados**.
- Fonte: `625596-set-up-alerts-in-the-pipe`

### 12.3 Alerta de expiração (expired): SLA do pipe
- Configurações do pipe > tempo máximo até chegar a uma fase final (min/h/dias).
- Relógio vermelho no card e contagem de expirados ao lado do nome da fase.
- Opção "somente dias úteis" vale para todos os tipos de alerta.
- Regra de borda: depois que um card fica atrasado ou expirado, **mudar o SLA não remove o alerta**. A nova configuração só vale para cards novos ou quando o card entra pela primeira vez numa fase com SLA.
- Fontes: `625596-set-up-alerts-in-the-pipe`, `8067742-how-to-create-alert-based-automations`

### 12.4 Regras avançadas de SLA (ação de automação, Beta)
- Para admins do pipe; todos os planos.
- Configura: **semana de trabalho** (dias e horário de expediente), **feriados** (lista com nome e data), **fuso horário** (padrão = fuso do usuário), **campo de vencimento de destino**, **data inicial** (ex.: criação do card) + prazo em min/h/dias.
- Resultado: o vencimento é calculado em horas úteis (ex.: 5 horas úteis após a criação).
- Fonte: `8809636-advanced-sla-rules`

### 12.5 Timers no card
- Três relógios pequenos: desde a criação, tempo na fase atual e última atualização. Mostrar/ocultar nas configurações da empresa.
- Fonte: `625596-set-up-alerts-in-the-pipe`

### 12.6 Notificações
- Sino in-app: menções, e-mails recebidos, progresso de solicitações, versão de pipe gerada etc.
- E-mails de notificação personalizáveis por usuário (preferências da conta; ver 19.2).
- Indicar no card que chegou e-mail novo (ver 13.6).
- Fontes: `3574227-how-to-customize-your-pipefy-s-email-notifications`, `4363488-how-to-enable-request-tracking`, `16822013-save-and-download-a-version-of-your-pipe-s-setup`

---

## 13. E-mail

### 13.1 As três ferramentas
- **Caixa compartilhada do pipe**, **caixa de e-mail do card** e **templates de e-mail**. Servem para falar com quem tem ou não conta e podem criar ou atualizar cards.
- Fonte: `900099-what-are-pipefy-s-email-tools`

### 13.2 Endereços de e-mail
- **Cada pipe** tem um endereço único gerado aleatoriamente; **cada card** também tem um endereço único. Respostas enviadas ao endereço do card ficam registradas na aba de e-mails do card.
- Remetente padrão: domínio do fornecedor. Endereço personalizado via SMTP (ver 13.9).
- Fontes: `4378163-create-edit-and-send-email-templates`, `5317609-how-to-redirect-an-external-email-address-to-a-pipe-email`

### 13.3 Caixa compartilhada (Shared Inbox)
- Aba "E-mails" no cabeçalho do pipe; todos os membros do pipe acessam.
- Quatro áreas: menu lateral, lista de recebidos e enviados, leitor/compositor e painel direito com dados do card (dá para mover o card de fase ali mesmo).
- Compor: "Escrever e-mail" > escolher o card ao qual o e-mail fica vinculado (ou "+ Novo" para criar card) > formatação, anexos, imagens, links, assinatura, template.
- No e-mail aberto: etiquetas, responsáveis e vencimento, que **alteram o card vinculado**.
- Lido por um membro = lido para todos.
- Responder com template ("Aplicar template").
- Fontes: `5301189-configure-a-shared-inbox`, `3016822-how-to-add-attachments-to-an-email`

### 13.4 E-mail recebido cria card
- Configurações de e-mail > ligar o endereço do pipe > Opções avançadas: mapear partes do e-mail para campos do formulário inicial.
- Tipos exigidos: nome do remetente, destinatário, cc e assunto → texto curto; e-mail do remetente → e-mail; corpo → texto longo; anexos → anexo.
- Aviso de segurança: qualquer e-mail recebido vira card.
- Plano: todos. Para admins e super admins.
- Fontes: `614649-create-new-cards-from-received-emails`, `5301189-configure-a-shared-inbox`

### 13.5 Redirecionar e-mail externo para o pipe
- Redirecionar (não "encaminhar") uma caixa do Gmail ou Outlook para o endereço do pipe. O Gmail envia um e-mail de confirmação, que aparece na caixa do pipe para validar.
- Resposta "responder a todos" inclui o endereço do pipe e pode gerar **loop de criação de cards** (aviso).
- Remetente personalizado só em Enterprise; Starter e Business usam o endereço do pipe.
- Fonte: `5317609-how-to-redirect-an-external-email-address-to-a-pipe-email`

### 13.6 Caixa de e-mail do card
- Card aberto > ícone de e-mail. Campos: nome (editável), De (fixo: usuário + empresa; o endereço do card aparece ao passar o mouse; muda só com endereço personalizado), Para, Cc, Cco, Assunto, Corpo (imagens, links, cor, tamanho de fonte, anexos).
- Responder, responder a todos e encaminhar. Respostas aparecem na aba E-mails do card.
- E-mails disparados por automação ficam marcados com uma etiqueta própria na caixa do card.
- Indicador de "e-mail novo" no card fechado: não é nativo. A receita oficial usa checklist com emoji + automação "e-mail recebido → marcar" + campo como subtítulo + filtro pelo emoji (uma regra por fase).
- Fontes: `900230-how-to-use-a-card-s-email-box`, `4378163-create-edit-and-send-email-templates`, `2882708-how-to-show-that-a-card-has-received-new-emails`

### 13.7 Templates de e-mail
- E-mails > Templates > "Criar novo template". Para super admins e admins; todos os planos.
- Campos: nome do template, remetente, destinatários (Para, Cc, Cco), assunto e corpo.
- **Campos dinâmicos** em assunto, remetente, destinatários e corpo (ID do card, URL, título, e-mails, nomes, campos de qualquer fase, "link da fase atual" = formulário da fase, "link da tarefa"). Máximo de **100 campos dinâmicos** por template. Campo vazio vira texto vazio.
- Editor visual (WYSIWYG) + editor de HTML. HTML suportado: h1–h3…, p, br, alinhamento, negrito/itálico/sublinhado/tachado/marcado, cor de texto e de fundo via style, listas, tabelas, imagens por URL (largura máxima de 536 px; GIF animado aceito), links. Templates antigos com HTML inválido podem ser "sanitizados" automaticamente ao abrir no editor visual.
- Imagens enviadas pelo editor **expiram em 30 dias** (medida de segurança); para imagem permanente, usar URL externa no HTML.
- Imagem a partir de um campo de anexo: `<img src="{{campo_anexo}}">` (uma imagem por campo de anexo); pode ser clicável combinando com um link.
- **Configurações de idioma**: formato de data, moeda e número; **fuso horário** por template (padrão GMT 00:00) para campos de data/hora.
- Editar: ⋯ > Editar; "Salvar como" cria cópia; "Salvar e fechar" sobrescreve.
- Envio manual pelo card ("Usar um template" substitui o que estava sendo escrito) ou automático (ver 11.4).
- Fontes: `4378163-create-edit-and-send-email-templates`, `726710-adding-dynamic-fields-to-email-templates`, `1343081-how-to-customize-email-templates-html-and-markdown`, `4365765-what-to-do-when-an-email-template-contains-unsupported-html-code`, `5476775-how-to-add-images-as-attachments-in-email-templates-through-html-code`, `6887529-set-up-time-zones-in-email-templates`

### 13.8 Template padrão
- Configurações de e-mail > "Template padrão": todo e-mail composto manualmente no pipe já nasce com destinatário, remetente, Cc, Cco, assunto e corpo do template; só os campos dinâmicos variam. O template aparece com a marca "padrão". Só admin configura.
- Fonte: `5775619-setting-an-email-template-as-a-default`

### 13.9 Respostas prontas (canned responses)
- Por pipe. Cada resposta tem nome, categoria e corpo (todos obrigatórios); aceita campos dinâmicos; dá para favoritar (favoritas aparecem primeiro); gerenciar (criar/editar/excluir) dentro do card.
- Inserida acima da assinatura. Só admin do pipe cria e edita.
- Fonte: `3560434-what-are-canned-responeses`

### 13.10 Assinatura de e-mail
- **Uma por usuário**, igual em todos os pipes; editor com texto, imagens (sem redimensionar no editor), links ou HTML. Inserida no fim de cada e-mail manual e removível no e-mail.
- Fonte: `3535008-how-to-set-up-an-email-signature`

### 13.11 Endereço remetente personalizado (SMTP)
- Admin da empresa: Preferências > Configurações de e-mail > E-mail personalizado > adicionar: nome do remetente (padrão: usuário + empresa), endereço, servidor SMTP (host, porta, usuário, senha). O primeiro servidor vira padrão da empresa; depois é possível um servidor por endereço.
- Requisitos: autenticação LOGIN, TLS 1.0+, liberar IPs do fornecedor, conta **sem MFA**.
- Microsoft: conexão via **OAuth 2.0** ("Conectar com Microsoft"), com opção de escolher um pipe para criar cards com os e-mails recebidos naquele endereço; definir o endereço padrão da organização.
- O "Responder para" continua sendo o endereço do card/pipe, para capturar respostas.
- Plano: Enterprise/Unlimited (artigo de 2025 diz "disponível a todos os clientes"; ver lacunas).
- Fontes: `2704736-how-to-set-up-a-custom-email-address-via-smtp`, `11542778-send-emails-more-securely-and-easily-using-your-own-smtp-server`, `4366835-how-to-set-email-template-automations`

### 13.12 Limites de envio
- Até **10 destinatários** somados (Para + Cc + Cco) por mensagem, salvo com SMTP próprio.
- Envio manual pelo domínio do fornecedor: **2 e-mails por minuto**.
- Automação de template: até 10 endereços = 1 job.
- Diretrizes antispam: opt-out obrigatório, sem listas compradas; o fornecedor pode suspender o envio.
- Fontes: `5977983-pipefy-s-email-guidelines`, `4378163-create-edit-and-send-email-templates`, `4366835-how-to-set-email-template-automations`

### 13.13 E-mails via API para relatórios
- Consulta de e-mails por card (`inboxEmails`, filtro opcional pelo usuário atual).
- Fonte: `12590602-how-to-collect-email-data-for-reporting`

---

## 14. Visualizações, busca e filtros

### 14.1 Troca de visualização
- Kanban, Lista, Calendário. A escolha é **por usuário** e lembrada (a última usada volta como padrão para ele); não afeta os outros. O admin define o padrão do pipe (1.3).
- Fonte: `3143190-choosing-pipe-views`

### 14.2 Kanban
- Colunas = fases; cards fechados mostram título, subtítulos, etiquetas, responsáveis e alertas; arrastar entre fases; contadores de atrasados/expirados no cabeçalho da fase.
- Fontes: `6004057-what-is-kanban-view`, `625596-set-up-alerts-in-the-pipe`

### 14.3 Lista
- Tabela com colunas escolhidas (título, subtítulos, fase, responsáveis, datas, etiquetas…); clicar numa célula abre o card; filtrar; ações em massa (3.11).
- **Conexões não aparecem** na lista.
- Fonte: `6004107-what-is-list-view`

### 14.4 Calendário
- Mostra só cards com data de vencimento; ativado como app (ver 22.1).
- Fontes: `3143190-choosing-pipe-views`, `724040-how-to-enable-the-calendar-app`

### 14.5 Ordenação por fase
- Admin do pipe: ⋯ da fase > "Ordenar cards da fase": vencimento, data de criação, última atualização, alfabética (título) ou manual. Fase por fase (não há ordenação global).
- Fonte: `2908931-how-to-sort-your-pipe-s-cards`

### 14.6 Filtros e busca no pipe
- Filtro: condições por fase, responsáveis ("atribuído a mim"), etiquetas, status de e-mail e campos customizados; grupos de condições E/OU; **máximo de 5 condições por filtro** (somando todos os grupos); "Limpar tudo".
- Busca textual: título, subtítulo ou qualquer informação visível do card; resultado instantâneo.
- Filtros salvos: não documentados (ver lacunas).
- Fonte: `2371316-how-to-filter-and-search-cards`

### 14.7 Meu trabalho (cards atribuídos a mim)
- Botão na Home: todos os cards do usuário, com seções **perto do vencimento**, **vencidos**, **atrasados**, **expirados** e **concluídos**.
- Colunas: título, vencimento, pipe, fase atual, criado em; clicar abre o card.
- Fonte: `1602018-how-to-find-all-cards-assigned-to-you`

### 14.8 Home: busca e favoritos
- Barra de busca de pipes e databases pelo título; estrela favorita (por usuário) fixa no topo da lista.
- Fonte: `3541073-search-for-specific-pipes-and-databases`

### 14.9 Atalhos de teclado
- Lista no menu do perfil, agrupada em pipe, formulário inicial, card e database; não funcionam enquanto se edita campo ou configurações; não são customizáveis.
- Fonte: `1401187-how-to-use-keyboard-shortcuts`

---

## 15. Relatórios

### 15.1 Relatório de pipe
- Para super admins, admins e membros; todos os planos. Aba "Relatórios" > "Adicionar relatório".
- Colunas padrão: Título, Fase atual, Criador, Criado em. Cada linha = um card.
- Botão Colunas: atributos do card + campos do formulário inicial e das fases. Colunas especiais: **Expirado em** ("Desconhecido" se não expirou) e **Vencido** (Sim/Não).
- Filtros com E/OU; operadores "é", "não é", "é desconhecido", "tem qualquer valor". Datas: **Período** (hoje, semana atual, semana anterior…), **Relativo** (menos de / exatamente / mais de N dias atrás ou à frente) e **Absoluto** (antes / depois / em uma data).
- **Fórmula**: soma, média, mínimo e máximo sobre campos numéricos e de moeda.
- **Salvar relatório** = salvar a configuração; dados se atualizam sozinhos. Editar (⋯ > Editar) e excluir (⋯ > Excluir, com confirmação).
- **Exportar** planilha (download ou envio por e-mail); máximo de **30.000 linhas** (o excedente é cortado).
- Fontes: `619293-what-are-pipe-reports`, `619297-how-to-create-pipe-reports`, `625628-how-to-edit-pipe-reports`, `625875-how-to-delete-pipe-reports`

### 15.2 Relatório da empresa (multi-pipe)
- Menu do perfil > Relatórios da empresa. Por padrão só admins da empresa; outros papéis podem ser liberados no painel de admin.
- Escolher pipes (só os de que o usuário participa) + filtros sobre **atributos gerais** de card (título, fase, responsável, criado/atualizado/finalizado em, criador, último comentário, pipe) com E/OU; colunas; salvar; exportar XLSX ou por e-mail.
- Visibilidade: outro admin só vê o relatório salvo se for membro de **todos** os pipes usados.
- Limite de exportação: 30.000 linhas.
- Fontes: `1698930-what-are-company-reports`, `1723103-how-to-create-company-reports`

### 15.3 Link de download de relatório via API
- Gerar exportação de relatório e obter o link pela API.
- Fonte: `8658498-how-to-generate-reports-download-link-via-api`

---

## 16. Dashboards e análises

### 16.1 Dashboards por pipe
- Aba "Dashboards" no pipe; vários dashboards por pipe; começar do zero ou de um exemplo.
- Gráfico = **medida** (numérica: contagem de cards, anexos, comentários, responsáveis; lead time do pipe; tempo na fase; soma, total acumulado, média, mínimo e máximo de campos numéricos de cards e de registros conectados) + **dimensão** (qualitativa: título, etiqueta, fase atual, responsável…; sem limite de dimensões) + **grupo de tempo** (últimos 7 dias, mês anterior, todo o período…; vazio = desde a criação do pipe) + **filtros** (ex.: "finalizado em = data").
- Formatos: área, barra, calendário, linha, número, pizza, dispersão, tabela.
- Drill-down: clicar no gráfico lista os cards por trás do dado, com link para cada card.
- Sincronização em tempo real.
- Fontes: `5610976-what-are-dashboards`, `6047064-how-to-create-dashboards`

### 16.2 Dashboards Basic vs Pro
- Basic (todos os planos, grátis): dashboards padrão vindos de templates; admins e membros do pipe veem.
- Pro (Business/Enterprise/Unlimited; cobrança por usuário/mês): dashboards customizáveis, linhas de database ilimitadas, **permissões por dashboard**: "Ver e editar", "Somente leitura", "Não mostrar".
- Fonte: `5610976-what-are-dashboards`

### 16.3 Análise com IA (AI Analytics)
- Botão "IA" no canto do pipe: chat sobre o desempenho do processo (gargalos, tempo por fase, contagens) com perguntas sugeridas e modo tela cheia. Sugere mudanças (novas fases/campos), mas não cria processos nem faz previsões.
- Fonte: `10839236-how-to-extract-insights-with-pipefy-ai-analytics`

### 16.4 Linha do tempo do card (com métricas)
- Card > Atividades > "Ver linha do tempo". Cabeçalho com métricas: **duração do card**, **fases visitadas**, **% de atividades automatizadas**, **handoffs** (trocas de responsável) e **gargalo** (fase com mais tempo).
- Linha do tempo cronológica ancorada nas fases: o que aconteceu, quando e quem disparou (usuário, automação ou agente de IA).
- Todos os planos; admins e membros.
- Fonte: `15445139-how-to-view-a-card-s-activities-on-a-timeline`

---

## 17. Atividades e auditoria

### 17.1 Atividades do pipe (Gerenciar > Atividades)
- Duas abas: **Atividade de cards** (admins e membros) e **Alterações de configuração** (só admins).
- Cada entrada: quem, o quê, quando; busca por usuário; coluna "Tipo de recurso".
- Navegação na interface: até **180 dias**. Exportação CSV (só admins): **últimos 30 dias, sem o dia atual**, abas combinadas num arquivo.
- Eventos de configuração registrados:
  - **Agentes de IA**: criado, ativado, desativado, excluído, configurações alteradas.
  - **Automações**: criada, ativada, desativada, excluída, configurações alteradas, gatilho trocado (de/para), tipo de ação trocado (de/para).
  - **Membros**: convidado (com papel), removido, papel alterado (antes/depois), grupo convidado/removido/papel alterado, usuário entrou.
  - **Campos**: criado, excluído, alterado, arquivado, restaurado; campo de conexão criado/alterado/excluído; pipe conectado/desconectado via campo.
  - **Condicionais**: criada, alterada, excluída, reordenada.
  - **Fases**: criada, excluída, marcada/desmarcada como final, criação de card habilitada/desabilitada, SLA alterado (de/para), renomeada, reordenada.
  - **Templates de e-mail**: criado, alterado, excluído.
  - **Etiquetas**: criada, alterada, excluída.
  - **Conexões**: criada, alterada, excluída.
  - **Pipe**: criado, renomeado, tag adicionada/removida, ícone/cor, nome do objeto, texto do botão, SLA do pipe, clonado (destino), campo de título alterado.
  - **Compartilhamento**: status do formulário inicial alterado.
- Eventos de card: criado (manual ou via automação/conexão), excluído, finalizado, movido (de/para), marcado como atrasado, vencido ou expirado, card conectado criado, card conectado a outro (mesmo pipe ou outro pipe), comentário adicionado/excluído, e-mail enviado/recebido/lido/não lido, link público do formulário de fase habilitado/desabilitado.
- Previstos (ainda não existem): alteração de valor de campo, responsáveis, anexos, checklists, etiquetas no card, e-mails excluídos, apps/integrações.
- Fonte: `15062678-activities-for-pipes-and-cards`

### 17.2 Histórico no card
- Seção Atividades do card: comentários + registro de tudo que acontece (atualizações de informação e mudanças). Não pode ser oculta.
- Fontes: `614605-what-is-a-card`, `1030711-how-to-customize-the-open-card-view`

---

## 18. Permissões e papéis

### 18.1 Três camadas independentes
- O papel na **empresa**, no **pipe** e no **database** são separados; a mesma pessoa pode ter papéis diferentes em cada pipe ou database.
- Plano: papéis além de admin exigem Business, Enterprise ou Unlimited (Starter: até 10 usuários, todos admins).
- Fontes: `6027079-company-roles-and-permissions`, `614597-pipe-roles-and-permissions`

### 18.2 Papéis da empresa e permissões padrão

| Permissão | Super admin | Admin | Membro | Convidado da empresa | Convidado externo |
| --- | --- | --- | --- | --- | --- |
| Convidar e remover pessoas, menu de membros, painel de admin, atividades da empresa | sim | sim | não | não | não |
| Criar relatórios da empresa | sim | sim | sim | não | não |
| Criar pipes / databases | sim | sim | sim | não (liberável) | não |
| Excluir pipes / databases | sim | sim | não | não | não |
| Automações e agentes de IA (acessar, criar, editar, excluir) | sim | sim | sim | não | não |

- Permissões de admin, membro e convidado da empresa podem ser ajustadas no painel de admin. Super admin e convidado externo não podem ser alterados.
- Convidados não entram em pipes nem databases; só abrem solicitações pelos formulários liberados.
- Admin vê todos os pipes, databases, automações, relatórios e configurações. Membro vê pipes públicos e privados para os quais foi convidado.
- Cobrança: super admin, admin e membro são pagos; convidados não. Convidado adicionado a um card ou pipe passa a ser cobrado.
- Fontes: `6027079-company-roles-and-permissions`, `6093562-differences-between-company-guest-and-external-guest`, `12634763-user-roles-in-pipefy-and-the-associated-costs`, `8233108-how-does-pipefy-charge-per-person-in-the-company`

### 18.3 Papéis do pipe
- **Admin do pipe**: tudo, incluindo configurações.
- **Membro**: cria cards, vê, edita e move todos os cards.
- **Visão restrita**: cria cards; vê e edita só os cards que criou ou em que é responsável.
- **Somente leitura**: vê todos os cards e comenta.
- Visão restrita e somente leitura **não podem excluir** nem os próprios cards.
- Pipe público: membro da empresa que entra vira membro do pipe; admin da empresa vira admin do pipe. Pipe privado: só admins da empresa ou convidados.
- Na API os papéis se chamam `admin`, `member`, `read_and_comment` e `my_cards_only` (a fonte associa os dois últimos de forma ambígua; ver lacunas).
- Fontes: `614597-pipe-roles-and-permissions`, `614632-how-to-add-members-to-a-pipe`, `8659535-how-to-bulk-invite-pipe-members-via-api`

### 18.4 Convidar membros para o pipe
- Gerenciar > Membros > Convidar: e-mail ou nome de usuário (ou "+ adicionar mais pessoas" para e-mails novos); depois escolher o papel.
- Por padrão só admins da empresa adicionam membros ao pipe.
- Convidar alguém de fora o adiciona à empresa (pode gerar cobrança).
- Fonte: `614632-how-to-add-members-to-a-pipe`

### 18.5 Papéis personalizados
- Super admin, no painel de admin: "Criar papel" com nome (até 120 caracteres) e descrição (até 140), partindo do zero ou copiando um papel pré-definido.
- Permissões ligadas/desligadas por categoria: painel de admin, pipes, databases, automações. Aba Pessoas para atribuir usuários.
- Editar, duplicar ou excluir (irreversível). Os pré-definidos não podem ser excluídos, só duplicados.
- Papel personalizado é **sempre cobrado**, mesmo que pensado para convidados.
- Plano: Business, Enterprise, Unlimited.
- Fonte: `6418478-how-to-create-custom-roles`

### 18.6 Atribuição em massa a papéis
- "Atribuir usuários" > "Adicionar em massa": colar e-mails (um por linha), até **1.000** por vez (mais que isso via API). Quem já existe é atribuído; quem não existe é convidado. Resultado chega por e-mail.
- Fonte: `6463836-assign-people-to-roles-in-bulk`

### 18.7 Grupos de usuários
- Membros > Grupos > Criar grupo (nome, descrição) > adicionar usuários.
- Convidar um grupo para um pipe com um papel; adicionar alguém ao grupo dá acesso a todos os pipes do grupo.
- Conflito de acesso individual vs grupo: vale o **maior** nível.
- Grupo com convidados: só se marcado "Permitir convidados" **na criação** (não muda depois); convidados no grupo só veem o formulário inicial.
- Donos do grupo: o criador + até **3 donos** no total. Donos editam nome/descrição, membros, permissões e donos.
- Plano: Business, Enterprise, Unlimited.
- Fonte: `8461497-groups-of-users-in-pipefy-easily-manage-permissions`

### 18.8 Permissões em portais, interfaces, dashboards e databases
- Portal: admin do portal / somente leitura; permissão por portal e por sub-portal (7.2, 7.3).
- Interface: admin / editor (23.3).
- Dashboard Pro: ver e editar / somente leitura / não mostrar (16.2).
- Database: admin / membro / somente leitura (10.6).

### 18.9 Restrições no nível de card e campo
- "Editar só cards em que sou responsável" (1.3), "só admins excluem" (1.3), "visão restrita" (18.3), campo "editável em outras fases" (4.1).
- Permissão por fase ou por campo além disso não é documentada (ver lacunas).

---

## 19. Organização, conta e segurança

### 19.1 Configurações da empresa
- Nome da empresa (aparece em portais e formulários).
- Logo: JPG/PNG/GIF até 2 MB, com zoom e ajuste; GIF fica estático.
- Liga/desliga **timers** nos cards (tempo no pipe, na fase e desde a última atualização), para todos os processos.
- Formulários liberados para convidados externos.
- SSO (Enterprise).
- **Excluir a empresa** (super admin ou admin; apaga pipes, cards e usuários; irreversível).
- Fontes: `614624-how-to-modify-company-settings`, `2887093-how-to-add-a-logo-to-your-company-s-account`

### 19.2 Preferências da conta (usuário)
- Geral: nome, nome de usuário, e-mail, idioma, **fuso horário**, senha, MFA, chave de API, excluir conta (irreversível).
- Aba Automações (admins): todas as automações da empresa.
- **Notificações por e-mail**, em três grupos: (1) adicionado a pipe/equipe, mencionado ou dono de card; (2) card movido, expirado ou atrasado; (3) novo comentário ou checklist. Podem ser globais ou **personalizadas por pipe**; há botão para desligar tudo. Notificações do app móvel não são configuráveis.
- Regras para o e-mail sair de fato: notificação ligada na conta **e** no pipe; para movimentos e comentários, a pessoa precisa ser responsável ou já ter interagido no card; notificações de vencimento só vão para o responsável.
- Token de acesso pessoal (ver 21.1).
- Fontes: `619496-how-to-modify-account-preferences`, `3574227-how-to-customize-your-pipefy-s-email-notifications`

### 19.3 Gestão de membros da empresa
- Convidar (e-mail + papel); o convidado recebe link para criar credenciais. Admins (e membros, se liberado) convidam.
- Remover: só admins da empresa. A pessoa sai de todos os pipes e recebe e-mail.
- Convites sugeridos: o sistema lista solicitantes frequentes para convidar ("Convidar todos").
- Convite em massa: até 1.000 e-mails.
- Fontes: `6027101-add-new-members-to-your-company-s-account`, `614626-how-to-delete-members-from-a-company-s-account`, `6167924-manage-guest-users`, `9532592-admin-panel-alpha`

### 19.4 Painel de admin
- Para super admins e admins da empresa (em liberação gradual).
- **Geral**: nome, logo, ocultar a marca do fornecedor no cabeçalho e o selo "powered by" em formulários e portais (Enterprise), timers.
- **Cobrança**: plano, custo, usuários, renovação, upgrade, add-ons, cancelar, forma de pagamento, faturas.
- **Membros e permissões**: membros, papéis, grupos, convites sugeridos.
- **Estatísticas de uso**:
  - Pipes: nome, ID, criação, criador, última atualização, membros, cards criados, concluídos, automações, condicionais, relatórios; com busca e download;
  - Automações: jobs no mês, tarefas de IA, relatórios de 3 meses, gráficos, status por regra; atualização a cada 5 h;
  - Chamadas de API: por mês, com download;
  - Usuários: pagos vs gratuitos.
- **Atividades**: tudo que acontece na conta (cards criados ou excluídos, alertas, ações do robô…).
- **Configurações de e-mail** (SMTP).
- Fontes: `9532592-admin-panel-alpha`, `8913118-usage-statistics`

### 19.5 Alertas de consumo
- E-mails automáticos para admins quando o uso chega a **80%, 90%, 100% e 150%** do contratado.
- Webhook de organização `usage.threshold_reached` com recurso, limite atingido, consumido, total, percentual e data de renovação.
- Fonte: `16986836-how-to-track-your-account-usage-limits-webhooks-email`

### 19.6 Marca própria (white label)
- Enterprise: logo próprio, ocultar a marca do fornecedor no ambiente e o selo "powered by" em formulários e portais.
- Fonte: `8365213-pipefy-white-label-bring-your-company-s-brand-to-the-pipefy-environment`

### 19.7 MFA (autenticação de dois fatores)
- Enterprise. TOTP com apps autenticadores; ativa em Preferências (switch); gera **códigos de recuperação** (imprimir ou salvar); QR code + código de 6 dígitos.
- Recuperação: "Não consigo entrar" > recuperar 2FA > e-mail > código de recuperação, com opção de manter MFA (reconfigurar o app) ou desligar. Cada código de recuperação vale uma vez.
- Fonte: `2527885-how-to-enable-multi-factor-authentication`

### 19.8 SSO corporativo
- Enterprise, configurado com o suporte. O login detecta o domínio do e-mail e redireciona ao provedor. Opção "somente SSO" desliga e-mail e senha.
- Tipos: Azure nativo (autentica e autoriza, com provisionamento) e SAML (só autentica; acesso continua controlado na plataforma).
- **Provisionamento**: usuário do IdP sem conta entra automaticamente como **convidado da empresa**. Grupos do IdP são sincronizados a cada login e não são editáveis na plataforma.
- Integrações de diretório: Azure AD e JumpCloud para criar e remover membros.
- Fontes: `2527875-how-to-enable-and-use-enterprise-single-sign-on-sso`, `8709382-groups-and-users-provisioning-in-pipefy`, `5978255-add-and-delete-company-members-with-azure-ad`, `6062533-manage-company-members-with-jumpcloud`

### 19.9 Contas de serviço
- Super admin; Business, Enterprise e Unlimited. Conta não humana para integrações, com token **com expiração** e fluxo de renovação. Não ocupa assento pago se gerida só pela área de contas de serviço; se convidada como membro, passa a ser cobrada.
- Fonte: `9027789-service-accounts`

### 19.10 Outros
- Senha: redefinir; desbloquear conta bloqueada; e-mail de convite ("aceitar convite"); trocar de empresa (um usuário pode pertencer a várias).
- Fontes: `8282785-how-to-reset-your-password`, `8282799-how-to-unblock-your-account`, `6496003-how-to-accept-an-invitation-to-join-pipefy`, `5860403-what-is-pipefy-for-guests`

---

## 20. Importação e exportação

### 20.1 Importador de planilhas (app)
- Admin do pipe habilita em Ferramentas > Apps > Importador; aparece um ícone no cabeçalho. Usam membros e admins. Todos os planos.
- Destino: o próprio pipe ou um **database conectado**. Só **.xlsx**. Cada linha vira um card ou registro; casar colunas com campos.
- Campos **obrigatórios não podem receber importação** (a fonte diz "qualquer campo, desde que não seja obrigatório").
- Planilha sem células mescladas, filtros ou formatação condicional; célula vazia vira campo vazio.
- Formatos por tipo:
  - responsável: usuário, e-mail (minúsculas) ou ID, separados por vírgula;
  - checklist, dropdown e radio: opções separadas por vírgula, sem espaço;
  - conexão: ID do card ou registro (um por campo);
  - data: DD/MM/AAAA ou MM/DD/AAAA, conforme o idioma;
  - data e hora: `DD/MM/AAAA 00:00`;
  - e-mail: minúsculas;
  - etiqueta: nome ou ID, separados por vírgula;
  - número: sem formatação;
  - telefone: DDI + número, só dígitos;
  - hora: `00:00:00 PM`.
- Não importa: anexos, IDs de card, conteúdo dinâmico.
- Fontes: `2446394-how-to-import-data-from-spreadsheets`, `2446675-preparing-spreadsheets-for-the-importer-app`, `6904523-how-to-import-data-into-a-pipe`, `726697-how-to-import-data-into-a-database`

### 20.2 Exportações
- Relatório de pipe ou empresa: XLSX ou e-mail, até 30 mil linhas (15).
- Database: Ferramentas > Exportar (10.7).
- Elementos de dados em Interfaces: exportação controlada por papel (23.2).
- Logs de atividades: CSV de 30 dias (17.1).
- Versão do pipe: JSON (1.6).
- PDF do card (22.3).

---

## 21. Integrações, API e webhooks

### 21.1 API GraphQL e tokens
- API GraphQL com queries e mutations; IDE pública (GraphiQL) já autenticada. Endpoint externo exige token Bearer.
- **Token de acesso pessoal**: mesmas permissões do usuário; definir a **organização de cobrança** do token (quem paga as chamadas). Recomenda-se conta de serviço.
- Usos documentados: atualizar cards em massa (sugestão: no máximo 30 por vez para evitar bloqueio), limpar campos em massa, excluir cards em massa (`deleteCard`), convidar membros em massa (`inviteMembers`), atualizar etiquetas, obter IDs internos de campos, listar pipes e databases da organização, gerar link de download de relatório, consultar o pai de um card filho.
- Para usar a API é preciso ser admin da organização (segundo os artigos de massa).
- Fontes: `5580799-how-to-use-pipefy-s-api`, `14645558-how-to-add-a-billing-organization-to-your-personal-access-token`, `8282624-how-to-bulk-update-cards-using-the-api`, `8650789-how-to-clear-fields-in-bulk-via-api`, `8657451-how-to-delete-cards-in-mass-via-api`, `8659535-how-to-bulk-invite-pipe-members-via-api`, `8652418-how-to-obtain-the-fields-internal-id-via-api`, `8653180-how-to-update-card-labels-via-api`, `8652702-how-to-get-information-from-all-the-pipes-and-databases-from-your-company-via-api`

### 21.2 Webhooks de saída
- Eventos de card: `card.create`, `card.done`, `card.expired`, `card.late`, `card.move`, `card.overdue`, `card.field_update`, `card.delete`, `card.comment_create`, `card.email_received`.
- Eventos de usuário: `user.invitation_sent`, `user.invitation_acceptance`, `user.role_set`, `user.removal_from_org`.
- Organização: `usage.threshold_reached`.
- Fontes: `729719-how-to-use-webhooks-in-pipefy`, `16986836-how-to-track-your-account-usage-limits-webhooks-email`

### 21.3 Ação de automação "Fazer requisição HTTP" (Beta)
- Disparável por qualquer evento exceto recorrente.
- Campos:
  - Método: POST, PUT, DELETE, GET, PATCH;
  - URL, que aceita campos do card;
  - Autenticação: sem autenticação, cabeçalho Authorization, ou API Key (em cabeçalho ou query string). **OAuth não suportado**;
  - Cabeçalhos em JSON (não colocar token aí; não precisa de Content-Type);
  - Tipo de conteúdo: só JSON;
  - Corpo JSON com campos do card;
  - Resposta: campo de texto longo opcional que recebe a resposta inteira (para depuração);
  - **JSON schema** de exemplo da resposta, que habilita o evento "Resposta HTTP recebida" para mapear partes da resposta em campos.
- Fontes: `8392669-how-to-create-integrations-with-http-requests`, `8395036-examples-of-http-requests-with-pipefy-automations`

### 21.4 Hub de integrações (iPaaS nativo, add-on pago)
- Só admin do pipe (botão "Integrar"). Sem o add-on contratado, mostra um formulário de interesse; para quem não é admin, uma mensagem para procurar o admin.
- Fluxo = gatilho + ações; centenas de conectores; logs e rastreio.
- Gatilhos do conector nativo (autenticado por conta de serviço com acesso por pipe): card criado, excluído, concluído, expirado, campo atualizado, atrasado, movido, vencido, comentário criado.
- Conexões reutilizáveis entre fluxos (exceto o conector HTTP genérico). Conector HTTP com Basic, Bearer/cabeçalhos ou OAuth2.
- **Webhook de entrada** ("Catch Webhook"): URL única; responde 200 e processa em segundo plano, ou usa a ação "Retornar resposta" (status, cabeçalhos, corpo) para resposta síncrona.
- **Polling**: a cada 5 min, com estratégias de deduplicação (timestamp ou último ID) e "loop sobre itens".
- **Armazenamento persistente** chave-valor com escopos run, flow e project (projeto = pipe); operações get, put, append, remove e add-to-list; chave até 128 caracteres; valor até 512 KB.
- Limites: resposta de webhook 30 s; arquivo 10 MB; execução 5 min; memória 512 MB; código 90 s; retentativa até 24 h; logs 30 dias; **50 execuções simultâneas por organização** (o excedente fica "Na fila", em ordem de chegada); fluxos e passos ilimitados.
- Painel de execuções: Run ID, widget de fila (total, sucesso, falha).
- Fontes: `12587595-introduction-to-pipefy-s-integrations`, `12589348-getting-started-with-pipefy-s-integrations`, `14693081-using-the-http-connector-in-pipefy-integrations`, `14693313-receiving-data-with-webhooks-in-pipefy-integrations`, `14693415-working-with-persistent-storage-in-pipefy-integrations`, `14694012-fetching-data-with-polling-triggers-and-loops`, `13789883-integrations-limits`, `15275092-understanding-the-integration-queue-status-and-flow-runs`, `14692123-accessing-integrations-permissions`

### 21.5 Conector externo legado (iPaaS de terceiro) e Zapier
- Enterprise/Unlimited. Gatilhos e ações para pipes: novo card, criar, atualizar, excluir e mover card, buscar por campo, fase, título ou ID; equivalentes para databases. Contagem de tarefas por ação.
- Zapier: Ferramentas > Integrações.
- Fontes: `5737668-pipefy-connector-how-to-set-triggers-and-actions-for-pipes`, `5737344-pipefy-connector-triggers-and-actions-for-databases`, `6055959-pipefy-connector-how-tasks-are-counted`, `2333367-how-to-use-apps-and-integrations`

---

## 22. Apps de pipe, PDF e assinatura

### 22.1 Apps habilitáveis por pipe (Ferramentas > Apps)
- **Calendário**: nova visualização com mês, semana, dia e **agenda** (lista dos próximos 30 dias por vencimento); navegação por setas e "Hoje"; só cards com vencimento.
- **Slack**: escolher canal e quais eventos notificar (novo card, movimentos, atrasado/expirado/vencido…).
- **GitHub / GitLab / Bitbucket**: anexar pull request, issue, commit ou branch ao card.
- **Sprint Planner**:
  - sprint com nome, estimativa (campo numérico de pontos ou contagem de cards), início e fim;
  - escolher e priorizar histórias arrastando; gráfico de burndown;
  - concluir história move o pai para a fase escolhida;
  - sprint encerrada manualmente e **não reabre**; adicionar ou remover cards durante a sprint.
- **Importador** (20.1).
- Fontes: `724040-how-to-enable-the-calendar-app`, `934183-how-to-connect-a-pipe-to-a-slack-channel`, `1165461-how-to-enable-github-in-pipefy`, `1171268-how-to-enable-the-sprint-planner-app`

### 22.2 Gerador de PDF
- Ferramentas > Gerador de PDF > criar template: texto, imagens, links, tabelas e campos dinâmicos. Não suporta conexões, anexos, checklists nem ID do card.
- Switch habilita ou desabilita cada template.
- No card: botão Gerador de PDF > escolher template > pré-visualizar > baixar.
- Só admins e membros do pipe geram PDF (visão restrita, somente leitura e formulários não).
- Fontes: `2414660-what-is-the-pdf-generator`, `2414717-create-pdf-templates`, `2414868-how-to-generate-and-download-a-pdf`

### 22.3 Assinatura eletrônica (app)
- Planos pagos; admin do pipe.
- Criar documento (anexo ou a partir do card); destinatários e canal (e-mail, SMS, WhatsApp); idioma e jurisdição; **ordem de assinatura**; posicionar assinaturas, rubricas e data de nascimento no documento; página de assinaturas com QR code; e-mail personalizado; **lembretes automáticos**; exigir CPF ou certificado digital (Brasil).
- Validade: hashes MD5, SHA1 e SHA256; link único por e-mail; nome completo + data de nascimento; IP, geolocalização, dispositivo; autenticação alternativa (Google/Facebook, SMS, e-mail).
- Fontes: `9546521-pipesign`, `11391695-validity-of-electronic-signatures`

---

## 23. Interfaces (Beta)

### 23.1 Conceito e limites
- Páginas personalizadas que mostram dados de vários pipes e databases a públicos específicos.
- Até **15 interfaces por organização**. Admins de pipe criam e editam. Membros e convidados podem acessar e ver.
- Ícone e cor; várias páginas; elementos de **Dados** e **Texto** (títulos, cores, listas, links; sem limite de quantidade); elemento Formulário com valores padrão (6.9).
- Fonte: `8113491-getting-started-with-interfaces`

### 23.2 Elemento de dados
- Fonte: pipe ou database em que o criador é admin; filtros por fase, campo, valor ou atributo (responsável, título, criação…); ordenação; colunas visíveis.
- Condição **"usuário atual"** (ex.: "criado por e-mail = usuário atual") faz cada pessoa ver só os próprios cards ou registros.
- **Exportação**: switch "Permitir exportar" + "Quem pode exportar" (só admins da interface — padrão; admins e membros; qualquer um com acesso). Exporta só o que aquele usuário vê.
- Fonte: `8113491-getting-started-with-interfaces`

### 23.3 Página de detalhe do registro
- Desligada por padrão. Montada arrastando campos; cada campo pode ser **editável ou somente leitura** (edição grava no pipe ou database de origem); dá para incluir registros conectados e texto.
- Papéis da interface: **Admin** (edita a interface; super admins, admins e membros) e **Editor** (interage conforme seu nível; inclui convidados).
- Fonte: `8113491-getting-started-with-interfaces`

---

## 24. IA

### 24.1 Agentes de IA (por pipe)
- Admin do pipe; todos os planos; consome créditos de IA.
- Três seções:
  - **Criar**: nome + descrição obrigatória.
  - **Conhecimento**: dados de pipes/databases e documentos (PDF), cada fonte com nome e descrição de quando usar.
  - **Comportamentos**: gatilho (os mesmos eventos de automação) + instrução em linguagem natural com variáveis de campos (`/` ou `+`).
- Ações que o agente pode executar: atualizar campos do card, criar card, criar registro, criar card conectado, mover card, enviar template de e-mail, solicitar validação humana.
- Limites: **5 comportamentos por agente**; **3 ações por comportamento**; instrução de até **15.000 caracteres**; criar card preenche até **80 campos**.
- Anexos lidos: PDF (até 30 páginas), PNG/JPG (até 30 imagens), JSON (400 KB), XML/EML/CSV/TXT (200 KB).
- Habilidades extras: **busca na web**, **processamento inteligente de documentos** (extração para campos), **cálculos e análise** (código executado em sandbox), modo "esforço máximo" (Beta), MCP.
- **Validação humana**: ação "Solicitar validação humana" com título (pode usar campos) e destinatário; vira tarefa em "Tarefas e Solicitações". Indisponível com os gatilhos recorrente, alerta e card sai da fase. Revisor externo exige formulário da fase compartilhado.
- **Logs/rastreio**: aba Logs com agente, comportamento, card e status; detalhe passo a passo com o raciocínio, as fontes usadas, ações puladas e erros. Visível a quem tem leitura no pipe.
- Ativação, criação, alteração e exclusão de agentes ficam nas Atividades do pipe (17.1).
- Fontes: `12526171-ai-agents-creating-the-new-ai-agent`, `11089705-how-to-configure-ai-agent-knowledge-base-in-pipefy`, `15061805-general-guide-ai-agent-skills`, `13566181-how-to-use-web-search-in-ai-agents`, `12001301-using-intelligent-document-processing-in-pipefy-ai-agents`, `15396430-how-to-use-calculations-analysis-in-pipefy-ai-agents`, `16005153-ai-agents-requesting-human-validation`, `13377965-ai-agents-tracing-and-logs`, `16044755-ai-agents-optimize-complex-workflows-with-max-effort-beta`, `14300355-mcp-the-universal-standard-for-powering-up-your-ai-agents`

### 24.2 Ação de automação "Gerar com IA"
- Em qualquer evento: prompt em linguagem natural com campos dinâmicos como entrada e **campos de saída** a preencher (ex.: ler o e-mail recebido e preencher solicitação, urgência e sentimento).
- Fonte: `8913145-creating-an-ai-automation`

### 24.3 Assistentes de IA (chatbot)
- Enterprise (Beta). Responde dúvidas com base em documentos internos, **cria solicitações conversando** (abre cards em pipes) e informa o status das solicitações do usuário.
- Canais: portais, interfaces, Microsoft Teams (instalação aprovada pelo admin do Teams), Slack; WhatsApp previsto.
- **Assistente autogerado** em portais e interfaces: sem configuração; entende formulários e documentos da página; atalhos "Resumir políticas" e "Ver minhas solicitações"; mostra status, histórico e dados enviados; ajuda a achar ou preencher formulários.
- Fontes: `10769512-what-is-the-ai-assistant-beta`, `13179278-getting-started-with-auto-generated-ai-assistants-beta`, `12022668-microsoft-teams-integration-guide`

### 24.4 Outros recursos de IA
- Criar pipe com IA (1.2), AI Analytics (16.3).
- **Modelos e créditos**: 1.000 créditos únicos por plano; pacotes adicionais; modelos Lite, Standard e Pro consomem 1, 2 e 3 créditos.
- **BYOM**: admin da organização cadastra chaves de provedores de LLM e homologa modelos; admin do pipe escolhe o modelo **por comportamento** do agente (vale para automações de IA e agentes 2.0).
- Governança: diretrizes de "humano no circuito" para decisões críticas (campo de status de aprovação + tarefa + segunda automação que só segue após aprovação).
- Fontes: `12001177-new-pipefy-ai-models-and-pricing`, `10131205-bring-your-own-models-byom`, `12713260-implementing-human-in-the-loop-in-critical-automations`, `14602433-consumption-guide-api-ai-credits-and-automations`

---

## 25. Planos, consumo e limites (referência rápida)

| Item | Starter | Business | Enterprise | Unlimited |
| --- | --- | --- | --- | --- |
| Usuários | até 10, todos admin, sem convidados | por contrato | por contrato | por contrato |
| Jobs de automação/mês | 15 | 300 | 2.000 | 15 milhões |
| Chamadas de API/mês | 20 | 500 | 10.000 | 15 milhões |
| Condicionais de campo | não | sim | sim | sim |
| Papéis do pipe além de admin, papéis custom, grupos | não | sim | sim | sim |
| SSO, MFA, remetente personalizado, white label | não | não | sim | sim (MFA/SSO: "Enterprise") |

- Contagem de chamadas de API: 2xx e 3xx cobradas; 4xx cobradas exceto 401/403; 5xx não cobradas. Chamadas internas, de automações nativas e do hub de integrações não contam.
- Fontes: `6445865-how-pipefy-enumerates-automation-jobs-vs-automation-rules`, `5419654-what-to-do-when-reaching-your-automation-integration-or-api-limit`, `5714249-business-vs-enterprise-plans-what-s-the-difference`, `8233108-how-does-pipefy-charge-per-person-in-the-company`, `14602433-consumption-guide-api-ai-credits-and-automations`

### Limites numéricos citados (para validações do Fluxos)
- Condicional: 300 condições + 300 ações.
- Filtro do pipe: 5 condições.
- Ações em massa: 10.000 cards; automações só com até 100.
- Relatório/exportação: 30.000 linhas.
- Cenários de automação recorrente: lote de 300 cards.
- Tarefa: até 30 pessoas.
- Link de confirmação de formulário de fase: 30 min.
- E-mail: 10 destinatários por mensagem; 2/min manual no domínio padrão; 100 campos dinâmicos por template; imagens do editor expiram em 30 dias; largura de imagem 536 px.
- Sub-portais: 50. Interfaces: 15 por organização.
- Imagens (logo, fundo): 2 MB.
- Atribuição em massa: 1.000 e-mails.
- Grupos: 3 donos.
- Papéis custom: nome 120 e descrição 140 caracteres.
- Atividades: 180 dias na tela, CSV de 30 dias.
- Logs de automação: 3 meses.
- Agente de IA: 5 comportamentos × 3 ações; prompt de 15.000 caracteres; 80 campos por card criado.
- Hub de integrações: 50 execuções simultâneas; 5 min por execução.

---

## 26. Dúvidas / lacunas

1. **Arquivar e duplicar card**: nenhum artigo da central descreve arquivar ou duplicar card individual (só excluir e mover). Não ficou claro se existem. A "fase final" com cards inativos parece fazer o papel de "arquivado".
2. **Limite WIP por fase**: só aparece como conceito genérico de kanban ("limitar trabalho em andamento"); não há configuração de limite de cards por fase documentada.
3. **Operadores de condicional e de condição de automação**: só aparecem exemplos ("é igual a", "é maior que"); a lista completa por tipo de campo (contém, vazio, antes/depois de data…) não é documentada. Relatórios citam "é", "não é", "é desconhecido", "tem qualquer valor".
4. **Ação "obrigar campo" em condicional**: a central só documenta mostrar/ocultar; tornar obrigatório condicionalmente não aparece (a "trava" é um contorno).
5. **Opções avançadas da conexão**: o artigo de troubleshooting manda desligá-las para que a automação consiga mover cards conectados, mas não explica o que cada opção faz (provavelmente restrições de movimento pai/filho, por exemplo exigir filhos concluídos).
6. **Espelhamento de dados pai↔filho**: artigos dizem que o preenchido num card "aparece no outro e vice-versa", mas outros mostram que é preciso automação/HTTP para devolver dados ao pai. Não está claro se é sincronização viva ou só cópia na criação + exibição do card conectado.
7. **Status de registro de database** ("em andamento"/"concluído"): citado como filtro, sem regra explícita de quando o registro muda de status.
8. **Filtros salvos / visões salvas** no kanban/lista: não documentados (só relatórios salvos).
9. **Quem edita campos e formulários**: artigos divergem (membros e admins vs só admins).
10. **Exportação no database**: um artigo diz que "somente leitura" pode exportar; a tabela de permissões diz que só admin.
11. **Nomes dos papéis na API**: o artigo associa `read_and_comment` a "visão restrita" e `my_cards_only` a "somente leitura", o que parece invertido em relação aos nomes. Confirmar na pesquisa de API.
12. **Checklist** (campo fixo do card vs campo Checkbox): o comportamento do checklist fixo (itens, marcar, responsáveis por item?) não é detalhado.
13. **Campo "Declaração/statement", fórmula nativa, CPF/CNPJ**: o catálogo atual da central não lista "statement" nem campo-fórmula; "Documento" aparece só na lista de valor único. Detalhes de máscara (telefone, CPF) não são descritos.
14. **Data de vencimento (aviso amarelo)**: a central não diz com quanta antecedência o vencimento passa a "se aproximando".
15. **Alerta de atraso e "somente dias úteis"**: o artigo de SLA avançado é Beta; não está claro se horário comercial e feriados também valem para os alertas de fase/pipe ou só para o vencimento calculado.
16. **Automação "card sai da fase"**: um artigo lista só "enviar template"; outro lista várias ações. Matriz evento × ação não é totalmente consistente.
17. **Limites de anexos** (tamanho máximo de arquivo em campo de anexo) não aparecem na central.
18. **Menções em comentários de convidados** e notificações in-app: o detalhe do que gera notificação no sino não é listado de forma completa.
19. **Busca global** (cards entre pipes): só há busca de pipes/databases na Home e busca dentro do pipe; não ficou claro se existe busca global de cards.
20. **App móvel**: a coleção tem um único artigo (uso em celular/tablet), sem detalhes de funcionalidade.
21. Artigos com corpo vazio no HTML público (redirecionamentos): `619139-connections`, `619373-what-is-an-expired-alert`, `614639-how-to-set-up-a-card-s-expired-alert`, `6122322-how-an-admin-dashboard-works`, `6357959-how-to-access-activity-logs-for-pipes-and-cards`, `4375159-automation-create-a-new-connected-card`, `3595782-how-to-create-customize-and-delete-portals`, `614595-delete-a-public-form`. O conteúdo deles foi coberto por artigos equivalentes.

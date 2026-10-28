# Recon da API pública do Pipefy — modelo de dados, enums, mutations

> Levantamento clean-room feito **somente** a partir da documentação pública
> (api-docs.pipefy.com — referência GraphQL gerada do schema — e
> developers.pipefy.com — guias). Nenhum login, token ou chamada à API.
> Os nomes de tipos/campos/enums são citados apenas como referência técnica; as
> descrições são paráfrases. Data do levantamento: 2026-10-28.
>
> Complementa `recon.md` (central de ajuda) e `features.csv`. Ao final há a
> comparação com `server/src/db/schema.ts` do Fluxos.

## 0. Números do levantamento

| Categoria (api-docs.pipefy.com) | Quantidade |
| --- | --- |
| Object types listados | 338 (≈ 70 relevantes ao domínio detalhados abaixo; o resto é paginação `*Connection/*Edge`, payloads `*Payload`, IA, interfaces/portais, introspecção) |
| Interfaces GraphQL | 24 |
| Unions | 1 listada (`PublicRepoUnion`) + uniões citadas (`RepoTypes`, `PublicRepoItemTypes`, `RepoItemFieldsTypes`, `AutoFillFieldUnion`) |
| Enums | 53 (51 de domínio + 2 de introspecção) |
| Input objects | 144 |
| Queries | 67 |
| Mutations (api-docs) | 103 |
| Mutations/queries extras só nos guias (developers.pipefy.com) | ≈ 40 (tasks, cardDuplicate, phase jumps, archiveField, snapshots/versões, batchUpsert, emailTemplates, activities, cardSearch, knowledge base, LLM providers…) |

Conceito-chave revelado pela API: **"Repo"** é a abstração comum a *Pipe* e
*Table (Database)*. Ambos têm campos, labels, membros, public form, summary,
webhooks, start form (`startFormPhaseId`). Um *Card* e um *TableRecord* são
"repo items"; conexões ligam repo items entre repos.

---

## 1. Modelo de dados por objeto

### 1.1 Organization
| Atributo | Significado |
| --- | --- |
| `id`, `uuid`, `name`, `createdAt`, `createdBy` | identidade |
| `onlyAdminCanCreatePipes`, `onlyAdminCanInviteUsers` | política: só admin cria pipe / convida |
| `members [OrganizationMember]`, `membersCount`, `membersCountByRole [Role]` | membros e papéis |
| `pipes`, `pipesCount`, `tables` | repos da org |
| `webhooks [Webhook]` | webhooks de nível org (eventos de usuário) |
| `customLogoUrl`, `displayPipefyLogo`, `customDomain` | branding / white-label |
| `ssoEnabled`, `ssoOnly`, `userProvisioningEnabled`, `groupsProvisioningEnabled` | SSO / SCIM |
| `planName`, `freemium`, `daysToExpirePlan`, `activeSubscription.limits [Limit]` | plano e limites (`SubscriptionLimits`: ai_credits, pipes, users, cards/mês, interfaces, records) |
| `preferences` (aiEnabled, aiCopilotEnabled, aiAssistantsEnabled, pipeAiAgentsEnabled, ipaasEnabled…) | toggles de IA/iPaaS |
| `permissions: OrganizationPermissions` | ~40 booleans de permissão do usuário corrente (canManageRoles, canManageTags, showCompanyReports, showDashboard, showPortals, showGroups, canManageServiceAccounts, canManageEmailSettings, canManageBranding…) |
| `mainPortal`, `platformApps`, `usageStats` | portal principal, apps, uso |

`OrganizationSettings` acrescenta: `locale` (idioma padrão), `headerColor`,
`closedCardTimersEnabled`, `companyGuestCanCreatePipe`,
`forceOmniauthToNormalUsers`, hierarquia `parent`/`child` (org pai/filha).

### 1.2 User / Member
| Atributo | Significado |
| --- | --- |
| `id`, `uuid`, `name`, `displayName`, `username`, `email`, `avatarUrl`, `phone` | perfil |
| `locale`, `timezone`, `departmentKey` | preferências regionais / departamento |
| `confirmed`, `invited`, `invitationAccepted`, `lastSignInAt`, `otpRequiredForLogin` | ciclo de convite / MFA |
| `billable`, `customRole`, `roleName`, `roleTitle`, `currentOrganizationRole` | papel |
| `preferences: UserPreference` | `favoritePipeIds`, `sidebarOpened`, `openNestedStartForm`, `browserNativeNotificationEnabled`, `displayPipeReportsSidebar`… |
| `hasUnreadNotifications` | notificações |

`Member` / `OrganizationMember`: `user`, `role_name`, `billable`, `customRole`,
`joinedAt`, `groups`, `pipes`. O texto de `role_name` define os papéis por escopo
(ver §2.6).

`Group`: `id`, `uuid`, `name`, `description`, `provisioned`, `totalUsers`,
`canBeManaged` — grupos de usuários que podem ser membros de pipes/interfaces.

`Role` (papel customizado): `id`, `uuid`, `name`, `title`, `description`,
`isCustom`, `memberCount`. Criado copiando permissões de um papel de referência
(`referenceRole`: start_from_scratch, super_admin, admin, normal, company_guest,
external_guest) e ajustado com `saveRolePermission(permissionIds)`.

`ServiceAccount`: `name`, `description`, `email`, `role`, `token`
(expiração `value` + `unit`), `client` OAuth2.

### 1.3 Pipe (Repo do tipo processo)
| Atributo | Significado |
| --- | --- |
| `id`, `uuid`, `suid` (small unique id), `name`, `description`, `icon`, `color` (enum `Colors`), `noun` (como chamar os itens, ex. "pedido") | identidade/visual |
| `organization`, `organizationId`, `clone_from_id` | origem |
| `phases [Phase]`, `startFormPhaseId`, `start_form_fields [PhaseField]` | **o start form é uma fase "draft"** com campos próprios |
| `title_field: PhaseField` | qual campo vira o título do card |
| `summary_attributes [SummaryAttribute]`, `summary_options [SummaryGroup]`, `subtitleFields` | o que aparece no card fechado (kanban) |
| `labels [Label]` | etiquetas do pipe |
| `members [Member]`, `users`, `users_count`, `role` | membros e papel do usuário corrente |
| `public`, `publicForm: PublicFormInternal`, `startFormVisibility: ResourceVisibility` | formulário público e visibilidade |
| `only_admin_can_remove_cards`, `only_assignees_can_edit_cards` | políticas de permissão do pipe |
| `expiration_time_by_unit` + `expiration_unit` (60/3600/86400 s) | **SLA do pipe** → card "expired" |
| `countOnlyWeekDays` | SLA conta só dias úteis |
| `create_card_label` | texto do botão "novo card" |
| `emailAddress` | endereço de e-mail inbox do pipe (cria/recebe e-mails) |
| `fieldConditions`, `startFormFieldConditions`, `conditionExpressionsFieldIds` | regras condicionais |
| `parentsRelations`, `childrenRelations [PipeRelation]` | conexões pipe↔pipe/tabela |
| `reports [PipeReport]`, `webhooks [Webhook]` | relatórios e webhooks |
| `preferences: RepoPreference` | `inboxEmailEnabled`, `mainTabViews`, `hiddenTopButtons` (Assignees, Attachments, Checklist, Comments, DueDate, Labels, PDF), `hiddenStartFormAttributes`, `startFormTitle`, `findable` (aparece no portal da empresa), `aiAgentsEnabled` |
| `permissions: RepoPermissionsInternalGQL` | configure_repo, create_item, delete_item, delete_repo, manage_field, manage_label, show_repo |
| `cards_count`, `opened_cards_count`, `last_updated_by_card` | contadores |
| `reachedConcurrentBulkActionsLimit` | limite de ações em massa |

`PipeTemplate`: `id`, `name`, `icon`, `image` (catálogo de templates para `clonePipes`).

### 1.4 Phase
| Atributo | Significado |
| --- | --- |
| `id`, `uuid`, `sequentialId`, `name`, `description`, `color`, `index` (float, posição) | identidade/ordem |
| `done` | **fase final** (card fica "concluído" ao entrar) |
| `isDraft` | é a fase do start form |
| `can_receive_card_directly_from_draft` | permite criar card direto nesta fase |
| `next_phase_ids`, `previous_phase_ids`, `cards_can_be_moved_to_phases` | **transições permitidas** (para frente / para trás) |
| `lateness_time` (segundos) | **SLA da fase** → card "late" |
| `fields [PhaseField]`, `fieldConditions [FieldCondition]` | campos e condicionais da fase |
| `teamMembers [ID]`, `identifyTask` (`anonymous`/`identified`) | responsáveis da fase e "tarefas" de fase |
| `cards`, `cards_count`, `lateCardsCount`, `expiredCardsCount` | contadores |
| `custom_sorting_preferences` (JSON) | ordenação customizada dos cards na coluna |

### 1.5 PhaseField (campo de fase / start form) — também TableField
| Atributo | Significado |
| --- | --- |
| `id` (slug), `internal_id`, `uuid`, `index_name` | identificadores (o `id` é um slug textual usado em fórmulas/filtros) |
| `label`, `description`, `help` | título, descrição, texto de ajuda |
| `type` | tipo (ver §2.1) |
| `required` | obrigatório (bloqueia mover o card para fora/para a fase) |
| `editable` | **pode ser editado em fases futuras** (senão fica travado na própria fase) |
| `minimal_view` | exibição compacta |
| `options [String]` | opções de select/radio/checklist |
| `custom_validation` | **regex** de validação |
| `is_multiple` | aceita múltiplos valores |
| `sync_with_card` (input) / `synced_with_card` | sincroniza com atributo fixo do card (ex. due_date, assignees, labels) |
| `index` (float) | ordem dentro da fase |
| `settings` (JSON) | configurações específicas do tipo (moeda, formato, fórmula, conteúdo dinâmico…) |
| `archived`, `deleted` | arquivado (soft) / excluído |
| `unique` (só TableField) | valor único na tabela |
| **Conexão**: `connectedRepo` (Pipe ou Table), `canConnectExisting`, `canConnectMultiples`, `canCreateNewConnected`, `childMustExistToFinishParent`, `allChildrenMustBeDoneToFinishParent`, `allChildrenMustBeDoneToMoveParent` | regras do campo conector |
| `phase` | fase dona |

Na visão de formulário (`FieldType` interface / `*Field` objects) aparecem:
`displayState` (hidden), `isEditable`, `isRequired`, `helpText`,
`triggersFieldConditions` (campo dispara condicional), `initialValue` (valor
inicial por tipo: usuários p/ assignee, itens p/ conector, string p/ select).

`FieldDependency` (query `field`): lista o que depende de um campo —
automações, condicionais, conexões, conteúdo dinâmico, templates de e-mail,
agentes de IA — usado antes de excluir/arquivar.

### 1.6 Card
| Atributo | Significado |
| --- | --- |
| `id`, `uuid`, `suid`, `path`, `url`, `title` | identidade |
| `pipe`, `current_phase`, `phases_history [PhaseDetail]` | onde está / por onde passou |
| `fields [CardField]` | valores |
| `assignees [User]`, `cardAssignees [CardAssignee{id, assignedAt}]` | responsáveis (com data de atribuição) |
| `labels [Label]` | etiquetas |
| `due_date` | vencimento → card "overdue" |
| `done`, `finished_at` | concluído (entrou em fase final) |
| `late` + `currentLateness {sla, shouldBecomeLateAt, becameLateAt}` | atraso pelo SLA da **fase** |
| `expired` + `expiration {shouldExpireAt, expiredAt}` | expiração pelo SLA do **pipe** |
| `overdue` | passou do `due_date` |
| `age`, `current_phase_age`, `started_current_phase_at` | tempos |
| `createdAt`, `createdBy`, `creatorEmail`, `updated_at` | auditoria |
| `comments`, `comments_count`, `attachments`, `attachments_count` | colaboração |
| `checklist_items_count`, `checklist_items_checked_count` | progresso de checklists |
| `parent_relations`, `child_relations [CardRelationship]` | cards conectados (pai/filho) |
| `emailMessagingAddress`, `inbox_emails`, `inboxEmailsRead` | e-mail por card |
| `public_form_submitter_email` | e-mail de quem enviou o form público |
| `summary`, `summary_attributes`, `summary_fields`, `subtitles` | layout resumido |
| `CardTypeEnum` (input) | `card`, `request` (criado por guest/portal), `row` (de tabela) |

`PhaseDetail` (histórico): `phase`, `firstTimeIn`, `lastTimeIn`,
`lastTimeOut`, `duration` (s), `became_late`, `draft`.

`CardField`: `field`, `phase_field`, `name`, `value` (string), `native_value`,
`report_value`, `float_value`, `date_value`, `datetime_value`, `array_value`
(anexos/checklist/conexão/labels), `assignee_values`, `label_values`,
`connectedRepoItems`, `filled_at`, `updated_at`, `indexName`.

### 1.7 Relações / conexões
**PipeRelation / TableRelation** (conexão entre repos, configurada no pipe pai):
`id`, `name`, `parent`, `child` (RepoTypes = Pipe|Table),
`canCreateNewItems`, `canConnectExistingItems`, `canConnectMultipleItems`,
`childMustExistToFinishParent`, `childMustExistToMoveParent`,
`allChildrenMustBeDoneToFinishParent`, `allChildrenMustBeDoneToMoveParent`,
`autoFillFieldEnabled`, `ownFieldMaps [FieldMap]`.

**FieldMap** (auto-preenchimento do filho a partir do pai): `fieldId` (campo do
pai), `value` (campo do filho ou valor fixo), `inputMode` (`fixed_value`,
`copy_from`, `fill_with_ai`).

**CardRelation** (instância): `parentId`, `childId`, `sourceId`, `sourceType`
(`PipeRelation` ou `Field`) — uma conexão nasce de uma *relação de pipe* ou de
um *campo conector*.

**TableRecordRelation**: `name`, `repo`, `repo_items`, `source_type`.

`throughConnectors` (`ReferenceConnectorFieldInput{fieldId, fieldUuid,
nextConnectorField}`): cadeia de conectores usada ao criar card/registro já
conectado (caminho recursivo).

### 1.8 Label
`id`, `name`, `color` (hex). Pertence a pipe **ou** tabela (`pipe_id`/`table_id`).

### 1.9 Comment
`id`, `text`, `author`, `author_name`, `created_at`. CRUD completo (create/update/delete).

### 1.10 Attachment
`url`, `path`, `createdAt`, `createdBy`, `field` (campo de anexo, se for o
caso), `phase`. Upload via `createPresignedUrl` (orgId, fileName,
contentType, contentLength, checksum, customFilePath) → PUT no storage → grava a
URL no campo/anexo.

### 1.11 Table (Database) / TableRecord / TableField
**Table**: `id`, `internal_id`, `uuid`, `name`, `description`, `icon`, `color`,
`noun`, `public`, `authorization` (`read` | `write` — membros só leem ou
editam), `create_record_button_label`, `title_field`, `table_fields`,
`statuses [TableRecordStatus]`, `labels`, `members`, `my_permissions
{can_manage_record, can_manage_table}`, `orderableFields` (title, status,
created_at, updated_at, finished_at), `summary_attributes`, `publicForm`,
`webhooks`, `tags`, `table_records_count`, `url`.

**TableRecord**: `id`, `uuid`, `title`, `status: TableRecordStatus{id,name}`,
`assignees`, `labels`, `due_date`, `done`, `finished_at`, `created_at`,
`created_by`, `updated_at`, `record_fields [TableRecordField]`,
`parent_relations`, `is_sample`, `summary*`, `path`, `url`.

**TableRecordField**: igual ao CardField + `required`.

**TableField**: igual ao PhaseField (sem `editable`/`sync_with_card`) + `unique`.

### 1.12 FieldCondition (campos condicionais)
| Objeto | Atributos |
| --- | --- |
| `FieldCondition` | `id`, `name`, `phase` (onde vale; start form = fase draft), `condition: Condition`, `actions [FieldConditionAction]`, `isTrueFor`, `url`; ordenável por `index` (`setFieldConditionOrder`) |
| `Condition` | `expressions [ConditionExpression]`, `expressions_structure [[ID]]` (agrupa expressões: lista externa = OR de grupos, interna = AND — ou vice-versa, "grupos de AND e OR"), `related_cards` |
| `ConditionExpression` | `field_address` (campo), `operation` (§2.3), `value` (valor ou id de campo para comparar), `structure_id` (posição no agrupamento) |
| `FieldConditionAction` | `actionId` (`hide`, `show`; descrição antiga cita também `able`/`disable`), `phaseField` (campo afetado), `phase`, `whenEvaluator` (aplica quando a condição é true/false) |

A mesma estrutura `Condition` é reutilizada nas **automações**.

### 1.13 Automation
| Atributo | Significado |
| --- | --- |
| `id`, `name`, `active`, `created_at`, `url` | identidade |
| `event_id` + `event_repo` + `event_params` | **gatilho** (enum §2.4) e pipe onde ocorre |
| `event_params` | `to_phase_id`, `fromPhaseId`, `inPhaseId`, `triggerFieldIds`, `kindOfSla` (Expired/Late/Overdue), `triggerAutomationId` (encadeamento) |
| `condition: Condition` | filtro opcional (mesmos operadores das condicionais) |
| `action_id` + `action_repo_v2` + `action_params` | **ação** (enum §2.4) e repo alvo (pode ser outro pipe/tabela) |
| `action_params` | `to_phase_id`, `field_map [FieldMap]`, `fields_map_order`, `card_id` (template), `email_template_id`, HTTP (`url`, `httpMethod`, `headers`, `body`, `authenticationType`, `authenticationAddTo`, `authenticationKey/Value`, `oauth2`), `strategy` (ROUND_ROBIN/RANDOM p/ distribuir atribuições), `slaParams` (horário útil por dia + holidays + timezone), `taskParams` (`title`, `recipients`), `aiParams` (prompt, fieldIds, skills, MCP server), `aiBehaviorParams` |
| `scheduler_frequency` (hourly/daily/weekly/monthly) + `schedulerCron {minute, hour, dayOfMonth, month, dayOfWeek}` | agendamento |
| `searchFor [SearchCondition{field, operation, value}]` | seleção de cards em automações recorrentes/"mover múltiplos" |
| `responseSchema` | schema da resposta HTTP (para evento `http_response_received`) |
| `actionEnabled`, `disabledReason` | ação bloqueada (IA desligada, premium) |

`AutomationLog`: `automationId/Name`, `cardId/Title`, `datetime`, `status`
(processing/failed/success), `details {errorType, message}`.
`AutomationEvents`/`AutomationActions` (catálogo): `acceptedParameters`,
`actionsBlacklist`/`eventsBlacklist`, `triggerEvents`, `enabled`,
`initiallyHidden` → **matriz de compatibilidade evento×ação** vem do servidor.
`AutomationEventsByPhase.blocklistByPhase`. `AutomationSimulation` (testar com
`sampleCardId`). `AutomationJobsExport` (exporta execuções: last_3_months,
last_month, current_month). Notificação `automationLoopDetected` indica
detecção de loop.

### 1.14 Webhook
`id`, `name`, `url`, `email`, `headers` (JSON), `actions [String]`, `filters`
(JSON, ex. `{on_phase_id:[…]}`, `{field_id:[…]}`, `{from_phase_id, to_phase_id}`),
`identityPropagationEnabled`. Escopo: **pipe**, **table** ou **organização**
(eventos de usuário). Regra: com filtros, só uma ação por webhook;
`overridePreviousWithSameUrl` substitui webhooks com mesma URL+ações.

### 1.15 E-mail (Inbox, templates, SMTP)
**InboxEmail**: `card`, `pipe`, `type` (sent/received), `from`, `fromName`,
`to`, `cc`, `bcc`, `main_to`, `subject`, `body`, `clean_html`, `clean_text`,
`raw_headers`, `message_id`, `attachments` (EmailAttachment: filename,
fileUrl, public_url), `state` (0 Pending, 1 Processing, 2 Processed, 3
Failed), `sent_via_automation`, `user`.
**EmailTemplate** (guias): `id`, `name`, `subject`, `body`, `fromEmail`,
`fromName`, `toEmail`, `ccEmail`, `bccEmail`, `repoId`, `defaultTemplate`,
`hasInsecureContent`; `parsedEmailTemplate(cardUuid)` resolve placeholders
dinâmicos com dados do card.
**SmtpConfiguration** (host, port, username, senha cifrada, ipRelayAuth,
outlookIntegration, defaultSmtp) e **SmtpCustomEmail** (remetente
customizado, `createCardRepoUuid`).

### 1.16 Relatórios
**PipeReport**: `id`, `name`, `color`, `fields [String]` (colunas),
`filter` (JSON = `ReportCardsFilter`), `sortBy {field, direction}`,
`featuredField`, `selectedFormulaFields [PipeReportFormulaField{label,
indexName, selectedFormula, sum, avg, min, max, count}]`, `cardCount`,
`createdAt`, `lastUpdatedAt`.
**OrganizationReport**: idem + `repos [Pipe]` (multi-pipe).
**ReportCardsFilter**: árvore `{operator: and|or, queries:[…], groups:[…]}`;
cada query usa `ReportCardsFilterQueryOperators` e campos filtráveis
(`PipeReportFilterableFields{name, label, type, options, visible, archived}`).
Exportação assíncrona para XLSX (`exportPipeReport`, `exportOrganizationReport`
→ `PipeReportExport` com estado `ExportationState`). `pipeReportColumns`.
Também: `exportPipeAuditLogsReport` (log de auditoria por pipe, filtro por
usuário), `export-org-audit-logs-report`.

### 1.17 Public form / formulários
`PublicFormSettings`/`PublicFormInternal`: `active`, `title`, `description`,
`logo`, `brandColor`, `backgroundColor`, `backgroundImage`,
`submitButtonText`, `afterSubmitMessage`, `displayPipefyLogo`,
`canHidePipefyLogo`, `showSubmitAnotherResponseButton`,
`reuseLastSubmissionResponse`, `captchaEnabled` (hCaptcha),
`submitterEmailCollectionEnabled` + `submitterEmailCollectionMethod`
(required/optional/from_existing_email_field) + `submitterEmailField`,
`organizationName`, `url/public_url`.
**Public phase form**: `configurePublicPhaseFormLink(cardId, enable)` gera link
público para preencher os campos de **uma fase** de um card específico (sem login).
`filterAuthorizedFormsToMe`: forms autorizados para guests. `repoItemForm`.
`ResourceVisibility{type: internal|private|public, users, groups, url}` para o start form.

### 1.18 Summary / layout do card
`SummaryAttribute.id`: id de campo ou atributo fixo — `id, title,
current_phase, labels, due_date, created_by, assignees, finished_at,
created_at, status, updated_at, last_comment, last_comment_at`.
`setSummaryAttributes(pipe_id|table_id, summary_attributes)`.

### 1.19 Tarefas (tasks) — guias
`Task`: `id`, `title`, `done`, `countFulfilled`, `cardId`, `dueDate`, `phase`,
`repo`, `phaseFormLink {url, slug}`, `assignment {type, status}`,
`assignees [{type, status, user}]`. Criada em um card, na fase atual,
enviando e-mail com link para os responsáveis (`createTask(cardId, emails,
title)`); query `tasks(organizationId, status: open|done|all, pipeUuids)` =
"Minhas tarefas". Ligada à ação de automação `send_a_task` e ao
`Phase.identifyTask`.

### 1.20 Outros objetos
- **Notification**: `event` (enum §2.8), `text`, `link`, `referenceId/Type/Title`, `senderName`, `viewed`, `createdAt`.
- **Tag / TagCategory**: etiquetas organizacionais para pipes e databases (`visibleToMembers`, categoria default).
- **CardsImportation / RecordsImportation**: import XLSX com mapeamento de colunas (assignees, phase, due date, labels, fields / status) e status (enqueued, importing, failed, imported).
- **Batch operations** (guias): `batchUpsert` assíncrono via CSV/JSON, com `callbackUrl`, `suppressAutomations`, `suppressWebhooks`, `resultFile`.
- **Activities** (guias): timeline do card = `PhaseActivity{timestamp, kind, target, direction}` + `EmailActivity`.
- **Repo snapshots / versions** (beta): snapshot da estrutura (fases, campos, automações, condicionais), sandbox editável (`createRepoVersion`) e deploy (`deployRepoVersion`), restore.
- **Interfaces / Portals**: páginas com elementos (`InterfacePageElementType`: text, table, field, embedLink, embedVideo, embedImage, button, divider, link, forms, pages, subPortal, automationButton, contentBlock, document); visibilidade internal/private/public; sub-portais.
- **AI agents**: `AiAgent` (instruction, behaviors, dataSources/knowledge base, repoUuid, status), créditos de IA.
- **Ticket**: visão mínima de card para portal (fieldValues, phasesHistory).
- **PlatformApp**: apps (card-badges, card-buttons, card-tab, pipe-buttons, pipe-view) com armazenamento chave/valor por escopo organization|pipe|card e visibilidade private|public.
- **ChannelConfiguration**: canal WhatsApp Business (status active/blocked/disabled/pending).
- **IdentityPropagationConfiguration**: OAuth client-credentials para webhooks com propagação de identidade.

---

## 2. Enums e listas de valores

### 2.1 Tipos de campo (field types)
Lista de `CreatePhaseFieldInput.type` / `CreateTableFieldInput.type`:
`assignee_select`, `attachment`, `checklist_horizontal`, `checklist_vertical`,
`cnpj`, `connector`, `cpf`, `currency`, `date`, `datetime`, `due_date`,
`email`, `id`, `label_select`, `long_text`, `number`, `phone`,
`radio_horizontal`, `radio_vertical`, `select`, `short_text`, `statement`,
`time` — **23 criáveis**. Aparecem ainda como tipos existentes: `formula` e
`dynamic_content` (conteúdo dinâmico). Objetos por tipo: AssigneeField,
AttachmentField, ChecklistHorizontalField, ChecklistVerticalField, CnpjField,
ConnectorField, CpfField, CurrencyField, DateField, DatetimeField,
DueDateField, DynamicContentField, EmailField, IdField, LabelField,
LongTextField, NumberField, PhoneField, RadioHorizontalField,
RadioVerticalField, SelectField, ShortTextField, StatementField, TimeField.
(`FieldTypeEnum` = `long_text`, `short_text` — só para setup de apps.)

### 2.2 Cores, ícones
- `Colors`: blue, cyan, gray, green, indigo, lime, pink, purple, orange, red, sky, yellow.
- Ícones de pipe/tabela (string): airplane, at, axe, badge, bag, boat, briefing, bug, bullhorn, calendar, cart, cat, chart-zoom, chart2, chat, check, checklist, compass, contract, dog, eiffel, emo, finish-flag, flame, frame, frog, game, github, globe, growth, hr-process, hr-requests, ice, juice, lamp, lemonade, liberty, like, mac, magic, map, message, mkt-requests, money, onboarding, pacman, pacman1, payable, phone, pipefy, pizza, planet, plug, receivables, receive, recruitment-requests, reload, rocket, sales, skull, snow-flake, star, target, task, task-management, trophy, underwear.
- Indústrias (`CreateOrganizationInput.industry`): construction, consulting, education, energy, financial_services, health, legal_services, manufacturing, marketing, non_profit_organization, public_sector, retail, tourism, technology, telecommunications, transportation, others.

### 2.3 Operadores de condição
- **Condicionais e automações** (`ConditionExpression.operation`): equals, not_equals, present, blank, string_contains, string_not_contains, number_greater_than, number_less_than, date_is_today, date_is_yesterday, date_in_current_week, date_in_last_week, date_in_current_month, date_in_last_month, date_in_current_year, date_in_last_year, date_is, date_is_after, date_is_before (19).
- **Ações de condicional** (`FieldConditionActionInput.actionId`): hide, show (descrição do objeto cita também able/disable). `ConditionFieldActions` (estado do campo): hidden.
- **Relatórios** (`ReportCardsFilterQueryOperators`): eq, not_eq, contains, not_contains, gt, gte, lt, lte, exists, not_exists, unknown, period. Grupos (`ReportCardsFilterGroupOperators`): and, or. Tipos filtráveis (`ReportCardsFilterFieldTypes`): email, number, string, group_select, select, date, boolean.
- **Busca avançada** (`AdvancedSearchOperators`, query `allCards`): equal, gt, gte, lt, lte, com `AND`/`OR` aninhados.
- **Busca simples** (`CardSearch`): title, assignee_ids, label_ids, ignore_ids, include_done, inbox_emails_read, `search_strategy` (`CardSearchStrategy`: union, intersection). `TableRecordSearch` + orderField/orderDirection. `findCards/findRecords(fieldId, fieldValue)`.
- `UpdateFieldValuesOperators` (`updateFieldsValues`, até 30 campos por chamada): ADD, REMOVE, REPLACE (ADD/REMOVE só para listas: anexos, assignees, labels, conexões, checklists).

### 2.4 Automação
- **Eventos** (`AutomationsEvents`): card_moved, field_updated, card_created, scheduler, sla_based, card_left_phase, card_inbox_received_email, all_children_in_phase, http_response_received, manually_triggered (10).
- `kindOfSla` (para sla_based): Expired, Late, Overdue.
- **Ações** (`AutomationsActions`): generate_with_ai, send_a_task, send_email_template, move_single_card, update_card_field, create_connected_card, create_card, move_parent_card, distribute_assignments, run_a_formula, send_http_request, apply_sla_rules, schedule_create_card, move_multiple_cards (14).
- `scheduler_frequency`: hourly, daily, weekly, monthly (+ cron).
- `FieldMap.inputMode`: fixed_value, copy_from, fill_with_ai.
- `AutomatedFormulaOperation` (run_a_formula): SUM, AVERAGE, MIN, MAX, MULTIPLY, DIVIDE, SUBTRACT, COUNT, ROUND, IF_NULL.
- `DistributeAssignmentAutomationStrategyGQLEnum`: ROUND_ROBIN, RANDOM.
- `HttpRequestMethodTypeGQLEnum`: POST, PUT, PATCH, DELETE, GET. `AutomationHttpAuthentication`: api_key, authorization, no_auth, oauth2. `HttpRequestAddAuthenticationTo`: HEADERS, QUERY_PARAMS.
- `AutomationSlaRulesHolidayRecurrence`: YEARLY, ONCE.
- `AutomationStatus`: active, inactive, deleted. `AutomationLogStatus`: processing, failed, success.
- `AutomationActionDisabledReason`: ai_disabled_by_org_settings, ai_disabled_by_pipe_settings, premium_action.
- `AutomationSortBy`: created_at, name. `SortBy` (uso): action, action_repo_name, automation_id, createdBy, event, event_repo_name, name, status, usage. `PeriodFilter`: last_3_months, last_month, current_month.

### 2.5 Webhooks
- Pipe/Table: card.comment_create, card.create, card.delete, card.done, card.email_received, card.expired, card.field_update, card.late, card.move, card.overdue.
- Organização: user.invitation_acceptance, user.invitation_sent, user.removal_from_org, user.removal_from_pipe, user.removal_from_table, user.role_set.

### 2.6 Papéis e permissões
- `RolesTypes`: superAdmin, admin, normal, member, externalGuest, companyGuest, creator, myCardsOnly, readAndComment, none.
- Por escopo (`role_name`):
  - **Organização**: `admin` (vê/entra em todos os pipes, gerencia configurações), `normal` (vê e entra em pipes públicos), `company_guest` (só cria cards em forms autorizados; vira membro ao criar/ser adicionado a pipe), `external_guest` (só forms autorizados). Também `super_admin`.
  - **Pipe**: `admin` (gerencia pipe), `member` (cria, edita, move), `creator` (só start form), `my_cards_only` (só vê/edita cards que criou ou em que é responsável), `read_and_comment` (só lê e comenta).
  - **Tabela**: `admin`, `member` (vê e cria registros se `authorization=write`).
- `TableAuthorization`: read, write. `Visibility`/`InterfaceVisibility`: internal, private, public. `Resources`: repo, organization, interface.
- `RepoPermissionsInternalGQL`: configure_repo, create_item, delete_item, delete_repo, manage_field, manage_label, show_repo.

### 2.7 Card / fase
- `CardTypeEnum`: card, request, row.
- `IdentifyTaskEnum`: anonymous, identified.
- Status de card (derivados, booleanos): done, late, expired, overdue (+ draft via fase isDraft).
- `PublicFormSubmitterEmailCollectionMethod`: required, optional, from_existing_email_field.
- `InboxEmailType`: sent, received. Estado do e-mail: 0..3.
- Repo attributes ocultáveis: Assignees, Attachments, Checklist, Comments, DueDate, Labels, PDF.

### 2.8 Notificações e outros
- `NotificationEvent`: lateCard, newEmail, importedCardsAssignee, moveCard, expiredCard, overdueCard, newComment, cardAssignee, mention, newChecklist, newRole, doneCard, doneRequest, moveRequest, newRequestEmail, automationLoopDetected.
- `ExportStatus`: created, processing, finished, failed. `ExportationState`: processing, done, failed.
- `PipeReportSortField`: ID, NAME, CREATED_AT. `Sort`/`OrderFilter`/`SortDirection`/`SortOrder`: asc, desc.
- `SubscriptionLimits`: ai_credits, pipes, users, cards, interfaces, records.
- `TagResourceTypeEnum`: pipe, database. `TokenExpirationTimeUnit`: seconds, minutes, hours, days.
- `InterfaceSubType`: portal, sub_portal. `InterfaceSubTypeFilter`: all, interface, portal, sub_portal. `InterfacePageElementType`: ver §1.20.
- `StatusEnum` (canal): active, blocked, disabled, pending. `TypeEnum`: whatsapp_business.
- IA: `AiAgentSortBy` (last_execution, name), `AiBehaviorCapabilityType` (advanced_ocr), `AutomationSimulationActions` (generate_with_ai).

---

## 3. Mutations por objeto (cada uma ≈ uma funcionalidade)

Fonte principal: api-docs (103). Marcadas com † as que só aparecem nos guias
de developers.pipefy.com.

| Objeto | Mutations |
| --- | --- |
| Organization | createOrganization, updateOrganization (nome, only_admin_can_create_pipes, only_admin_can_invite_users), deleteOrganization, updateAiSettings |
| Membros / papéis | inviteMembers (org/pipe/tabela, com mensagem), setRole, setRoles, removeUserFromOrg, removeUserFromPipe, removeMembersFromPipe (usuários + grupos), removeUserFromTable, createCustomRole, deleteCustomRole, saveRolePermission, inviteUserToGroup |
| Service accounts / SSO | createServiceAccount, deleteServiceAccount, createIdentityPropagationConfiguration |
| Pipe | createPipe (com fases, labels, membros, start form fields e preferências em uma chamada), updatePipe (SLA, ícone, cor, noun, políticas, public, public_form + settings, title_field_id, preferences), deletePipe, clonePipes (de templates), setFavoritePipes, setSummaryAttributes, updateRepoPreferences†, createRepoSnapshot†, createRepoVersion†, deployRepoVersion†, restoreRepoToSnapshot†, renameRepoSnapshot† |
| Phase | createPhase (index, done, lateness_time, can_receive_card_directly_from_draft, connectNeighbors†), updatePhase (+ jumpTargetIds†), deletePhase, phaseSettings (cor, identifyTask, teamMemberIds, SLA), updatePhaseJumps† |
| PhaseField | createPhaseField, updatePhaseField, deletePhaseField, archiveField†, unarchiveField†, moveUpPhaseField†, moveDownPhaseField† |
| FieldCondition | createFieldCondition, updateFieldCondition, deleteFieldCondition, setFieldConditionOrder |
| Label | createLabel, updateLabel, deleteLabel |
| Card | createCard (pipe, fase, campos, assignees, labels, due_date, attachments, parent_ids, throughConnectors, cardType, submitterEmail), updateCard (título, assignees, labels, due_date), deleteCard, moveCardToPhase, updateCardField, updateFieldsValues (ADD/REMOVE/REPLACE em lote), cardDuplicate† (fullCopy), cardsImporter, batchUpsert†, configurePublicPhaseFormLink |
| CardRelation / PipeRelation | createCardRelation, createPipeRelation, updatePipeRelation, deletePipeRelation |
| Comment | createComment, updateComment, deleteComment |
| Attachment / upload | createPresignedUrl, createPresignedUrlForPipePdfTemplate (template de PDF do pipe) |
| Task | createTask† |
| Inbox / e-mail | createInboxEmail, sendInboxEmail, deleteInboxEmail, createSmtpConfiguration, createSmtpCustomEmailWithConfiguration, update/delete SMTP†, setDefaultOrganizationSmtpCustomEmail† |
| Table | createTable, updateTable, deleteTable |
| TableField | createTableField, updateTableField, deleteTableField, setTableFieldOrder |
| TableRecord | createTableRecord, createTableRecordInRestrictedTable, updateTableRecord (título, status, due_date), deleteTableRecord, setTableRecordFieldValue, recordsImporter |
| Automation | createAutomation, updateAutomation, deleteAutomation, createAutomationSimulation, createAutomationJobsExport |
| Webhook | createWebhook, updateWebhook, deleteWebhook, createOrganizationWebhook, updateOrganizationWebhook, deleteOrganizationWebhook |
| Relatórios | createPipeReport, updatePipeReport, deletePipeReport, duplicatePipeReport†, exportPipeReport, createOrganizationReport, updateOrganizationReport, deleteOrganizationReport, exportOrganizationReport, exportPipeAuditLogsReport, exportOrgAuditLogsReport†, exportOrganizationMembers† |
| Tags | createTag, createTagsInBulk, updateTag, updateTagCategory, updateTagsVisibilityByCategory, addTagsToResource, removeTagsFromResource† |
| IA | createAiAgent, updateAiAgent, updateAiAgentStatus, deleteAiAgent, duplicateAiAgent†, knowledge base (create/update/delete document, plain text, data lookup)†, LLM providers (create/update/delete/set active)† |

Queries notáveis: `card`, `cards` (CardSearch), `allCards` (AdvancedSearch),
`findCards`, `findRecords`, `cardSearch`† (multi-pipe com ReportCardsFilter),
`phase`, `pipe`, `pipes`, `pipeFlow`, `pipe_relations`, `table`, `tables`,
`table_record(s)`, `table_relations`, `connectedTableRecords`,
`autoFillFields` (prévia do auto-preenchimento de um filho), `fieldCondition`,
`conditionalField` (quais campos esconder dado um estado), `field`
(dependências), `automation(s)`, `automationActions`, `automationEvents`,
`automationEventsByPhase`, `automationLogs(ByRepo)`, `automationInitialValues`,
`inbox_emails`, `emailTemplates`†, `parsedEmailTemplate`†, `activities`†,
`tasks`†/`task`†, `notifications`, `me`, `organization(s)`,
`organizationSettings`, `groups`, `availableRoles`, `usersSuggestions`,
`pipeReports`, `pipeReportColumns`, `pipeReportFilterableFields`,
`organizationReport(s)`, `cardsImportations`, `recordsImportations`,
`pipe_templates`, `tagCategories`, `tagsByCategory`, `ticket`.

---

## 4. Regras de negócio reveladas

1. **Transições de fase são configuráveis.** Cada fase tem um conjunto de destinos permitidos ("Move card settings" / jump targets). Ao criar uma fase, ela é ligada às vizinhas automaticamente (opção de não ligar). A lista substitui o conjunto inteiro; destino não pode ser a própria fase, o start form, nem fase de outro pipe. `next_phase_ids` = destinos com índice maior; `previous_phase_ids` = menor. `moveCardToPhase` falha se o destino não é alcançável ou se há **campos obrigatórios da fase vazios/ inválidos**.
2. **Start form = fase draft.** `startFormPhaseId`/`isDraft`; campos do start form são PhaseFields de uma fase especial; `can_receive_card_directly_from_draft` permite criar card direto em fase não inicial.
3. **Fase final** (`done=true`) marca o card como concluído (`done`, `finished_at`); relatórios/listas usam `include_done`.
4. **Três relógios de SLA distintos**: `late` (tempo na fase > `lateness_time` da fase), `expired` (idade do card > SLA do pipe `expiration_time_by_unit × expiration_unit`), `overdue` (passou `due_date`). Opção "contar só dias úteis"; ação `apply_sla_rules` define expediente por dia + feriados + fuso. Cada um gera webhook/notificação/gatilho (`sla_based` com kindOfSla).
5. **Campo `editable=false`**: só pode ser editado na própria fase; não é copiado na duplicação.
6. **Campo `unique`** (tabelas): valor único; nunca copiado em duplicação.
7. **`custom_validation`** = regex aplicada ao valor.
8. **`sync_with_card`**: campo de fase espelha atributo fixo do card (due date, responsáveis, labels).
9. **Conectores**: apontam para pipe **ou** tabela; flags `canCreateNewConnected`, `canConnectExisting`, `canConnectMultiples`; regras pai/filho: filho deve existir para finalizar o pai, todos os filhos concluídos para finalizar/mover o pai. Uma relação "single" não aceita segunda conexão.
10. **Relações de pipe** (pai→filho) com **auto-fill** de campos do filho a partir do pai (`copy_from`, `fixed_value`, `fill_with_ai`); conexões nascem de relação ou de campo (`sourceType`). Criação encadeada via `throughConnectors`.
11. **Condicionais** são por fase (inclui start form), ordenadas, com grupos AND/OR e ações hide/show sobre campos; o campo sabe se "dispara condicionais".
12. **Automações**: evento → condição opcional → ação; evento e ação podem estar em repos diferentes; catálogo define compatibilidade (blacklists, blocklist por fase); detecção de loop; contagem de uso (limite por plano); simulação antes de salvar; logs por execução.
13. **Webhooks com filtro** permitem só uma ação; headers custom; propagação de identidade.
14. **Permissões de pipe**: `only_admin_can_remove_cards`, `only_assignees_can_edit_cards`; papel `my_cards_only` restringe a visão aos cards criados/atribuídos; `read_and_comment`; `creator` só start form.
15. **Duplicar card**: cai sempre na primeira fase; padrão copia só start form + título; `fullCopy` copia demais fases, responsáveis, labels, vencimento, conexões; nunca copia anexos, comentários, checklists, e-mails, histórico; dispara automações de criação.
16. **Card por e-mail**: cada card e pipe tem endereço de e-mail; e-mails recebidos viram InboxEmail e podem disparar automação (`card_inbox_received_email`).
17. **Limites da API**: complexidade 50.000, profundidade 15, 33 s; paginação Relay (máx. 50 por página).
18. **Excluir campo** exige verificar dependências (automações, condicionais, conexões, conteúdo dinâmico, templates, agentes) — há arquivamento como alternativa.
19. **Guests**: company_guest/external_guest só criam cards em forms autorizados (portal), cards desse tipo são `request`.
20. **Relatórios** podem ter colunas de fórmula com agregados (sum/avg/min/max/count) e um campo em destaque.

---

## 5. Diferenças para o schema do Fluxos (`server/src/db/schema.ts`)

### 5.1 Tabelas que faltam
| Falta | Para quê | Sugestão |
| --- | --- | --- |
| `phase_transitions` | destinos permitidos por fase (jump targets) | `(phase_id, target_phase_id)` PK composta |
| `card_phase_history` | `phases_history` (firstTimeIn, lastTimeIn, lastTimeOut, duration, became_late) — base de relatórios de tempo por fase | derivável de `card_events`, mas tabela materializada simplifica |
| `pipe_relations` (+ `relation_field_maps`) | relação pai/filho entre repos com flags e auto-fill | `parent_repo_type/id`, `child_repo_type/id`, flags, `auto_fill_enabled`; maps `(relation_id, parent_field_id, child_field_id/value, input_mode)` |
| `field_conditions` (+ `field_condition_actions`) | condicionais de campo por fase | `phase_id`, `name`, `index`, `condition` JSON (expressions + structure); ações `(field_id, action hide/show, when_evaluator)` |
| `pipe_members` / `table_members` | papel por repo (admin, member, creator, my_cards_only, read_and_comment) | `(repo_type, repo_id, user_id|group_id, role)` |
| `groups`, `group_members` | grupos de usuários | |
| `custom_roles`, `role_permissions` | papéis customizados | opcional/fase 2 |
| `webhooks` | webhooks de pipe/tabela/org | `scope`, `repo_id`, `url`, `email`, `headers` JSON, `actions` JSON, `filters` JSON, `active` |
| `webhook_deliveries` | log/retentativas | |
| `inbox_emails` (+ anexos) | e-mail por card (enviado/recebido) | `card_id`, `type`, from/to/cc/bcc, subject, body, html, `state`, `message_id`, `sent_via_automation` |
| `email_templates` | templates com placeholders (ação send_email_template) | `repo_id`, name, subject, body, from/to/cc/bcc, `is_default` |
| `smtp_configurations` | remetente próprio | opcional |
| `notifications` | central de notificações (lateCard, mention, moveCard…) | `user_id`, `event`, `reference_type/id`, `text`, `link`, `viewed` |
| `tasks` (+ `task_assignees`) | tarefas de fase com link público | `card_id`, `phase_id`, `title`, `done`, `due_date`, `slug`; assignees por e-mail |
| `table_record_statuses` | status de registros de tabela | `(table_id, name, position)` |
| `record_assignees`, `record_labels` | registros também têm responsáveis/labels | ou generalizar `card_assignees`/`card_labels` para "item" |
| `automation_logs` detalhado | já existe `automation_runs`; falta `message`/`error_type` e status `processing` | ajustar enum |
| `imports` (cards/records) | histórico de importação XLSX | `repo_id`, `url`, `status`, `count` |
| `report_exports` | exportações assíncronas | `report_id`, `status`, `file_url` |
| `audit_logs` | export de auditoria do pipe/org | pode reaproveitar `card_events` + eventos de configuração |
| `tags`, `tag_categories`, `resource_tags` | organizar pipes/databases | baixa prioridade |
| `phase_team_members` | responsáveis padrão da fase (`teamMembers`) | |
| `public_phase_form_links` | link público para preencher a fase de um card | `card_id`, `phase_id`, `slug`, `enabled` |
| `user_preferences` / favoritos | `favoritePipeIds`, sidebar etc. | JSON em `users` |

### 5.2 Colunas que faltam em tabelas existentes
- **organizations**: `uuid`, `only_admin_can_create_pipes`, `only_admin_can_invite_users`, `locale`, `logo_url`, `header_color`, `company_guest_can_create_pipe`.
- **users**: `locale`, `timezone`, `phone`, `display_name`, `last_sign_in_at`, `preferences` JSON.
- **memberships.role**: hoje `admin|member|guest`; Pipefy separa `super_admin`, `admin`, `normal`, `company_guest`, `external_guest`.
- **pipes**: `icon`, `color`, `noun`, `create_card_label`, `title_field_id`, `summary_attributes` JSON, `public`, `only_admin_can_remove_cards`, `only_assignees_can_edit_cards`, `sla_seconds` (expiration_time_by_unit×unit), `count_only_weekdays`, `email_address`, `preferences` JSON (hiddenTopButtons, mainTabViews, inboxEmailEnabled, hiddenStartFormAttributes, startFormTitle), `start_form_visibility`, `cloned_from_id`, `archived/deleted_at`.
- **phases**: `done` (já há `is_end`, mas o significado é "fase final = card concluído"), `is_draft` (start form como fase — hoje `is_start` parece significar "primeira fase"; esclarecer), `lateness_seconds` (SLA da fase), `can_receive_card_directly_from_draft`, `identify_task`, `custom_sorting` JSON, `uuid`. `position` int → Pipefy usa float `index` (inserção entre fases sem reindexar).
- **fields**: `uuid`, `slug`/`index_name` (id estável usado em fórmulas, filtros e templates), `description`, `help`, `editable`, `minimal_view`, `custom_validation`, `is_multiple`, `sync_with_card`, `unique`, `archived_at`, `deleted_at`; para `connector`: `connected_repo_type`, `connected_repo_id`, `can_connect_existing`, `can_connect_multiples`, `can_create_new_connected`, `child_must_exist_to_finish_parent`, `all_children_must_be_done_to_finish_parent`, `all_children_must_be_done_to_move_parent` (pode ir em `settings` JSON, mas são consultadas em regras de movimento — vale ter colunas). Também `pipeId+phaseId` não cobre campos de **tabela** (há `table_fields` separado; ok) — mas `table_fields` precisa de `required`, `description`, `help`, `unique`, `custom_validation`, flags de conector.
- **labels**: `table_id` (labels também em tabelas) → trocar `pipe_id` por `repo_type/repo_id`.
- **cards**: `uuid`, `finished_at`, `expired`, `overdue` (ou calculados), `should_become_late_at`, `became_late_at`, `should_expire_at`, `expired_at`, `current_phase_entered_at`, `card_type` (card/request/row), `public_form_submitter_email`, `creator_email`, `email_address`, `deleted_at`. `number` é global; Pipefy expõe `suid`/`id` — ok.
- **card_fields**: `updated_at`, e colunas normalizadas para busca/relatório (`float_value`, `date_value`, `datetime_value`, `array_value`) ou índice; `generated_by_ai` opcional.
- **card_assignees**: `assigned_at`.
- **comments**: `updated_at`, `deleted_at` (update/delete existem na API).
- **attachments**: `phase_id`, `field_id`, `content_type`, `path` (chave no storage).
- **card_events**: tipos adicionais — `comment`, `email_received/sent`, `late`, `expired`, `overdue`, `done`, `field_update`, `assignee_change`, `label_change` — para alimentar webhooks/notificações/activities.
- **data_tables**: `uuid`, `description`, `icon`, `color`, `noun`, `public`, `authorization` (read/write), `title_field_id`, `create_record_button_label`, `summary_attributes`, `public_form`.
- **table_records**: `status_id`, `due_date`, `done`, `finished_at`, `is_sample`.
- **item_links**: `source_type` (`relation` | `field`) + `relation_id`; `field_id` já cobre conector.
- **automations**:
  - `event_type` hoje: card_enters_phase, field_updated, card_created, schedule, alert. Faltam: `card_left_phase`, `all_children_in_phase`, `card_inbox_received_email`, `http_response_received`, `manually_triggered`; `alert` deve virar `sla_based` com `kind` (late/expired/overdue).
  - `action_type` hoje: move_card, update_field, create_connected_card, create_record, notify. Faltam: `create_card` (em outro pipe), `move_parent_card`, `move_multiple_cards`, `distribute_assignments` (round robin/random), `run_a_formula`, `send_http_request`, `send_email_template`, `send_a_task`, `apply_sla_rules`, `schedule_create_card`, `generate_with_ai`.
  - colunas: `event_repo_id`, `action_repo_id` (cross-pipe), `scheduler_cron` JSON, `scheduler_frequency`, `search_for` JSON, `response_schema`, `trigger_automation_id` (encadeamento), `created_by`.
- **automation_runs.status**: acrescentar `processing`; colunas `message`, `error_type`.
- **public_forms**: `description`, `logo`, `brand_color`, `background_color/image`, `submit_button_text`, `after_submit_message`, `show_submit_another`, `reuse_last_submission`, `captcha_enabled`, `submitter_email_mode` (required/optional/from_field) + `submitter_email_field_id`, `visibility` (internal/private/public) e lista de usuários/grupos autorizados; suporte a forms de **tabela** (hoje só `pipe_id`).
- **reports**: estrutura explícita — `fields` (colunas), `filter` (árvore and/or com operadores §2.3), `sort_by`, `featured_field`, `formulas` (agregados), `color`, `pipe_ids` (multi-pipe para scope company), `updated_at`.

### 5.3 Observações de modelagem
- Generalizar **Repo** (pipe|table) reduz duplicação: labels, membros, webhooks, public form, summary, conectores e automações referenciam repos dos dois tipos.
- `fields.phase_id` notNull: no Pipefy o start form é uma fase draft, então manter `phase_id` e marcar a fase como `is_draft` resolve campos de start form.
- `position` inteiro → float (`index`) facilita reordenar (moveUp/moveDown e inserção).
- Regras de movimento (transições + obrigatórios + regras de filhos conectados) precisam ser validadas em um único serviço `moveCard`.

---

## 6. Fontes

API reference (gerada do schema):
- https://api-docs.pipefy.com/reference/overview/Card (e Pipe, Phase, Organization, Table, TableRecord, User)
- https://api-docs.pipefy.com/reference/objects/PhaseField — e demais `/reference/objects/<Nome>` (Card, CardField, Phase, Pipe, PipeRelation, TableRelation, FieldCondition, FieldConditionAction, Condition, ConditionExpression, Automation, AutomationActionParams, AutomationEventParams, AutomationActions, AutomationEvents, AutomationLog, AutomationSlaRulesParams, Webhook, InboxEmail, Label, Comment, Attachment, Table, TableField, TableRecord, TableRecordField, TableRecordStatus, PipeReport, OrganizationReport, PublicFormSettings, PublicFormInternal, RepoPreference, RepoPermissionsInternalGQL, Member, OrganizationMember, Role, User, UserPreference, Organization, OrganizationSettings, OrganizationPermissions, Notification, PhaseDetail, cardLateness, CardExpiration, CardRelation, FieldMap, FieldDependency, SummaryAttribute, Group, Tag, ServiceAccount, SmtpConfiguration, Ticket…)
- https://api-docs.pipefy.com/reference/enums/<Nome> (AutomationsEvents, AutomationsActions, RolesTypes, Colors, CardTypeEnum, NotificationEvent, ReportCardsFilterQueryOperators, UpdateFieldValuesOperators, …)
- https://api-docs.pipefy.com/reference/interfaces/<Nome> (FieldType, GenericField, MinimalFieldInterface, Repo, RepoConnection, PublicPipeInterface, PublicFormInterface…)
- https://api-docs.pipefy.com/reference/inputObjects/<Nome> (CreatePhaseFieldInput, CreateCardInput, CreateAutomationInput, ConditionExpressionInput, FieldConditionActionInput, FieldMapInput, CreateWebhookInput, UpdatePipeInput, MemberInput, ReportCardsFilter…)
- https://api-docs.pipefy.com/reference/mutations/<nome> e /reference/queries/<nome>

Guias (developers.pipefy.com/reference/…):
- card-could-not-be-moved-to-phase-error, move-card-to-a-different-phase
- set-phase-transitions, update-phase-jumps, reorder-phase-fields, archive-field, unarchive-field
- create-connected-cards, add-attachments-to-a-card-or-field, duplicate-a-card, batch-upsert, list-card-activities, search-cards
- tasks, create-task, get-phase-task
- email-templates-query, parsed-email-template-query
- create-repo-snapshot, create-repo-version, deploy-repo-version
- update-repo-preferences, search-for-field-dependencies, pipe-table-webhooks, organization-webhooks
- limits-and-best-practices, pagination-basics
- card-badges, card-buttons, store-retrieve-custom-data (Apps SDK)

---

## 7. Lacunas

- **Schema exato de `settings` (JSON) dos campos** (formato de moeda, fórmula, conteúdo dinâmico, máscara) não é documentado; só se sabe que existe.
- **Semântica exata de `expressions_structure`** (qual nível é AND e qual é OR) — a doc diz apenas "grupos de AND e OR"; validar na central de ajuda/UI.
- **Payload dos webhooks** (corpo enviado) não foi extraído em detalhe (guia pipe-table-webhooks tem exemplos; não coberto).
- **Matriz evento×ação** de automações é servida dinamicamente (`automationActions`/`automationEvents`), não está escrita na doc.
- **Formula field** e **dynamic_content**: tipos citados, mas não há input de criação nem descrição das funções (além de `AutomatedFormulaOperation` para automações).
- **Lista completa de permissões** de papéis customizados (`permissionIds`) não aparece.
- **Interfaces/portais e IA** só foram listados superficialmente (fora do núcleo do Fluxos).
- **Algumas mutations dos guias** (snapshots, tasks, cardDuplicate, batchUpsert, updatePhaseJumps, archiveField) não aparecem no api-docs (que parece desatualizado em relação ao schema) — tratadas como existentes, mas sem tipos completos.
- **Regras de SLA com dias úteis/horário comercial**: só a estrutura (`AutomationSlaRulesParams`, `countOnlyWeekDays`) é conhecida, não o algoritmo.
- **Checklist**: não há objeto próprio de item de checklist; valores vivem em `array_value` do campo (contadores no card). Notificação `newChecklist` sugere algo mais — não confirmado.

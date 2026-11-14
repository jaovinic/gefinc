---
description: "Lista de tarefas da feature Painel administrativo (papéis, usuários, sessões, auditoria imutável, exclusão com salvaguardas, e-mail, manutenção e convites)"
---

# Tasks: Painel administrativo

**Input**: Documentos de design em `/specs/005-admin-panel/`
**Prerequisites**: plan.md, spec.md (12 histórias, 62 requisitos funcionais, 21 critérios de sucesso), research.md (D1 a D32), data-model.md, contracts/openapi-delta.md, quickstart.md

**Tests**: Pela constituição (Princípio IV, Test-First), os testes são **obrigatórios** e vêm **antes** das implementações (escrever, ver falhar, depois implementar). Pela emenda 1.4.0, todo recurso administrativo MUST ter teste de isolamento provando que o administrador não acessa dados financeiros de terceiros (SC-004). ITs usam Testcontainers `postgres:16` (nunca H2: gatilhos, `unaccent`, travas consultivas e `TRUNCATE` precisam do banco real) e GreenMail para e-mail. Tarefas de teste levam o marcador `[Teste]`.

**Organization**: Tarefas agrupadas por história de usuário (US1 a US12, na ordem de prioridade da spec). Cada história tem um teste independente e entrega valor verificável. A seção "Implementation Strategy" mostra a ordem de entrega recomendada (fatias F1 a F8), que difere levemente da numeração das histórias.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: história a que pertence (US1 a US12); fases de Pré-requisitos, Foundational e Polish não têm rótulo
- **[Teste]**: tarefa de teste, escrita e vista falhando antes da implementação correspondente
- Todo caminho é relativo à raiz do repositório

## Path Conventions

- Backend: `apps/api-server/src/main/java/com/jvtech/gefinc/<módulo>/` e `apps/api-server/src/test/java/com/jvtech/gefinc/<módulo>/`; migrações em `apps/api-server/src/main/resources/db/migration/`; modelos de e-mail em `apps/api-server/src/main/resources/mail/`
- Módulo novo do painel: `apps/api-server/src/main/java/com/jvtech/gefinc/admin/{common,user,deletion,audit,email,invitation,parameter,system}/` (nenhum import de pacotes financeiros fora de `admin/system/UsageStatsRepository`)
- Contrato e tipos: `packages/core-models/openapi/gefinc.openapi.yaml` (e a cópia `specs/001-personal-finance-management/contracts/openapi.yaml`), `packages/core-models/src/`
- Compartilhado (web e app): `packages/ui-shared/src/lib/<área>/` (Login, interceptor, sessão, aviso de privacidade); o painel **não** vai para `ui-shared`
- Painel (só web): `apps/web-app/src/app/admin/`; shell: `apps/web-app/src/app/layout/shell.ts`; E2E: `apps/web-app-e2e/src/` e `apps/mobile-app-e2e/src/`
- Operação: `docs/operations.md`, `docs/deploy-self-hosted-cloudflare-tunnel.md`, `docker-compose.selfhost.yml`, `.env.example`, `tools/ops/`
- Convenção dos testes de migração: padrão `AccountMigrationV7IT` (migrar até a versão anterior com a API do Flyway, semear, migrar até a última)
- Nenhum app importa código de outro app (Princípio I)
- Commits e PRs **sem** `Co-Authored-By` e sem menção a IA (CLAUDE.md, regra inegociável)

---

## Phase 1: Pré-requisitos (bloqueiam qualquer implementação)

**Purpose**: Infraestrutura de e-mail na `main`, branch alinhada e emenda da constituição aplicada. Nenhum arquivo de aplicação é tocado antes de T001 a T003.

- [x] T001 Abrir o PR da branch `fix/smtp-brevo-async-reset-mail` contra a `main` (`gh pr create --base main`, descrição sem atribuição a IA) e **mesclar** (commits `7af549b` e `cc16559`: SMTP autenticado/STARTTLS, envio assíncrono pós-commit, `MailMetrics`, retry seletivo, log sanitizado). Ação do mantenedor; bloqueante para o painel enviar e-mail em produção (D1, R1) *(concluído pelo mantenedor: já mesclada na `main` e validada em produção)*
- [x] T002 Na branch `005-admin-panel` (confirmar com `git branch --show-current`; não trocar de branch), executar `git merge main` **antes de tocar no `MailService`**; resolver conflitos; conferir que existem `apps/api-server/src/main/java/com/jvtech/gefinc/common/mail/MailService.java`, `MailMetrics.java`, `PasswordResetMailListener.java`, `PasswordResetMailRequested.java` e `apps/api-server/src/main/java/com/jvtech/gefinc/common/config/AsyncConfig.java`
- [x] T003 Aplicar a **emenda 1.4.0** à constituição em `.specify/memory/constitution.md` com o texto de `specs/005-admin-panel/plan.md` > Complexity Tracking > "Texto proposto para a emenda": Princípio III (novo primeiro marcador de estado de revogação e novo marcador "Perfil administrador" com a exceção de `UsageStatsRepository`), Princípio V (terceiro marcador com as 11 tabelas administrativas, `audit_log` append-only, histórico sem FK), Princípio IV (teste de isolamento do administrador, SC-004), Sync Impact Report 1.3.1 → 1.4.0 (MINOR) e `Last Amended`; reverificar `.specify/templates/{plan,tasks,spec,checklist}-template.md`. Usar `/speckit-constitution`; PR próprio ou no mesmo PR, aprovado antes da implementação (emenda 1.4.0 aplicada em 2026-11-14)
- [x] T004 [P] Registrar a linha de base verde após o merge: `./mvnw -f apps/api-server/pom.xml verify` (ou o comando do projeto) e `npx nx run-many -t test lint -p ui-shared web-app mobile-app`; anotar a contagem de testes para a regressão final (D31) — Linha de base (2026-11-14): api-server `mvnw verify` 450 testes, 0 falhas, 0 erros, spotless OK; ui-shared 863 testes OK.
- [x] T005 [P] Commitar (sem co-autoria) os artefatos do plano e este `specs/005-admin-panel/tasks.md` na branch `005-admin-panel` (`plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/openapi-delta.md`, `tasks.md`), e abrir o PR de rascunho

**Checkpoint**: e-mail na `main`, `005-admin-panel` atualizada, constituição 1.4.0 aprovada. Só então começam as fases seguintes.

---

## Phase 2: Foundational (Blocking Prerequisites, fatia F1)

**Purpose**: Migrações V14 a V20, apoio de testes, componentes transversais (`Pseudonymizer`, `ClientIpResolver`, `PerKeyRateLimiter`, `DeviceLabelResolver`), `MailService` generalizado, `AuditService`, reautenticação e limite de taxa, códigos de erro, contrato e configuração de implantação. NENHUMA história começa antes desta fase.

### Apoio de testes e testes (escritos antes)

- [x] T006 Estender `apps/api-server/src/test/java/com/jvtech/gefinc/support/IntegrationTestBase.java` e criar `apps/api-server/src/test/java/com/jvtech/gefinc/support/AdminSeed.java` (Testcontainers): `AdminSeed.restore` recria os motivos e parâmetros semeados após o `TRUNCATE` dos testes; `session_replication_role = replica` durante o `TRUNCATE` para não esbarrar nos gatilhos (D10, R6); helpers `createUser`, `createAdmin`, `createRoot` (este via `SET LOCAL gefinc.allow_root_change = 'on'`); `PSEUDONYM_SECRET` fixo em `apps/api-server/src/test/resources/application-test.yml`; documentar no cabeçalho da classe
- [x] T007 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/common/security/PseudonymizerTest.java`: HMAC-SHA256 truncado a 32 hex, estável para a mesma entrada, diferente com outro segredo, rótulo `anônimo-<8 hex>`, entradas de domínios diferentes (id, IP, e-mail normalizado) não colidem por prefixo; a aplicação **falha ao subir** sem `PSEUDONYM_SECRET` (< 32 bytes) no perfil de produção; ver falhar
- [x] T008 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/common/security/ClientIpResolverTest.java`: `CF-Connecting-IP` só é aceito quando a conexão vem de um CIDR de `TRUSTED_PROXY_CIDRS`; lista vazia = nunca confia; origem não confiável ignora o cabeçalho (IP forjado); valor inválido ou múltiplo cai no endereço remoto; IPv6; `X-Forwarded-For` nunca é usado (R2); ver falhar
- [x] T009 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/common/security/DeviceLabelResolverTest.java`: rótulo grosseiro (tipo de dispositivo e navegador, por exemplo "Chrome em Windows", "App Android") a partir de `User-Agent` e `X-Client`; nunca devolve o `User-Agent` bruto; desconhecido vira "Dispositivo desconhecido"; ≤ 80 caracteres; ver falhar
- [x] T010 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/common/ratelimit/PerKeyRateLimiterTest.java` (janela deslizante, limpeza de chaves, `MutableClock`) e conferir que `apps/api-server/src/test/java/com/jvtech/gefinc/auth/LoginThrottlingIT.java` e `apps/api-server/src/test/java/com/jvtech/gefinc/auth/PasswordResetIT.java` continuam verdes após a extração; ver falhar
- [x] T011 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/migration/AdminMigrationV14V15IT.java`: V14 cria `system_parameters` (3 sementes, `ck_sp_bool`) e `deletion_reasons` (4 motivos iniciais ativos, `ux_dr_name` sem diferenciar caixa); V15 cria `account_deletion_requests` (`ck_adr_admin_reason`, `ck_adr_user_mode`, `ux_adr_active`) e `user_notices`; violações de CHECK/UNIQUE são recusadas pelo banco
- [x] T012 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/migration/AdminMigrationV16IT.java` (migração parcial, padrão `AccountMigrationV7IT`): usuários antigos recebem `role='USER'`; exclusões pendentes legadas ganham `deletion_due_at = deletion_requested_at + 30 dias`, `deletion_origin='USER'` e uma linha no livro-razão; `ck_users_deletion_consistent` e `ck_users_root_active` recusam estados incoerentes; `CREATE EXTENSION unaccent` disponível; índices criados
- [x] T013 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/migration/AdminMigrationV17IT.java` (migração parcial): uma linha de `auth_sessions` por `family_id` de `refresh_tokens` (`created_at` mínimo, `last_used_at` máximo, `expires_at` máximo, revogada se todos os tokens da família estão revogados); `client_ip` nulo nas antigas; exclusão do usuário apaga as sessões por cascata
- [x] T014 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/audit/AuditImmutabilityIT.java` (V18): `UPDATE`, `DELETE` e `TRUNCATE` em `audit_log` falham no banco (`restrict_violation`) mesmo para o dono; `INSERT` funciona; `audit_log_client` apaga por cascata ao excluir o usuário e aceita `user_id` nulo (visitante); `ck_al_action` recusa ação fora do catálogo
- [x] T015 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/migration/AdminMigrationV19V20IT.java`: `ck_ed_failure` (motivo de falha ⇔ `FAILED`), `ck_pc_retained` (endereço retido só em `PENDING` com `retained_until`), `ck_inv_email` (e-mail em claro só se `PENDING`), `ux_inv_pending_email`, `ux_pec_user_pending` e `attempts` entre 0 e 5
- [x] T016 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/common/mail/MailServiceTest.java` ampliado (sobre a versão da branch de e-mail): `send(OutgoingMail, DeliveryMode)` devolve `MailOutcome` (`SENT` ou `FAILED` com causa em `AUTHENTICATION`, `PERMANENT_REJECTION`, `TRANSIENT_EXHAUSTED`, `TIMEOUT`, `NOT_CONFIGURED`, `OTHER`); `SYNC_ONCE` tenta uma vez e devolve o resultado na hora; `WITH_RETRY` mantém o retry seletivo atual; nenhum log contém destinatário, corpo, link ou código; ver falhar
- [x] T017 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/email/EmailDeliveryRecorderIT.java` (GreenMail): cada envio grava uma linha em `email_deliveries` (`kind`, `status`, `failure_reason`, `attempts`, destinatário em claro e `recipient_ref` HMAC) **sem** corpo, assunto, link, token, código nem mensagem técnica; a redefinição de senha existente passa a ser registrada; falha do registro não impede o envio
- [x] T018 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/audit/AuditServiceIT.java`: gravação de ação com autor, alvo, resultado, `reason_text` e `details` restritos às chaves de `AuditKey` (varre `details`: nunca senha, token, link, código, e-mail, nome, IP nem valor monetário, `AuditDetailsLeakIT` embutido); `AdminActionExecutor` faz **audit-or-rollback** (falha ao auditar desfaz a ação); `client_ref` e `dedupe_key` são HMAC; ver falhar
- [x] T019 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/audit/AuditDedupeIT.java` (`MutableClock`): tentativas negadas (`ACCESS_DENIED`, `REVERT_ATTEMPT`, recusas de reautenticação) do mesmo autor/IP, decisão-alvo e tipo geram **um** registro por janela de 15 minutos; repetições na janela só incrementam o contador do `MeterRegistry`; após 15 min um novo registro; consulta por `dedupe_key` usa o índice parcial (FR-053)
- [x] T020 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/common/ReauthIT.java` com um controlador de teste (`@TestConfiguration`) protegido por `Reauthenticator`: senha válida passa; inválida → `403 REAUTH_FAILED` auditado (deduplicado); respeita o limite de login da conta; a 5ª falha consecutiva **revoga a sessão atual**; sucesso zera o contador (FR-035, SC-013)
- [x] T021 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/common/AdminRateLimitIT.java` com controlador de teste: 30 ações mutantes por minuto por administrador e 10 destrutivas por 15 minutos; excedido → `429` + `Retry-After`, auditado uma vez por janela; leituras (`GET`) não contam; administradores diferentes têm contadores independentes (FR-055)

### Implementação

- [x] T022 Criar `apps/api-server/src/main/resources/db/migration/V14__admin_system_parameters_and_deletion_reasons.sql` (`system_parameters` com sementes `SIGNUPS_OPEN`, `MAINTENANCE_ENABLED`, `MAINTENANCE_MESSAGE`; `deletion_reasons` com os 4 motivos iniciais e mensagens genéricas em pt-BR)
- [x] T023 Criar `apps/api-server/src/main/resources/db/migration/V15__account_deletion_requests_and_user_notices.sql` (livro-razão `account_deletion_requests` com origem, modo, prazo, motivo fixado, `supersedes_id`, `status`, `notice_state`, `ux_adr_active`; `user_notices`)
- [x] T024 Criar `apps/api-server/src/main/resources/db/migration/V16__users_admin_columns_and_guards.sql` (colunas `role`, `suspended_at`, `last_access_at`, `deletion_due_at`, `deletion_origin`, `deletion_request_id`; `ck_users_role`, `ck_users_deletion_origin`, `ck_users_deletion_consistent`, `ck_users_root_active`; gatilho `trg_users_root_guard` com `42501` salvo `gefinc.allow_root_change = 'on'`; `CREATE EXTENSION IF NOT EXISTS unaccent`; índices `ix_users_deletion_due`, `ix_users_role`, `ix_users_created`, `ix_users_last_access`; preenchimento das exclusões legadas)
- [x] T025 Criar `apps/api-server/src/main/resources/db/migration/V17__auth_sessions.sql` (`auth_sessions` com `client_ip`, `device_label`, `client_kind`, `revoked_at`, `revoked_by`; `ix_as_user_open`; preenchimento a partir de `refresh_tokens`)
- [x] T026 Criar `apps/api-server/src/main/resources/db/migration/V18__audit_log.sql` (`audit_log` com `ck_al_action` do catálogo, `ck_al_result`, índices `ix_al_*`; `audit_log_client` com FK `ON DELETE CASCADE`; `trg_al_immutable` por linha e `trg_al_no_truncate` por instrução)
- [x] T027 Criar `apps/api-server/src/main/resources/db/migration/V19__email_deliveries_and_pending_communications.sql` (`email_deliveries` com `ck_ed_failure`; `pending_communications` com `ck_pc_retained` e `ix_pc_pending`)
- [x] T028 Criar `apps/api-server/src/main/resources/db/migration/V20__invitations_and_pending_email_changes.sql` (`invitations` com `ck_inv_email`, `ux_inv_pending_email`, `ix_inv_status`; `pending_email_changes` com `ck_pec_pending`, `ux_pec_user_pending`)
- [x] T029 [P] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/common/security/Pseudonymizer.java` (HMAC-SHA256 com `javax.crypto`, rótulo anônimo) e as propriedades `app.pseudonym-secret`, `app.trusted-proxy-cidrs` e `app.admin.*` (página 25/máx. 100, busca ≤ 100, cache de estatísticas 60 s) em `apps/api-server/src/main/java/com/jvtech/gefinc/common/config/AppProperties.java` e `apps/api-server/src/main/resources/application.yml`; falha ao iniciar sem segredo ≥ 32 bytes fora do perfil de teste (D11, D32)
- [x] T030 [P] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/common/security/ClientIpResolver.java` (CIDRs confiáveis; `CF-Connecting-IP` só do proxy confiável) e mudar o padrão de `FORWARD_HEADERS_STRATEGY` para `none` em `apps/api-server/src/main/resources/application.yml`; usar o resolvedor no `AuthController` e onde hoje se lê o IP (`LoginAttemptLimiter`) (D12, FR-054)
- [x] T031 [P] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/common/security/DeviceLabelResolver.java` (rótulo grosseiro, sem dependência nova)
- [x] T032 Extrair `apps/api-server/src/main/java/com/jvtech/gefinc/common/ratelimit/PerKeyRateLimiter.java` a partir de `apps/api-server/src/main/java/com/jvtech/gefinc/auth/LoginAttemptLimiter.java` e `apps/api-server/src/main/java/com/jvtech/gefinc/auth/PasswordResetRateLimiter.java`, que passam a usá-lo sem mudar o comportamento (D18)
- [x] T033 Generalizar `apps/api-server/src/main/java/com/jvtech/gefinc/common/mail/MailService.java`: `send(OutgoingMail, DeliveryMode)` → `MailOutcome` (`SYNC_ONCE` | `WITH_RETRY`), classificação de falha, gancho `MailDeliveryListener`; criar `apps/api-server/src/main/java/com/jvtech/gefinc/common/mail/OutgoingMail.java`, `MailOutcome.java`, `DeliveryMode.java`; ajustar `PasswordResetMailListener` para registrar o envio; criar os modelos pt-BR em `apps/api-server/src/main/resources/mail/` (`invitation.txt`, `deletion-notice-grace.txt`, `deletion-notice-immediate.txt`, `deletion-canceled-active.txt`, `deletion-canceled-continues.txt`, `email-change-code.txt`, `email-change-notice-old.txt`, `email-change-notice-new.txt`, `test.txt`), sem justificativa livre em nenhum deles (D1, D13)
- [x] T034 Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/email/EmailDeliveryRecorder.java` (listener de `MailService`, grava `email_deliveries`; falha própria só gera log sanitizado) e as entidades/repositórios `apps/api-server/src/main/java/com/jvtech/gefinc/admin/email/EmailDelivery.java`, `EmailDeliveryRepository.java`
- [x] T035 Implementar o pacote de auditoria em `apps/api-server/src/main/java/com/jvtech/gefinc/admin/audit/`: `AuditLog.java` (`@Immutable`), `AuditLogClient.java`, `AuditAction.java` (catálogo completo do `data-model.md`), `AuditResult.java`, `AuditKey.java`, `AuditDetails.java`, `AuditLogRepository.java`, `AuditService.java` (grava ação, `client_ref`/`dedupe_key` por HMAC, linha em `audit_log_client` só nas tentativas, deduplicação de 15 min no banco, contador Micrometer das repetições) e `apps/api-server/src/main/java/com/jvtech/gefinc/admin/common/AdminActionExecutor.java` (audit-or-rollback na mesma transação)
- [x] T036 Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/common/Reauthenticator.java` (confere a senha do administrador, conta falhas, a 5ª revoga a sessão atual, recusa `REAUTH_FAILED` auditada) e `apps/api-server/src/main/java/com/jvtech/gefinc/admin/common/AdminRateLimitInterceptor.java` (30/min mutantes, 10/15 min destrutivas por administrador, `429` + `Retry-After`) registrado em `apps/api-server/src/main/java/com/jvtech/gefinc/common/security/SecurityConfig.java` para `/admin/**` (D18)
- [x] T037 Acrescentar os 16 códigos novos (`ACCOUNT_SUSPENDED`, `ADMIN_DECISION_LOCKED`, `MAINTENANCE`, `SIGNUPS_CLOSED`, `ROOT_PROTECTED`, `LAST_ADMIN`, `SELF_ACTION_FORBIDDEN`, `REAUTH_FAILED`, `INVALID_CONFIRMATION`, `MAIL_DELIVERY_FAILED`, `INVITATION_EXPIRED`, `DELETION_ALREADY_EXECUTED`, `ACCOUNT_NOT_USABLE`, `EMAIL_CHANGE_CODE_INVALID`, `REASON_NAME_TAKEN`, `LAST_ACTIVE_REASON`) em `apps/api-server/src/main/java/com/jvtech/gefinc/common/error/ErrorCode.java` e nos mapeamentos de `ProblemFactory.java`/`GlobalExceptionHandler.java` (recusas de regra usam 403/409/422, nunca 401)
- [x] T038 Atualizar o contrato nas duas cópias (`packages/core-models/openapi/gefinc.openapi.yaml` e `specs/001-personal-finance-management/contracts/openapi.yaml`) conforme `specs/005-admin-panel/contracts/openapi-delta.md` (tag `Admin`, caminhos `/admin/**`, `/system/status`, `/auth/invitations/**`, `/auth/notices/{id}/dismiss`, alterações aditivas de `/auth/*`, `UserProfile.admin` e `notices`, códigos de erro), regenerar com `npx nx run core-models:generate` e exportar os tipos em `packages/core-models/src/lib/models.ts`; ajustar `apps/api-server/src/test/java/com/jvtech/gefinc/support/ContractAssertions.java` se necessário (Princípio I)
- [x] T039 [P] Configuração de implantação: `docker-compose.selfhost.yml` (`FORWARD_HEADERS_STRATEGY: none`, `TRUSTED_PROXY_CIDRS` com o IP fixo `/32` do `cloudflared`, `PSEUDONYM_SECRET` obrigatório), `docker-compose.yml` (valor de desenvolvimento) e `.env.example` (comentários sobre guardar o segredo com as credenciais e não rotacionar, R3)
- [x] T040 [P] Registrar as tabelas e colunas novas e as migrações V14 a V20 em `specs/001-personal-finance-management/data-model.md` (referência cruzada para `specs/005-admin-panel/data-model.md`)

**Checkpoint**: banco migrado até V20, `./mvnw verify` verde, componentes transversais prontos. As histórias podem começar.

**Notas de implementação da Fase 2** (desvios decididos e registrados):

- **A1**: o autoatendimento de exclusão passou a gravar o livro-razão (`auth/DeletionLedger`, ponte mínima por JDBC), porque `ck_users_deletion_consistent` (V16) exige as quatro colunas de exclusão de `users` juntas. O modelo completo continua sendo a T142.
- **A2**: `account_deletion_requests.target_ref` é anulável (o preenchimento do V16 não calcula HMAC; o rótulo `anônimo-…` das linhas legadas é derivado do `user_id` na leitura). Registrado em `specs/001-personal-finance-management/data-model.md` (T040).
- **A3**: o HSTS é emitido também em requisição "não segura" (`forward-headers-strategy=none` esconde o `X-Forwarded-Proto` do túnel).
- **A4**: a 5ª falha de reautenticação revoga o acesso do administrador por uma porta provisória (`TokenVersionSessionRevoker`: `token_version++` e revogação das famílias de refresh dele). T081/T082 trocam pela revogação por `sid`.
- **A5**: a cópia `specs/001-personal-finance-management/contracts/openapi.yaml` NÃO recebeu o delta (está desatualizada; a fonte única é `packages/core-models`). Só ganhou um comentário de cabeçalho apontando para a fonte (T038).
- **A6**: o `AdminRateLimitInterceptor` é registrado por `WebMvcConfigurer` (`AdminWebConfig`), não em `SecurityConfig` como diz a T036: um `HandlerInterceptor` roda depois da cadeia de segurança e só enxerga requisições já autorizadas.
- **A7**: o gatilho do raiz dispara no `UPDATE` somente quando o papel muda (o Hibernate grava todas as colunas mapeadas).
- **A8**: `AuditService` grava `occurred_at` com o `Clock` injetado e usa a mesma fonte na janela de 15 minutos.
- Nomes de propriedades: `app.pseudonym-secret`, `app.security.trusted-proxies` e `app.security.client-ip-header` (substituem `app.trusted-proxy-cidrs` da T029); `app.admin.*` como no plano.
- T039: `docker-compose.yml` não mudou (só tem `postgres` e `mailpit`, sem a API); o valor de desenvolvimento do `PSEUDONYM_SECRET` vive em `.env.example`. `application-local.yml` é ignorado pelo git, então não serve de lugar versionado.
- A tabela `audit_log_client` e o histórico de envios nascem vazios; nenhum job novo foi criado na Fase 2.

---

## Phase 3: User Story 1 - Acesso restrito ao administrador (Priority: P1, fatia F2) MVP

**Goal**: Papel verificado no servidor a cada requisição, `/admin/**` fechado por padrão, concessão/retirada de perfil, administrador raiz protegido, painel vazio com menu "Administração" só para administradores.

**Independent Test**: Com um usuário comum e um administrador, só o segundo vê a área e usa as funções; o primeiro recebe "acesso negado" pela tela e por chamada direta; o raiz criado pelo roteiro de banco não pode ser alterado pelo painel (US1.1 a US1.9).

### Tests for User Story 1 (escritos antes)

- [ ] T041 [P] [US1] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/AdminAccessIT.java`: enumera **todas** as rotas `/admin/**` registradas (`RequestMappingHandlerMapping`) e falha se alguma não estiver fechada para administradores; anônimo → `401`, usuário comum → `403` (`problem+json` genérico, sem revelar nada), administrador passa; a negativa gera **1** auditoria por janela de 15 min com IP (usuário e visitante) e incrementa o contador no `MeterRegistry` (US1.2, US1.3, SC-001, SC-008)
- [ ] T042 [P] [US1] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/RoleChangeTakesEffectIT.java`: conceder o perfil abre o acesso na requisição seguinte; retirar fecha na requisição seguinte, com o mesmo token de acesso (papel não vai no JWT); perfil retirado de quem está logado vale de imediato (US1.5, SC-020)
- [ ] T043 [P] [US1] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/RootGuardTriggerIT.java`: o roteiro com `SET LOCAL gefinc.allow_root_change = 'on'` cria/altera/apaga o raiz; sem o `SET LOCAL` qualquer `INSERT`, `UPDATE OF role` ou `DELETE` envolvendo `ROOT` falha com `42501`; `ck_users_root_active` impede raiz suspenso ou em exclusão; recuperação (US1.4, US1.9, SC-008)
- [ ] T044 [P] [US1] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/user/AdminPolicyTest.java` (unitário): raiz intocável, administrador não age contra si mesmo (retirar perfil), nunca sem administrador **ativo** (papel `ADMIN`/`ROOT`, não suspenso, sem exclusão pendente), alvo precisa estar ativo para receber o perfil
- [ ] T045 [P] [US1] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/user/AdminRoleIT.java`: `PUT /admin/users/{id}/role` concede/retira com senha (`REAUTH_FAILED` sem ela), recusa si mesmo (`SELF_ACTION_FORBIDDEN`), raiz (`ROOT_PROTECTED`), último administrador (`LAST_ADMIN`), alvo suspenso ou em exclusão; cada tentativa, inclusive as recusadas, é auditada (`ROLE_GRANTED`/`ROLE_REVOKED`)
- [ ] T046 [P] [US1] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/user/LastAdminConcurrencyIT.java`: duas transações simultâneas, cada uma retirando o perfil do outro de dois administradores (mais o raiz ausente), resultam em **no máximo uma** válida (trava consultiva `gefinc.admin-set`); sem deadlock (R14)
- [ ] T047 [P] [US1] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/RootProtectionIT.java` (primeira parte): rebaixar o raiz é recusado e auditado com `refusalCode=ROOT_PROTECTED`; nada muda; deixar os demais cenários (suspender, excluir, trocar e-mail, forçar redefinição, encerrar sessões) como métodos desabilitados a serem ligados em US3, US4, US9 e US10
- [ ] T048 [P] [US1] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/AdminModuleBoundaryTest.java`: lê as fontes de `apps/api-server/src/main/java/com/jvtech/gefinc/admin/**` e falha se algum arquivo, exceto `admin/system/UsageStatsRepository.java`, importar pacotes `account`, `category`, `transaction`, `invoice`, `transfer` ou `dashboard` (SC-004)
- [ ] T049 [P] [US1] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/auth/AuthQueryCountIT.java`: uma requisição autenticada executa **uma** projeção de `users` com junção em `auth_sessions` por PK (sem escrita por requisição); `TransactionListQueryCountIT` segue verde (R4)
- [ ] T050 [P] [US1] [Teste] Estender `apps/api-server/src/test/java/com/jvtech/gefinc/auth/ProfileIT.java`: `GET /auth/me` devolve `admin: true|false` conforme o papel (conveniência de UI; a barreira é do servidor)
- [ ] T051 [P] [US1] [Teste] Escrever `apps/web-app/src/app/admin/admin.guard.spec.ts` (guard direciona usuário comum/visitante, nunca revela a área), `packages/ui-shared/src/lib/api/session.service.spec.ts` (`isAdmin()` a partir de `/auth/me`) e estender `apps/web-app/src/app/layout/shell.spec.ts` (grupo "Administração" só para administradores, ícone + nome, ausente para usuário comum; o app móvel nunca mostra o grupo)
- [ ] T052 [P] [US1] [Teste] Escrever `apps/web-app/src/app/admin/admin-layout.spec.ts` (casca do painel: título, navegação por teclado, região `role=alert` reservada para o alerta permanente, `role=status` para estados) e `apps/web-app/src/app/admin/admin.api.spec.ts` (cliente HTTP: erros `problem+json` mapeados, sem `401` falso)
- [ ] T053 [P] [US1] [Teste] Escrever `apps/web-app-e2e/src/admin-access.spec.ts` (E2E web): usuário comum não vê o menu e é barrado em `/admin`; visitante vai ao login e continua sem acesso; administrador promovido via `promoteToRoot` (novo helper em `apps/web-app-e2e/src/support.ts`) vê o painel na requisição seguinte; concessão e retirada de perfil

### Implementation for User Story 1

- [ ] T054 [US1] Atualizar `apps/api-server/src/main/java/com/jvtech/gefinc/user/User.java` (colunas `role`, `suspendedAt`, `lastAccessAt`, `deletionDueAt`, `deletionOrigin`, `deletionRequestId`; enum `apps/api-server/src/main/java/com/jvtech/gefinc/user/UserRole.java`) e `apps/api-server/src/main/java/com/jvtech/gefinc/user/UserRepository.java` (projeção `UserAuthState` com papel e situação em uma consulta; `findForUpdate`); manter `ddl-auto=validate`
- [ ] T055 [US1] Atualizar `apps/api-server/src/main/java/com/jvtech/gefinc/common/security/JwtAuthenticationFilter.java`, `TokenState.java`, `TokenVersionLookup.java`/`apps/api-server/src/main/java/com/jvtech/gefinc/user/UserTokenVersionLookup.java` e `AuthenticatedUser.java` para ler o **papel do banco a cada requisição** e montar as autoridades `ROLE_ADMIN`/`ROLE_ROOT` (o JWT não carrega papel)
- [ ] T056 [US1] Fechar `/admin/**` por padrão em `apps/api-server/src/main/java/com/jvtech/gefinc/common/security/SecurityConfig.java` (`@EnableMethodSecurity`, regra de URL) e criar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/common/AdminOnly.java` (`@PreAuthorize`); `apps/api-server/src/main/java/com/jvtech/gefinc/common/security/ProblemSecurityHandlers.java` responde `401`/`403` genéricos e aciona `apps/api-server/src/main/java/com/jvtech/gefinc/admin/common/AdminAccessAuditor.java` (negativas com deduplicação, contador `admin.access.denied`)
- [ ] T057 [US1] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/common/AdminPolicy.java` (raiz, si mesmo, último administrador ativo, trava consultiva `gefinc.admin-set` apenas nas ações que mudam o conjunto) e `apps/api-server/src/main/java/com/jvtech/gefinc/admin/user/AdminRoleService.java` + `PUT /admin/users/{id}/role` em `apps/api-server/src/main/java/com/jvtech/gefinc/admin/user/AdminUserController.java` (reautenticação, `AdminActionExecutor`, auditoria `ROLE_GRANTED`/`ROLE_REVOKED`)
- [ ] T058 [US1] Expor `admin` em `UserProfile` (`apps/api-server/src/main/java/com/jvtech/gefinc/auth/AuthDtos.java`, `ProfileService.java`) e ajustar o contrato/tipos do `core-models`
- [ ] T059 [P] [US1] Criar `tools/ops/promote-root.sh` (conveniência do roteiro: `BEGIN; SET LOCAL gefinc.allow_root_change = 'on'; UPDATE users SET role='ROOT' ...; COMMIT;` com conferência do e-mail e confirmação) e documentar o roteiro de criação e de recuperação do raiz em `specs/005-admin-panel/quickstart.md` (D3)
- [ ] T060 [US1] Implementar no web: `packages/ui-shared/src/lib/api/session.service.ts` (`isAdmin()`), `packages/ui-shared/src/lib/icons/icon-set.ts` (ícones `shield`, `users`, `audit`, `mail`, `ticket`, `sliders`), `apps/web-app/src/app/admin/admin-nav.ts` (`ADMIN_NAV_ITEMS`, fora do `NAV_ITEMS` compartilhado), grupo "Administração" em `apps/web-app/src/app/layout/shell.ts`, `apps/web-app/src/app/admin/admin.routes.ts` (carregamento sob demanda), `apps/web-app/src/app/admin/admin.guard.ts`, `apps/web-app/src/app/admin/admin-layout.ts` (alerta permanente reservado), `apps/web-app/src/app/admin/admin.api.ts` e rota registrada em `apps/web-app/src/app/app.routes.ts`
- [ ] T061 [US1] Habilitar os cenários do `RootProtectionIT` que já têm endpoint e conferir `AdminAccessIT`, `RoleChangeTakesEffectIT`, `AdminRoleIT`, `LastAdminConcurrencyIT` e os Jest/E2E de US1 passando

**Checkpoint**: US1 funcional e testável sozinha; o painel existe, vazio, e protegido.

---

## Phase 4: User Story 2 - Encontrar e consultar usuários (Priority: P1)

**Goal**: Lista paginada com busca sem acento, filtros e ordenação; detalhe sem nenhum dado financeiro; abrir o detalhe é auditado.

**Independent Test**: Cadastrar usuários de teste, buscar por parte do nome/e-mail sem acento, filtrar por situação, abrir o detalhe e conferir que não há dado financeiro (US2.1 a US2.8, SC-004).

### Tests for User Story 2 (escritos antes)

- [ ] T062 [P] [US2] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/user/UserListSearchIT.java`: paginação (25, máx. 100), `q` sem caixa/acento (`joao` encontra `João`), curingas `%`, `_` e `\` tratados como texto literal, `q` > 100 caracteres → `422`, filtros `ACTIVE`/`SUSPENDED`/`DELETION_PENDING`/`ADMIN`, ordenação por `createdAt` e `lastAccessAt`, `counts` por situação, e com 10.000 usuários semeados a busca responde em < 300 ms (SC-002)
- [ ] T063 [P] [US2] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/user/UserDetailAuditIT.java`: abrir `GET /admin/users/{id}` grava `USER_DETAIL_OPENED` (recarregar conta como nova abertura); lista e busca **não** auditam; `404` para id inexistente; o detalhe traz sessões abertas, bloqueio de login, exclusão e últimas 20 ações, e nunca contas, lançamentos ou saldos (FR-060)
- [ ] T064 [P] [US2] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/AdminIsolationIT.java` (SC-004, base): semear contas, cartões, categorias, lançamentos e transferências dos usuários A e B; percorrer **todos** os GET de `/admin/**` como administrador e provar que nenhum valor, nome de conta/categoria ou descrição aparece em nenhuma resposta; o teste enumera as rotas GET (falha se uma nova não for coberta) e será re-executado a cada história; conferir que o administrador comum continua com `404` nos recursos financeiros de terceiros
- [ ] T065 [P] [US2] [Teste] Escrever `apps/web-app/src/app/admin/users/user-list.spec.ts` (busca com debounce, filtros, ordenação, paginação, estados de carregamento/vazio/erro via `state-views`, foco gerenciado) e `apps/web-app/src/app/admin/users/user-detail.spec.ts` (campos exibidos, nada financeiro, ações aparecem conforme o estado)
- [ ] T066 [P] [US2] [Teste] Escrever `apps/web-app-e2e/src/admin-users.spec.ts` (E2E web): buscar, filtrar, ordenar, abrir o detalhe e conferir a ausência de dados financeiros

### Implementation for User Story 2

- [ ] T067 [US2] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/user/AdminUserRepository.java` (consulta nativa com `unaccent(lower(...))`, `ESCAPE`, ordenação estável por `(campo, id)`, contagens), `AdminUserService.java`, `AdminUserController.java` (`GET /admin/users`, `GET /admin/users/{id}`), DTOs (`AdminUserRow`, `AdminUserPage`, `AdminUserDetail`) em `apps/api-server/src/main/java/com/jvtech/gefinc/admin/user/UserPolicyDtos.java`; `last_access_at` atualizado no login e na renovação (sem escrita por requisição)
- [ ] T068 [US2] Implementar no web: `apps/web-app/src/app/admin/users/user-list.ts`, `apps/web-app/src/app/admin/users/user-detail.ts` e o contrato tipado em `apps/web-app/src/app/admin/admin.api.ts`, com textos pt-BR e datas em America/Sao_Paulo
- [ ] T069 [US2] Executar `AdminIsolationIT`, `UserListSearchIT`, `UserDetailAuditIT` e os Jest/E2E de US2 até passarem

**Checkpoint**: US1 e US2 funcionam; localizar um usuário em menos de 30 s com 10.000 usuários.

---

## Phase 5: User Story 3 - Suspender, reativar, desbloquear e encerrar sessões (Priority: P1)

**Goal**: Suspensão independente da exclusão, sessões com IP e dispositivo (claim `sid`), encerrar uma/todas valendo na requisição seguinte, desbloqueio de login, aviso de privacidade e proibição de reverter decisões administrativas.

**Independent Test**: Suspender um usuário e conferir que a sessão antiga e o login são recusados; reativar; encerrar uma sessão e conferir que o token de acesso deixa de valer na requisição seguinte; desbloquear o login (US3.*, SC-003, SC-017).

### Tests for User Story 3 (escritos antes)

- [ ] T070 [P] [US3] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/user/UserSuspensionIT.java`: suspender exige motivo (1 a 500); a sessão antiga é recusada na requisição seguinte; o login responde `403 ACCOUNT_SUSPENDED` só depois de credenciais corretas (sem enumerar contas); reativar restaura o acesso; suspensão combina com exclusão pendente (reativar mantém a exclusão); redefinição de senha **não** reativa; recusas: si mesmo, raiz, último administrador (`409`/`403`)
- [ ] T071 [P] [US3] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/user/SessionManagementIT.java`: `GET /admin/users/{id}/sessions` lista início, último uso, IP e dispositivo; encerrar uma sessão e encerrar todas valem na requisição seguinte (claim `sid` + `auth_sessions.revoked_at`, `revoked_by=ADMIN`); sem aviso ao usuário; sessões anteriores à feature (sem `sid`) valem até expirar; `403 ROOT_PROTECTED` para o raiz
- [ ] T072 [P] [US3] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/user/LoginLockClearIT.java`: após o limite de tentativas, `DELETE /admin/users/{id}/login-lock` libera o login imediatamente e é auditado (`LOGIN_LOCK_CLEARED`); sem bloqueio vigente é idempotente
- [ ] T073 [P] [US3] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/RevertAttemptIT.java`: usuário suspenso ou com exclusão de origem `ADMIN` tenta reverter por todos os canais (login, `POST /auth/refresh`, `POST /auth/account-deletion/cancel`, redefinição de senha, sessão antiga) e todas são recusadas, com **um** registro `REVERT_ATTEMPT` por janela de 15 min e IP em `audit_log_client` (US3.*, FR-050, SC-017)
- [ ] T074 [P] [US3] [Teste] Estender `apps/api-server/src/test/java/com/jvtech/gefinc/admin/RootProtectionIT.java` habilitando suspender, encerrar uma/todas as sessões e remover o bloqueio do raiz (recusados e auditados)
- [ ] T075 [P] [US3] [Teste] Estender `apps/api-server/src/test/java/com/jvtech/gefinc/admin/AdminRateLimitIT.java` e `apps/api-server/src/test/java/com/jvtech/gefinc/admin/common/ReauthIT.java` com `suspend`/`reactivate`/`sessions` reais (limite de 30/min e de 10/15 min contra ações destrutivas)
- [ ] T076 [P] [US3] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/auth/AuthSessionCleanupJobTest.java` (`MutableClock`): sessões expiradas ou revogadas há mais de 30 dias são removidas; sessões abertas e `refresh_tokens` válidos não são tocados
- [ ] T077 [P] [US3] [Teste] Ajustar `apps/api-server/src/test/java/com/jvtech/gefinc/auth/RefreshTokenIT.java`, `apps/api-server/src/test/java/com/jvtech/gefinc/auth/AuthRegistrationLoginIT.java` e `apps/api-server/src/test/java/com/jvtech/gefinc/common/security/JwtServiceTest.java`: claim `sid` emitida e verificada; renovação preserva o `sid` da sessão; `auth_sessions` criada no login com IP real (`ClientIpResolver`) e rótulo (`DeviceLabelResolver`); `last_used_at` só muda na renovação
- [ ] T078 [P] [US3] [Teste] Escrever `packages/ui-shared/src/lib/auth/privacy/privacy-notice.spec.ts`: `/privacidade` informa que IP e tipo de dispositivo/navegador das sessões são guardados, para quê, por quanto tempo (90 dias para visitantes) e como são apagados; link no rodapé do Login e em Minha conta; texto mínimo sujeito a revisão do dono do produto (FR-061, R7)
- [ ] T079 [P] [US3] [Teste] Escrever `apps/web-app/src/app/admin/users/session-list.spec.ts` e `apps/web-app/src/app/admin/users/action-dialog.spec.ts` (diálogo mostra o efeito da ação em texto antes de confirmar, exige motivo quando aplicável, foco no diálogo, Esc fecha, botão destrutivo com texto e ícone)
- [ ] T080 [P] [US3] [Teste] Escrever `apps/web-app-e2e/src/admin-sessions.spec.ts` (E2E web): suspender e reativar, encerrar uma e todas as sessões, desbloquear login; conferir que o usuário afetado é desconectado na próxima ação

### Implementation for User Story 3

- [ ] T081 [US3] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AuthSession.java` e `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AuthSessionRepository.java`; atualizar `apps/api-server/src/main/java/com/jvtech/gefinc/auth/TokenService.java` e `apps/api-server/src/main/java/com/jvtech/gefinc/common/security/JwtService.java` (claim `sid`, sessão criada no login com IP e dispositivo, `last_used_at` na renovação) e `apps/api-server/src/main/java/com/jvtech/gefinc/auth/RefreshToken.java`
- [ ] T082 [US3] Atualizar `apps/api-server/src/main/java/com/jvtech/gefinc/common/security/JwtAuthenticationFilter.java` e a projeção de `apps/api-server/src/main/java/com/jvtech/gefinc/user/UserRepository.java` para recusar na requisição seguinte: conta suspensa, sessão (`sid`) revogada ou expirada, `token_version` diferente; manter uma única projeção por PK
- [ ] T083 [US3] Atualizar `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AuthService.java` (`403 ACCOUNT_SUSPENDED` só após credenciais corretas, `extras.supportHint`; `last_access_at`), `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AccountDeletionService.java` (`403 ADMIN_DECISION_LOCKED` com `REVERT_ATTEMPT` deduplicado) e `apps/api-server/src/main/java/com/jvtech/gefinc/auth/PasswordResetService.java` (conta suspensa não reativa)
- [ ] T084 [US3] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/user/SessionAdmin.java` (listar, encerrar uma, encerrar todas) e os endpoints `GET/DELETE /admin/users/{id}/sessions[/{sessionId}]`, `POST /admin/users/{id}/suspend`, `POST /admin/users/{id}/reactivate`, `DELETE /admin/users/{id}/login-lock` em `apps/api-server/src/main/java/com/jvtech/gefinc/admin/user/AdminUserController.java` com `AdminActionExecutor`, `AdminPolicy`, limite de taxa e auditoria (`USER_SUSPENDED`, `USER_REACTIVATED`, `SESSION_REVOKED`, `SESSIONS_REVOKED_ALL`, `LOGIN_LOCK_CLEARED`); expor `clearLock` em `apps/api-server/src/main/java/com/jvtech/gefinc/auth/LoginAttemptLimiter.java`
- [ ] T085 [US3] Criar `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AuthSessionCleanupJob.java` (diário; sessões encerradas há mais de 30 dias) e registrar na lista de jobs
- [ ] T086 [P] [US3] Implementar `packages/ui-shared/src/lib/auth/privacy/privacy-notice.ts` (`PrivacyNoticePage` em `/privacidade`), exportar em `packages/ui-shared/src/lib/auth/index.ts` e rotear em `apps/web-app/src/app/app.routes.ts` e `apps/mobile-app/src/app/app.routes.ts`, com link em `packages/ui-shared/src/lib/auth/login/login.ts`
- [ ] T087 [US3] Implementar no web: `apps/web-app/src/app/admin/users/session-list.ts`, `apps/web-app/src/app/admin/users/action-dialog.ts` (reutilizável por todas as ações, com texto do efeito) e as ações de suspender, reativar, encerrar sessões e desbloquear no `apps/web-app/src/app/admin/users/user-detail.ts`; habilitar `UserSuspensionIT`, `SessionManagementIT`, `LoginLockClearIT`, `RevertAttemptIT`, `RootProtectionIT` e Jest/E2E de US3

**Checkpoint**: US1 + US2 + US3 completas (núcleo de gestão de contas); candidato ao MVP.

---

## Phase 6: User Story 4 - Forçar redefinição de senha e reenviar e-mail (Priority: P2, fatia F4)

**Goal**: Reenviar o e-mail de redefinição ou forçar a redefinição (invalida senha e sessões), sem que o administrador veja senha, link ou token.

**Independent Test**: Forçar a redefinição de um usuário de teste e conferir que a senha antiga e as sessões deixam de valer e que o e-mail chega (GreenMail); falha de SMTP desfaz tudo (US4.*, SC-006).

### Tests for User Story 4 (escritos antes)

- [ ] T088 [P] [US4] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/user/AdminPasswordResetIT.java` (GreenMail): reenviar gera link novo e invalida os anteriores; forçar invalida a senha e as sessões e envia o link; nunca expõe senha, link ou token em resposta, auditoria, histórico ou log; falha de SMTP → `502 MAIL_DELIVERY_FAILED` e **nada** muda; limite de 3 por hora por usuário-alvo (`429`); conta suspensa ou em exclusão → `409 ACCOUNT_NOT_USABLE`; raiz: reenviar permitido, forçar `403 ROOT_PROTECTED`; forçar exige reautenticação
- [ ] T089 [P] [US4] [Teste] Ajustar `apps/api-server/src/test/java/com/jvtech/gefinc/auth/PasswordResetIT.java` e `apps/api-server/src/test/java/com/jvtech/gefinc/auth/PasswordResetMailDeliveryIT.java`: o fluxo do usuário comum não regride e o envio passa a ser registrado em `email_deliveries`
- [ ] T090 [P] [US4] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/email/ResendFromDeliveryIT.java`: `POST /admin/email/deliveries/{id}/resend` só para `PASSWORD_RESET` com falha e conta ainda existente, gera link novo, `409 ACCOUNT_NOT_USABLE` caso contrário, `429` no limite
- [ ] T091 [P] [US4] [Teste] Estender `apps/api-server/src/test/java/com/jvtech/gefinc/admin/RootProtectionIT.java` habilitando forçar redefinição do raiz (recusada e auditada) e reenviar (permitido)
- [ ] T092 [P] [US4] [Teste] Escrever `apps/web-app/src/app/admin/users/password-reset-dialog.spec.ts` (duas ações, texto do efeito, reautenticação por senha na ação forçada, mensagem de falha de e-mail) e `apps/web-app-e2e/src/admin-password-reset.spec.ts`

### Implementation for User Story 4

- [ ] T093 [US4] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/user/AdminPasswordResetService.java` (reenviar, forçar, ambos com `MailService` em `SYNC_ONCE` e desfazer tudo se o envio falhar), limite de 3/h por alvo via `PerKeyRateLimiter`, auditoria (`PASSWORD_RESET_SENT`, `PASSWORD_RESET_FORCED`) e os endpoints `POST /admin/users/{id}/password-reset/send` e `/force`; invalidar senha e sessões de forma atômica em `apps/api-server/src/main/java/com/jvtech/gefinc/auth/PasswordResetService.java`
- [ ] T094 [US4] Implementar `POST /admin/email/deliveries/{id}/resend` em `apps/api-server/src/main/java/com/jvtech/gefinc/admin/email/EmailAdminController.java` reaproveitando o serviço acima
- [ ] T095 [US4] Implementar no web `apps/web-app/src/app/admin/users/password-reset-dialog.ts` e as ações no `apps/web-app/src/app/admin/users/user-detail.ts`; habilitar `AdminPasswordResetIT`, `ResendFromDeliveryIT`, `RootProtectionIT` e Jest/E2E de US4

**Checkpoint**: US4 funcional; redefinição administrativa sem exposição de segredos.

---

## Phase 7: User Story 5 - Consultar o registro de auditoria (Priority: P2, fatia F3)

**Goal**: Tela de consulta da auditoria imutável com filtros e paginação por cursor; retenção e anonimização sem editar a auditoria.

**Independent Test**: Executar ações administrativas e conferir que aparecem na tela com autor, alvo, momento e resultado; que não existe edição nem exclusão; que a exclusão do usuário anonimiza sem alterar a linha (US5.*, SC-005, SC-011, SC-021).

### Tests for User Story 5 (escritos antes)

- [ ] T096 [P] [US5] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/audit/AuditQueryIT.java`: filtros por período, autor, alvo, ação e resultado; paginação por cursor opaco `(occurred_at, id)` do mais recente ao mais antigo, `limit` padrão 50 e máx. 100, estável com inserções concorrentes e em tempo constante com 100.000 linhas; `GET /admin/audit/{id}` traz motivo e resumo `details`; nome/e-mail resolvidos por junção na leitura
- [ ] T097 [P] [US5] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/audit/AuditApiSurfaceIT.java`: não existe `POST/PUT/PATCH/DELETE` em `/admin/audit/**` (todos `405`/`404`), nem rota de exportação; enumera as rotas registradas (SC-005, FR-018)
- [ ] T098 [P] [US5] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/audit/AuditRetentionIT.java` (`MutableClock`): excluir um usuário apaga em cascata o IP e o dispositivo (`audit_log_client`) e a leitura passa a mostrar `anônimo-<8 hex>` com `client_ref` correlacionável, linha da auditoria mantida e justificativa preservada; `AuditClientPurgeJob` apaga os dados de visitantes com mais de 90 dias e preserva os mais novos (SC-011, SC-021)
- [ ] T099 [P] [US5] [Teste] Escrever `apps/web-app/src/app/admin/audit/audit-list.spec.ts` (filtros, carregar mais com cursor, detalhe expansível, rótulo `anônimo-…`, sem controles de edição/exclusão/exportação, estados de carregamento/vazio/erro) e `apps/web-app-e2e/src/admin-audit.spec.ts`

### Implementation for User Story 5

- [ ] T100 [US5] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/audit/AuditQueryService.java` (cursor Base64 opaco, resolução de `Party` por junção e `summary` em pt-BR por ação), `apps/api-server/src/main/java/com/jvtech/gefinc/admin/audit/AuditController.java` (somente `GET /admin/audit` e `GET /admin/audit/{id}`) e DTOs `AuditEntry`/`Party`/`AuditPage`
- [ ] T101 [US5] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/audit/AuditClientPurgeJob.java` (diário; `user_id IS NULL AND created_at < now() - interval '90 days'`)
- [ ] T102 [US5] Implementar no web `apps/web-app/src/app/admin/audit/audit-list.ts` e `apps/web-app/src/app/admin/audit/audit-detail.ts`; habilitar `AuditQueryIT`, `AuditApiSurfaceIT`, `AuditRetentionIT`, estender `AdminIsolationIT` e Jest/E2E de US5

**Checkpoint**: auditoria consultável; ações das fases anteriores aparecem na tela.

---

## Phase 8: User Story 6 - Saúde e uso do sistema (Priority: P2, fatia F5)

**Goal**: Visão geral com saúde (app/banco), versão, tempo no ar e estatísticas agregadas só com contagens.

**Independent Test**: Abrir a visão geral em menos de 3 s, ver app e banco `UP`, e conferir que as estatísticas são só contagens; derrubar o `DataSource` e ver o banco `DOWN` (US6.*, SC-007).

### Tests for User Story 6 (escritos antes)

- [ ] T103 [P] [US6] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/system/SystemHealthIT.java`: banco simulado fora (proxy do `DataSource` que lança) → `DOWN` **sem** mensagem, host ou credencial; versão via `BuildProperties` com *fallback* `desconhecida`; tempo no ar; `/actuator/health` público permanece como está e nenhum outro endpoint do actuator é exposto (D21)
- [ ] T104 [P] [US6] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/system/UsageStatsIT.java`: usuários por situação, ativos em 7 e 30 dias, novos usuários e lançamentos criados por dia (7/30/90); resposta contém **apenas contagens** (nenhum valor, linha ou identificação); cache de 60 s e `refresh=true` o ignora; consulta em `transaction_groups.created_at` dentro de 3 s (SC-007; medir e, se estourar, abrir migração com `ix_groups_created_at`, R5)
- [ ] T105 [P] [US6] [Teste] Escrever `apps/web-app/src/app/admin/overview/overview.spec.ts` (cartões de saúde com ícone e texto, não só cor; gráficos acessíveis com tabela alternativa; botão de atualizar; estados de erro) e `apps/web-app-e2e/src/admin-health.spec.ts`

### Implementation for User Story 6

- [ ] T106 [US6] Acrescentar o objetivo `build-info` ao `spring-boot-maven-plugin` em `apps/api-server/pom.xml`
- [ ] T107 [US6] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/system/SystemHealthService.java`, `apps/api-server/src/main/java/com/jvtech/gefinc/admin/system/UsageStatsRepository.java` (**única** classe com tabela financeira, apenas `COUNT` por dia), `apps/api-server/src/main/java/com/jvtech/gefinc/admin/system/StatsController.java` (`GET /admin/system/health`, `GET /admin/system/stats`) e DTOs `SystemHealth`/`UsageStats`/`DayCount`
- [ ] T108 [US6] Implementar no web `apps/web-app/src/app/admin/overview/overview.ts` (reaproveita `packages/ui-shared/src/lib/charts` e `state-views`), item inicial do menu do painel; habilitar `SystemHealthIT`, `UsageStatsIT`, `AdminModuleBoundaryTest` (a exceção continua única) e estender `AdminIsolationIT`

**Checkpoint**: visão geral entregue.

---

## Phase 9: User Story 7 - Configuração e diagnóstico do envio de e-mails (Priority: P2, fatia F4)

**Goal**: Configuração de e-mail sem segredos, e-mail de teste, histórico de envios (90 dias) com filtros e reenvio.

**Independent Test**: Ver a configuração sem senha, enviar um teste ao próprio e-mail e ver o histórico com sucesso e falha (US7.*).

### Tests for User Story 7 (escritos antes)

- [ ] T109 [P] [US7] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/email/EmailConfigIT.java`: `GET /admin/email/config` devolve `host`, `port`, `from`, `complete`, `authEnabled`, `starttls` e **nunca** usuário nem senha; `POST /admin/email/test` envia ao e-mail do próprio administrador (`SYNC_ONCE`) e devolve `SENT` ou `FAILED` com causa; auditado (`EMAIL_TEST_SENT`)
- [ ] T110 [P] [US7] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/email/EmailDeliveryIT.java`: listagem por cursor com filtros de `status` e `kind`, janela de 90 dias, destinatário em claro durante a retenção e `anônimo-…` se a conta foi removida, nunca corpo/link/token/código; `EmailDeliveryPurgeJob` apaga com mais de 90 dias sem tocar nas pendências
- [ ] T111 [P] [US7] [Teste] Escrever `apps/web-app/src/app/admin/email/email-page.spec.ts` (configuração, teste, histórico, ação de reenviar só onde permitido) e `apps/web-app-e2e/src/admin-email.spec.ts`

### Implementation for User Story 7

- [ ] T112 [US7] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/email/EmailAdminController.java` (`GET /admin/email/config`, `POST /admin/email/test`, `GET /admin/email/deliveries`), `EmailConfigService.java` e `apps/api-server/src/main/java/com/jvtech/gefinc/admin/email/EmailDeliveryPurgeJob.java` (diário, 90 dias); DTOs `EmailConfig`/`EmailDelivery`
- [ ] T113 [US7] Implementar no web `apps/web-app/src/app/admin/email/email-page.ts`; habilitar `EmailConfigIT`, `EmailDeliveryIT`, `MailServiceTest`, estender `AdminIsolationIT` e Jest/E2E de US7

**Checkpoint**: diagnóstico de e-mail entregue.

---

## Phase 10: User Story 8 - Parâmetros globais e manutenção (Priority: P3, fatia F7)

**Goal**: Cadastros abertos/fechados, modo de manutenção que preserva a fila offline do app, parâmetros somente leitura e encerramento global de sessões.

**Independent Test**: Ativar a manutenção, conferir que usuário comum é barrado (administrador e redefinição de senha passam) e que o app mantém a fila offline; fechar cadastros e conferir `SIGNUPS_CLOSED` (US8.*, SC-019).

### Tests for User Story 8 (escritos antes)

- [ ] T114 [P] [US8] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/parameter/MaintenanceModeIT.java`: com manutenção ativa, usuário comum recebe `503 MAINTENANCE` (`Retry-After`, `extras.message`) em API, login, renovação e sincronização; administrador passa; `OPTIONS`, `/auth/password-reset/**`, `/auth/logout`, `/system/status` e `/actuator/health` continuam; jobs seguem rodando; convite recusado; reativada, tudo volta
- [ ] T115 [P] [US8] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/parameter/SignupsClosedIT.java` e `apps/api-server/src/test/java/com/jvtech/gefinc/admin/parameter/ParameterAuditIT.java`: cadastro por conta própria com cadastros fechados → `403 SIGNUPS_CLOSED`, aceite de convite continua; alterar parâmetro grava valor anterior e novo na auditoria (`PARAMETER_CHANGED`); mensagem de manutenção ≤ 280; parâmetros somente leitura vêm marcados `editable=false`; linha ausente = padrão
- [ ] T116 [P] [US8] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/parameter/GlobalSessionRevokeIT.java`: `POST /admin/sessions/revoke-all` exige senha e a palavra `ENCERRAR` (`INVALID_CONFIRMATION`), encerra todas as sessões exceto a do administrador que acionou e as dos raízes, devolve `{revoked}` e audita `SYSTEM_SESSIONS_REVOKED`
- [ ] T117 [P] [US8] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/common/security/SystemStatusIT.java` (`GET /system/status` público: `maintenance`, `message?`, `signupsOpen`, sem dado sensível) e estender `apps/api-server/src/test/java/com/jvtech/gefinc/admin/AdminAccessIT.java` com as novas rotas
- [ ] T118 [P] [US8] [Teste] Estender `packages/ui-shared/src/lib/api/auth.interceptor.spec.ts`: `503 MAINTENANCE` **não** chama `expire()` nem encerra a sessão, `403 /admin` e `429` tratados; escrever `apps/web-app/src/app/admin/settings/settings-page.spec.ts` (alternar cadastros, manutenção com mensagem, parâmetros somente leitura, confirmação por palavra)
- [ ] T119 [P] [US8] [Teste] Estender `packages/ui-shared/src/lib/auth/login/login.spec.ts` (faixa de manutenção por `GET /system/status`, mensagem do `503`) e escrever `apps/mobile-app/src/app/shell/maintenance-banner.spec.ts` (faixa visível; **fila offline preservada**, nada descartado)
- [ ] T120 [P] [US8] [Teste] Escrever `apps/web-app-e2e/src/admin-maintenance.spec.ts` e `apps/mobile-app-e2e/src/maintenance.spec.ts` (E2E mobile: manutenção ativada, lançamentos feitos offline são mantidos e reenviados depois que a manutenção termina)

### Implementation for User Story 8

- [ ] T121 [US8] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/parameter/SystemParameter.java`, `SystemParameterRepository.java`, `SystemParameterService.java` (snapshot em memória invalidado ao alterar), `ParameterController.java` (`GET /admin/parameters`, `PUT /admin/parameters/signups-open`, `PUT /admin/parameters/maintenance`), `MaintenanceGuard.java` e `apps/api-server/src/main/java/com/jvtech/gefinc/common/security/MaintenanceFilter.java` (filtro que barra usuário comum e libera a lista de exceções); `GET /system/status` em `apps/api-server/src/main/java/com/jvtech/gefinc/admin/parameter/SystemStatusController.java`
- [ ] T122 [US8] Implementar `POST /admin/sessions/revoke-all` em `apps/api-server/src/main/java/com/jvtech/gefinc/admin/user/SessionAdmin.java` (ou `apps/api-server/src/main/java/com/jvtech/gefinc/admin/parameter/GlobalSessionController.java`) e aplicar `SIGNUPS_CLOSED`/`MAINTENANCE` em `apps/api-server/src/main/java/com/jvtech/gefinc/auth/RegistrationService.java`, `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AuthService.java` e `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AccountDeletionService.java`
- [ ] T123 [US8] Implementar no front compartilhado: `packages/ui-shared/src/lib/api/auth.interceptor.ts` (`503 MAINTENANCE` sem expirar a sessão), `packages/ui-shared/src/lib/api/system.api.ts`, faixa de manutenção em `packages/ui-shared/src/lib/auth/login/login.ts`; no app `apps/mobile-app/src/app/shell/maintenance-banner.ts` (fila preservada, app antigo cai no tratamento de `>= 500`); no web `apps/web-app/src/app/admin/settings/settings-page.ts`; habilitar todos os ITs e Jest/E2E de US8

**Checkpoint**: manutenção e cadastros sob controle, sem perder a fila offline.

---

## Phase 11: User Story 9 - Convidar e editar usuários (Priority: P3, fatia F4)

**Goal**: Convites por e-mail (7 dias), edição do nome e troca de e-mail por código de 6 dígitos enviado ao novo endereço.

**Independent Test**: Convidar um e-mail, aceitar o convite, editar o nome e trocar o e-mail com o código (US9.*, SC-018).

### Tests for User Story 9 (escritos antes)

- [ ] T124 [P] [US9] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/invitation/InvitationIT.java` (GreenMail): convite vale 7 dias; reenviar gera novo link e invalida o anterior; qualquer administrador reenvia ou cancela; cadastro próprio com o mesmo e-mail consome o convite; expirado → `410 INVITATION_EXPIRED`; e-mail em claro só enquanto `PENDING`; manutenção bloqueia o aceite, cadastros fechados não; `409 EMAIL_ALREADY_REGISTERED`; falha de envio não cria o convite (`502`); `GET /auth/invitations/{token}` e `POST .../accept` públicos com política de senha
- [ ] T125 [P] [US9] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/user/EmailChangeIT.java` (GreenMail): código de 6 dígitos enviado ao **novo** endereço, nunca em resposta, auditoria, histórico ou log; expira em 15 min, uso único, 5 erros invalidam, novo pedido invalida o anterior, cancelar; unicidade verificada na solicitação **e** na confirmação; o e-mail antigo vale até confirmar; ao confirmar, sessões do usuário encerradas e dois avisos (antigo e novo); raiz `403 ROOT_PROTECTED`
- [ ] T126 [P] [US9] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/user/UserRenameIT.java` (`PATCH /admin/users/{id}`, nome ≤ 80, efeito imediato, auditado) e estender `apps/api-server/src/test/java/com/jvtech/gefinc/common/logging/LogRedactionIT.java` (nenhum código, link, token, e-mail ou IP nos logs dos fluxos novos)
- [ ] T127 [P] [US9] [Teste] Estender `apps/api-server/src/test/java/com/jvtech/gefinc/admin/RootProtectionIT.java` habilitando trocar o e-mail do raiz e `apps/api-server/src/test/java/com/jvtech/gefinc/admin/common/ReauthIT.java` com a troca de e-mail
- [ ] T128 [P] [US9] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/invitation/InvitationExpiryJobTest.java` (`MutableClock`): convites vencidos viram `EXPIRED` e zeram o e-mail em claro
- [ ] T129 [P] [US9] [Teste] Escrever `apps/web-app/src/app/admin/invitations/invitations-page.spec.ts`, `apps/web-app/src/app/admin/users/email-change-dialog.spec.ts`, `packages/ui-shared/src/lib/auth/register/invitation-accept.spec.ts` (tela pública de aceite) e `apps/web-app-e2e/src/admin-invitations.spec.ts`

### Implementation for User Story 9

- [ ] T130 [US9] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/invitation/Invitation.java`, `InvitationRepository.java`, `InvitationService.java` (token aleatório, apenas o SHA-256 no banco), `InvitationController.java` (`GET/POST /admin/invitations`, `POST .../resend`, `DELETE ...`), endpoints públicos `GET /auth/invitations/{token}` e `POST /auth/invitations/{token}/accept` (em `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AuthController.java`), `apps/api-server/src/main/java/com/jvtech/gefinc/admin/invitation/InvitationExpiryJob.java` e a integração em `apps/api-server/src/main/java/com/jvtech/gefinc/auth/RegistrationService.java` (cadastro próprio consome convite pendente)
- [ ] T131 [US9] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/user/PendingEmailChange.java`, `PendingEmailChangeRepository.java`, `EmailChangeService.java` (HMAC do código, tentativas, expiração, travas) e os endpoints `POST /admin/users/{id}/email-change`, `POST .../confirm`, `DELETE ...`; `PATCH /admin/users/{id}` (nome) em `apps/api-server/src/main/java/com/jvtech/gefinc/admin/user/AdminUserController.java`
- [ ] T132 [US9] Implementar no front: `apps/web-app/src/app/admin/invitations/invitations-page.ts`, `apps/web-app/src/app/admin/users/email-change-dialog.ts`, edição de nome no `apps/web-app/src/app/admin/users/user-detail.ts`, e a tela pública de aceite em `packages/ui-shared/src/lib/auth/register/invitation-accept.ts` com rota nos dois apps; habilitar todos os ITs e Jest/E2E de US9

**Checkpoint**: convites e edição de usuários entregues.

---

## Phase 12: User Story 10 - Excluir usuário com salvaguardas (Priority: P3, fatia F6)

**Goal**: Livro-razão de exclusões com origem, prazo imediato ou de 1 a 30 dias, antecipação, restauração exata ao cancelar, e-mail que nunca bloqueia, comunicação pendente com alerta permanente e anonimização.

**Independent Test**: Solicitar exclusão com prazo, ver o aviso por e-mail, antecipar, cancelar e conferir a restauração exata; executar exclusão imediata com SMTP fora e ver que prossegue e vira comunicação pendente (US10.*, SC-010, SC-012, SC-016).

### Tests for User Story 10 (escritos antes)

- [ ] T133 [P] [US10] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/deletion/DeletionPolicyTest.java` (matriz completa da máquina de estados: `SCHEDULED`, `CANCELED`, `SUPERSEDED`, `EXECUTED`; só antecipar; transições inválidas) e `apps/api-server/src/test/java/com/jvtech/gefinc/admin/deletion/DeletionByAdminIT.java`: com prazo, imediata, prazo fora de 1 a 30 → `422`, motivo inativo, justificativa 1 a 1000 gravada **só** em `audit_log.reason_text`, e-mail do alvo digitado (`INVALID_CONFIRMATION`), reautenticação, si mesmo/raiz/último administrador recusados, e a exclusão **sempre prossegue** com o SMTP fora (a falha vira comunicação pendente)
- [ ] T134 [P] [US10] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/deletion/DeletionRestoreIT.java`: cancelar restaura o estado **exato** (ativa; suspensa continua suspensa; antecipação volta à data original com origem `USER`); `409 DELETION_ALREADY_EXECUTED`; notificação por e-mail e aviso no app; trava por linha elimina corrida com o job
- [ ] T135 [P] [US10] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/deletion/UserCannotCancelAdminDeletionIT.java`: login, `POST /auth/account-deletion/cancel` e Minha conta não cancelam exclusão de origem `ADMIN` (`ADMIN_DECISION_LOCKED`, `REVERT_ATTEMPT` deduplicado); a exclusão do próprio usuário continua cancelável
- [ ] T136 [P] [US10] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/deletion/ErasureAnonymizationIT.java`: ao executar, nada de e-mail, nome, IP ou dispositivo permanece em `audit_log*`, `email_deliveries`, `pending_communications` (exceto o endereço retido) e `auth_sessions`; a justificativa e o `client_ref` HMAC permanecem; o dado financeiro do usuário some (cascata existente) (SC-012, SC-021)
- [ ] T137 [P] [US10] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/deletion/PendingCommunicationIT.java`: falha de aviso cria comunicação pendente; `GET /admin/alerts` conta pendências; reenviar (`DELIVERED` ou segue `PENDING`); descartar apaga o endereço retido (auditado); expira 30 dias após a remoção da conta com endereço zerado; o endereço retido nunca é devolvido pela API; `PendingCommunicationExpiryJob` (`MutableClock`)
- [ ] T138 [P] [US10] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/deletion/AccountDeletionJobTest.java` (a cada 5 minutos; executa `due_at <= now()`; rede de segurança da exclusão imediata; idempotente) e ajustar `apps/api-server/src/test/java/com/jvtech/gefinc/auth/AccountDeletionIT.java` (autoatendimento via livro-razão: `origin=USER`, 30 dias, `403 ROOT_PROTECTED`, `409 LAST_ADMIN`)
- [ ] T139 [P] [US10] [Teste] Estender `apps/api-server/src/test/java/com/jvtech/gefinc/admin/RootProtectionIT.java` habilitando excluir o raiz e `apps/api-server/src/test/java/com/jvtech/gefinc/admin/common/ReauthIT.java`/`AdminRateLimitIT.java` com a exclusão (destrutiva, 10/15 min)
- [ ] T140 [P] [US10] [Teste] Escrever `apps/web-app/src/app/admin/users/deletion-dialog.spec.ts` (motivo, justificativa com aviso de que fica na auditoria, prazo ou imediata, digitar o e-mail, senha, texto do efeito), `apps/web-app/src/app/admin/alerts/pending-alert.spec.ts` (alerta permanente com ícone e texto, `role=alert`) e `apps/web-app-e2e/src/admin-deletion.spec.ts`

### Implementation for User Story 10

- [ ] T141 [US10] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/deletion/AccountDeletionRequest.java`, `AccountDeletionRequestRepository.java`, `DeletionRequestService.java` (modo, prazo, motivo e mensagem fixados, antecipação, cancelamento com restauração, trava por linha), `AccountErasureService.java` (executa a remoção e a anonimização) e `DeletionController.java` (`POST/DELETE /admin/users/{id}/deletion`)
- [ ] T142 [US10] Migrar o autoatendimento para o livro-razão em `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AccountDeletionService.java` e `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AuthService.java` (origem `USER`, `deletion_due_at`, bloqueios `ROOT_PROTECTED`/`LAST_ADMIN`/`ADMIN_DECISION_LOCKED`); trocar o job para a cada 5 minutos em `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AccountDeletionJob.java`
- [ ] T143 [US10] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/deletion/PendingCommunication.java`, `PendingCommunicationRepository.java`, `PendingCommunicationService.java`, `PendingCommunicationExpiryJob.java`, endpoints `GET /admin/communications/pending`, `POST .../{id}/resend`, `POST .../{id}/discard` e `GET /admin/alerts`
- [ ] T144 [US10] Implementar no web `apps/web-app/src/app/admin/users/deletion-dialog.ts`, `apps/web-app/src/app/admin/alerts/pending-alert.ts` (no `admin-layout.ts`, em todas as telas) e `apps/web-app/src/app/admin/communications/pending-list.ts`; habilitar todos os ITs e Jest/E2E de US10

**Checkpoint**: exclusão administrativa completa e auditável.

---

## Phase 13: User Story 11 - Gerenciar os motivos de exclusão (Priority: P3, fatia F6)

**Goal**: Criar, editar, desativar e reativar motivos de exclusão com mensagem genérica sem dado pessoal.

**Independent Test**: Criar um motivo, editar a mensagem, desativá-lo e conferir que exclusões já solicitadas mantêm a mensagem original (US11.*).

### Tests for User Story 11 (escritos antes)

- [ ] T145 [P] [US11] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/deletion/DeletionReasonIT.java`: quatro motivos iniciais, criar/editar/desativar/reativar auditados (`REASON_*`), nunca apagar (não existe `DELETE`), `409 REASON_NAME_TAKEN` sem diferenciar caixa, `409 LAST_ACTIVE_REASON` com trava consultiva, edição não altera mensagens de exclusões já solicitadas (fixadas)
- [ ] T146 [P] [US11] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/deletion/GenericMessageValidatorTest.java`: recusa e-mail, sequências de 8 ou mais dígitos, marcadores de substituição (`{{`, `${`, `%s`, `{nome}`) e URL; aceita texto genérico em pt-BR
- [ ] T147 [P] [US11] [Teste] Escrever `apps/web-app/src/app/admin/deletion-reasons/reasons-page.spec.ts` e `apps/web-app-e2e/src/admin-deletion-reasons.spec.ts`

### Implementation for User Story 11

- [ ] T148 [US11] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/deletion/DeletionReason.java`, `DeletionReasonRepository.java` (sem `delete`), `DeletionReasonService.java`, `GenericMessageValidator.java` e `DeletionReasonController.java` (`GET/POST/PUT /admin/deletion-reasons`, `POST .../{id}/deactivate|activate`)
- [ ] T149 [US11] Implementar no web `apps/web-app/src/app/admin/deletion-reasons/reasons-page.ts`; habilitar `DeletionReasonIT`, `GenericMessageValidatorTest`, estender `AdminIsolationIT` e Jest/E2E de US11

**Checkpoint**: motivos geridos pelo painel.

---

## Phase 14: User Story 12 - Aviso de exclusão dentro do aplicativo (Priority: P3, fatia F6)

**Goal**: Quando o usuário faz **login com e-mail e senha corretos**, a tela de entrada compartilhada (web e app) exibe o aviso de exclusão administrativa com prazo e motivo genérico, sem opção de cancelar; o aviso de cancelamento aparece uma única vez. Nunca antes da autenticação (D22: evita enumerar contas).

**Independent Test**: Solicitar exclusão com prazo como administrador; entrar na web e no app com as credenciais corretas do usuário e ver o aviso com prazo e motivo genérico, sem a justificativa; cancelar como administrador e ver o aviso de cancelamento uma vez (US12.1 a US12.9, SC-014).

### Tests for User Story 12 (escritos antes)

- [ ] T150 [P] [US12] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/admin/deletion/UserNoticeIT.java`: `POST /auth/login` com exclusão pendente e credenciais corretas responde `423 ACCOUNT_DELETION_PENDING` com `deletionDate` real, `extras.origin`, `extras.canCancel` (`origin == USER`), `extras.reasonMessage` (só `ADMIN`, a mensagem **fixada**, nunca a justificativa) e `extras.supportHint`; credenciais incorretas **não** revelam exclusão nem suspensão; antecipação mostra o prazo novo; exclusão imediata não tem janela de aviso; aviso de cancelamento (`DELETION_CANCELED`, variantes `ACTIVE`, `STILL_BLOCKED`, `USER_REQUEST_CONTINUES` com data original) entregue **uma vez** via `GET /auth/me` ou pelas respostas `403/423` e marcado como entregue; `POST /auth/notices/{id}/dismiss` (`404` se não for do usuário)
- [ ] T151 [P] [US12] [Teste] Estender `apps/api-server/src/test/java/com/jvtech/gefinc/auth/AuthRegistrationLoginIT.java` e `apps/api-server/src/test/java/com/jvtech/gefinc/auth/AccountDeletionIT.java` com a regressão do `423` (campos aditivos; cliente antigo ignora os novos) e o cancelamento do próprio usuário como hoje
- [ ] T152 [P] [US12] [Teste] Estender `packages/ui-shared/src/lib/auth/login/login.spec.ts`: o aviso aparece só depois da resposta `423`/`403` a credenciais corretas, com prazo (dd/mm), motivo genérico, orientação de procurar o suporte, ícone e texto, `role=alert`; **sem** o botão "Cancelar a exclusão e entrar" quando `canCancel=false`; com `canCancel=true` mantém o botão atual; aviso de cancelamento dispensável (uma vez); nunca mostra aviso antes de enviar as credenciais
- [ ] T153 [P] [US12] [Teste] Escrever `apps/web-app-e2e/src/admin-deletion-notice.spec.ts` e `apps/mobile-app-e2e/src/deletion-notice.spec.ts` (E2E web e mobile): exclusão administrativa com prazo mostra o aviso ao entrar, sem cancelar; cancelamento pelo administrador mostra o aviso único; antecipação mostra o novo prazo; verificação de acessibilidade (axe) das telas de aviso

### Implementation for User Story 12

- [ ] T154 [US12] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/admin/deletion/UserNotice.java`, `UserNoticeRepository.java`, `UserNoticeService.java` (texto montado no servidor conforme o estado atual) e `POST /auth/notices/{id}/dismiss` em `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AuthController.java`; incluir `notices` em `GET /auth/me` e nas respostas `403/423` do login em `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AuthService.java`/`AuthDtos.java`
- [ ] T155 [US12] Atualizar `packages/ui-shared/src/lib/auth/login/login.ts` (aviso de exclusão com prazo e motivo, sem "Cancelar" quando `canCancel=false`, aviso de cancelamento dispensável), `packages/ui-shared/src/lib/api/auth.api.ts` e `packages/ui-shared/src/lib/api/notice.service.ts`; sem mudanças em `apps/mobile-app/src/app/auth/` além do que o `Login` compartilhado já cobre; habilitar `UserNoticeIT` e os Jest/E2E de US12

**Checkpoint**: todas as histórias entregues.

---

## Phase 15: Polish & Cross-Cutting Concerns

**Purpose**: Documentação operacional, consolidação dos testes transversais, acessibilidade e regressão.

- [ ] T156 [P] Atualizar `docs/operations.md`: `PSEUDONYM_SECRET` (≥ 32 bytes, guardar com as credenciais, não rotacionar, o que fazer em vazamento), `TRUSTED_PROXY_CIDRS` e `FORWARD_HEADERS_STRATEGY=none` (IP real só do túnel), **roteiro do administrador raiz** (criar, recuperar, `tools/ops/promote-root.sh`), retenções (90 dias de envios e de IP de visitantes, 30 dias do endereço retido e das sessões), os 6 jobs (exclusão a cada 5 min, retenção de envios, de IP de visitantes, expiração de comunicações pendentes, expiração de convites, limpeza de sessões), limitadores em memória (instância única, R13), manutenção e atualização da seção "Variáveis de ambiente"
- [ ] T157 [P] Atualizar `docs/deploy-self-hosted-cloudflare-tunnel.md` e `docs/deploy-oracle-a1-flex.md` (IP fixo do `cloudflared`, `TRUSTED_PROXY_CIDRS`, passo de verificação do IP real) e conferir `docker-compose.selfhost.yml` e `.env.example` contra o `quickstart.md`
- [ ] T158 [P] Escrever `apps/web-app-e2e/src/admin-accessibility.spec.ts` (`@axe-core/playwright` em **cada** tela do painel e nos avisos do Login: sem violações, foco e ordem de tabulação, diálogos com foco preso e Esc, `role=alert`/`role=status`, informação não depende só de cor) e conferir o leitor de tela manualmente no roteiro do `quickstart.md` (SC-009)
- [ ] T159 [P] Consolidar `apps/api-server/src/test/java/com/jvtech/gefinc/admin/AdminIsolationIT.java` (todas as rotas GET de todas as histórias), `apps/api-server/src/test/java/com/jvtech/gefinc/admin/RootProtectionIT.java` (os 6 cenários ligados) e `apps/api-server/src/test/java/com/jvtech/gefinc/admin/AdminAccessIT.java` (todas as rotas `/admin/**`); executar `AdminModuleBoundaryTest` e conferir que `UsageStatsRepository` segue como única exceção
- [ ] T160 [P] Ampliar `apps/api-server/src/test/java/com/jvtech/gefinc/common/logging/LogRedactionIT.java` (nenhum segredo, código, link, token, e-mail ou IP em log nos fluxos do painel, D30) e rodar `./mvnw -f apps/api-server/pom.xml spotless:apply verify`
- [ ] T161 Executar a regressão completa (D31): `AuthRegistrationLoginIT`, `AccountDeletionIT`, `RefreshTokenIT`, `PasswordResetIT`, `LoginThrottlingIT`, todos os `*IsolationIT`, `ContractAssertionsTest` e as suítes Jest/E2E existentes; comparar com a linha de base da Fase 1
- [ ] T162 [P] Conferir que o painel não vaza para o app móvel: `node tools/check-prod-bundle.mjs` (o pacote do `mobile-app` não contém `apps/web-app/src/app/admin`), `npx nx build web-app mobile-app` e `npx nx affected -t lint test`
- [ ] T163 Executar o roteiro de `specs/005-admin-panel/quickstart.md` de ponta a ponta (inclui criar o raiz pelo roteiro de banco, IP real atrás do túnel e aviso no login) e marcar os critérios SC-001 a SC-021
- [ ] T164 [P] Revisar o texto de privacidade (FR-061) com o dono do produto antes do lançamento (R7); registrar a decisão; fora do escopo de código
- [ ] T165 Abrir o PR da feature (sem `Co-Authored-By` nem menção a IA), com o resumo das migrações V14 a V20, a dependência da emenda 1.4.0 e as variáveis de ambiente novas

---

## Dependencies & Execution Order

### Phase Dependencies

- **Pré-requisitos (T001 a T005)**: sem dependências; **bloqueiam tudo**. A emenda 1.4.0 e o merge da correção de e-mail vêm antes de qualquer código
- **Foundational (T006 a T040)**: depende dos Pré-requisitos; **bloqueia todas as histórias**
- **US1 (T041 a T061)**: depende só da Foundational; as demais dependem de US1 (papel e `/admin/**`)
- **US2 (T062 a T069)** depende de US1; **US3 (T070 a T087)** depende de US1 e usa o detalhe de US2 para a interface
- **US4 (T088 a T095)** depende de US3 (diálogo de ação, sessões); **US5 (T096 a T102)** depende só de US1 (o registro já vale desde a Foundational, FR-019)
- **US6 (T103 a T108)** depende de US1; **US7 (T109 a T113)** depende de US1 e da Foundational (registro de envios); a ação "reenviar" da tela depende de US4
- **US8 (T114 a T123)** depende de US1; o tratamento no `Login` e no app não bloqueia as outras histórias
- **US9 (T124 a T132)** depende de US1 e US3; **US10 (T133 a T144)** depende de US1 e US3 (suspensão/restauração) e usa os motivos semeados na V14
- **US11 (T145 a T149)** depende de US1 (independente de US10 para o CRUD); **US12 (T150 a T155)** depende de US10 (livro-razão e cancelamento)
- **Polish (T156 a T165)**: depende de todas as histórias desejadas

### Dependências críticas

1. Merge da branch de e-mail → `git merge main` → só então mexer em `MailService` (Foundational).
2. Emenda 1.4.0 aprovada antes do primeiro código (Princípios III e V ficariam em violação formal).
3. Migrações V14 a V20 em ordem (V15 usa `deletion_reasons`, V16 usa `account_deletion_requests`, V19 usa o livro-razão); depois de mescladas são imutáveis.
4. `JwtAuthenticationFilter`/`UserRepository` são alterados em US1 (papel) e US3 (suspensão e `sid`): evitar trabalho paralelo nesses dois arquivos.
5. `AdminIsolationIT`, `RootProtectionIT`, `AdminAccessIT` e `AdminRateLimitIT` crescem a cada história: cada fase estende os testes antes de implementar.
6. `Login` compartilhado é tocado em US3 (link de privacidade), US8 (manutenção) e US12 (aviso): serializar as mudanças.

### Within Each User Story

- Testes `[Teste]` escritos e vistos falhando **antes** da implementação (Princípio IV)
- Migração/entidade → serviço → endpoint → contrato/tipos → tela → E2E
- Cada história termina com os ITs, Jest e E2E dela verdes e o `AdminIsolationIT` re-executado

### Parallel Opportunities

- Pré-requisitos: as duas últimas tarefas da fase em paralelo
- Foundational: os testes unitários (`Pseudonymizer`, `ClientIpResolver`, `DeviceLabelResolver`, `PerKeyRateLimiter`), os testes de migração e os testes de `MailService`/auditoria/reautenticação/limite são todos `[P]`; `Pseudonymizer`, `ClientIpResolver` e `DeviceLabelResolver` (implementação) em paralelo; as migrações V14 a V20 são sequenciais
- Depois de US1: **US2, US5, US6, US7 e US8** podem seguir em paralelo (arquivos diferentes: `admin/user`, `admin/audit`, `admin/system`, `admin/email`, `admin/parameter`); depois de US3, **US4, US9 e US10** em paralelo; US11 em paralelo com US10
- Dentro de cada história, todos os testes `[P]` (back, Jest e E2E) em paralelo

### Parallel Example: User Story 2

```text
Tarefas de teste em paralelo (arquivos diferentes):
- UserListSearchIT  (apps/api-server/src/test/java/com/jvtech/gefinc/admin/user/UserListSearchIT.java)
- UserDetailAuditIT (apps/api-server/src/test/java/com/jvtech/gefinc/admin/user/UserDetailAuditIT.java)
- AdminIsolationIT  (apps/api-server/src/test/java/com/jvtech/gefinc/admin/AdminIsolationIT.java)
- user-list.spec.ts / user-detail.spec.ts (apps/web-app/src/app/admin/users/)
- admin-users.spec.ts (apps/web-app-e2e/src/admin-users.spec.ts)
```

---

## Implementation Strategy

### MVP sugerido: US1 + US2 + US3 (com a auditoria já gravada)

1. Pré-requisitos (merge do e-mail, `git merge main`, emenda 1.4.0)
2. Foundational (F1): migrações, `AuditService`, `Pseudonymizer`, `ClientIpResolver`, `MailService` generalizado
3. US1 (acesso e papéis) → **PARAR e VALIDAR**: `AdminAccessIT` e o E2E de acesso
4. US2 (lista e detalhe) e US3 (suspensão e sessões) → **PARAR e VALIDAR**: o administrador já protege o sistema; a auditoria é gravada desde a Foundational (a tela de consulta chega em US5, logo depois)
5. Demonstrar e, se o PR for pequeno o bastante, mesclar esta fatia

### Entrega incremental (fatias do plano)

| Fatia | Conteúdo | Valor entregue |
|---|---|---|
| F1 | Pré-requisitos + Foundational | Base sem comportamento novo visível |
| F2 | US1 + US2 + US3 | **MVP**: painel protegido, localizar e suspender usuários |
| F3 | US5 | Consulta da auditoria (confiança e conformidade) |
| F4 | US4 + US7 + US9 | Redefinição administrativa, diagnóstico de e-mail, convites e edição |
| F5 | US6 | Visão geral de saúde e uso |
| F6 | US10 + US11 + US12 | Exclusão com salvaguardas, motivos e aviso no login |
| F7 | US8 | Manutenção e cadastros fechados |
| F8 | Polish | Documentação, acessibilidade, regressão e PR final |

(Nota: a fase 14, US12, vem depois da US10; US8 e US9 são independentes e podem ser antecipadas se o produto pedir. A numeração das fases segue as prioridades da spec; a ordem de entrega acima segue o plano.)

### Estratégia de equipe

1. Pré-requisitos e Foundational em sequência; a emenda e o merge do e-mail são do mantenedor.
2. Com US1 pronta: uma pessoa em US2 → US3; outra em US5 e US6; outra em US7 e US8.
3. Com US3 pronta: US4, US9 e US10/US11 em paralelo; US12 por último entre as histórias.
4. Cada fatia vira PR próprio (sem co-autoria) com seus ITs, Jest e E2E.

---

## Notes

- [P] = arquivos diferentes, sem dependência de tarefa incompleta
- [Story] liga a tarefa à história para rastreabilidade (US1 a US12)
- Testes de regras, endpoints, isolamento, migração, imutabilidade, retenção e concorrência são obrigatórios e vêm antes (Princípio IV)
- O administrador administra **contas, não finanças**: única exceção é a contagem agregada de `UsageStatsRepository` (emenda 1.4.0)
- Nada de segredo, código, link, token, e-mail ou IP em log; a exclusão sempre prossegue mesmo com o e-mail fora
- Commitar a cada tarefa ou grupo lógico, **sem** `Co-Authored-By` nem menção a IA
- O passo do skill que atualizaria o contexto do agente (`CLAUDE.md`, bloco SPECKIT) não foi aplicado, por instrução

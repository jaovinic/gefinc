# Implementation Plan: Painel administrativo

**Branch**: `005-admin-panel` | **Date**: 2026-11-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-admin-panel/spec.md` (62 requisitos funcionais, 21 critérios de sucesso, 12 histórias, rodadas de clarificação 4 e 5 já resolvidas)

## Summary

Seis entregas ligadas (ver [research.md](./research.md), decisões D1–D32):

1. **Acesso e perfil**: coluna `users.role` (`USER`/`ADMIN`/`ROOT`) checada **no servidor a cada requisição** (o papel não vai no JWT), regra de URL `/admin/**` + `@PreAuthorize` + teste que enumera
   todas as rotas; o administrador **raiz** nasce só por roteiro no banco, protegido por regra de serviço e por gatilho do PostgreSQL; "nunca sem administrador" garantido sob concorrência por trava consultiva.
2. **Gestão de usuários e sessões**: lista/busca/detalhe (sem nenhum dado financeiro), suspensão independente da exclusão, sessões com IP e dispositivo (`auth_sessions` + claim `sid`, encerramento valendo na requisição
   seguinte), desbloqueio de login, redefinição reenviada/forçada, convites (7 dias), nome e **troca de e-mail por código de 6 dígitos** enviado ao novo endereço.
3. **Exclusão com salvaguardas**: livro-razão `account_deletion_requests` com **origem** (usuário/administrador), prazo imediato ou 1–30 dias, antecipação e **restauração exata** ao cancelar, motivos cadastráveis com
   mensagem **fixada**, aviso por e-mail que **nunca bloqueia** a exclusão (falha vira **comunicação pendente** com alerta permanente e endereço retido por 30 dias), aviso dentro do app na tela de entrada compartilhada.
4. **Auditoria imutável e privacidade**: `audit_log` append-only (gatilhos), com o dado pessoal em tabela lateral (`audit_log_client`) apagada por cascata na exclusão do usuário e por job de 90 dias para visitantes,
   identificadores anônimos por **HMAC com segredo fora do banco**, deduplicação de 15 minutos no banco, IP real por `CF-Connecting-IP` aceito **só** do proxy confiável (túnel).
5. **Sistema e e-mail**: saúde (app/banco), estatísticas agregadas (únicas contagens sobre tabela financeira, via `UsageStatsRepository`), configuração e diagnóstico de e-mail, histórico de envios com retenção de 90 dias,
   parâmetros globais (cadastros abertos, **modo de manutenção** por filtro que preserva a fila offline do app, jobs e redefinição de senha).
6. **Painel no web**: grupo "Administração" no menu lateral (só para administradores), rotas sob demanda em `apps/web-app/src/app/admin`, alerta permanente, acessibilidade por teclado e leitor de tela, identidade Aurora FinTech.

Ordem de entrega sugerida (cada fatia testável sozinha, alinhada às prioridades da spec): **F1** fundação (migrações V14–V20, papéis, filtro, `AuditService`, `Pseudonymizer`, `ClientIpResolver`, `MailService` generalizado) → **F2** US1 + US2 + US3 → **F3** US5 (tela de auditoria) →
**F4** US4 + US7 → **F5** US6 → **F6** US10 + US11 + US12 → **F7** US8 → **F8** US9. (US5 só tem a tela depois; o registro vale desde F1, FR-019.)

## Decisões confirmadas pelo usuário do produto

Aceitas como parte do plano (sem pendência): aviso de exclusão no app exibido **no login com e-mail e senha corretos** (D22); **5 falhas de reautenticação revogam a sessão atual** (FR-035); limites por administrador de **30 ações mutantes/min** e **10 destrutivas/15 min** (FR-055); listas com **25 itens por página (máx. 100)**; busca de até **100 caracteres**; texto de privacidade **mínimo** (FR-061), sujeito a revisão do dono do produto antes do lançamento (R7).

## Dependências e pré-condições

| Dependência | Situação | Ação |
|---|---|---|
| **Infraestrutura de e-mail** (branch `fix/smtp-brevo-async-reset-mail`: commits `7af549b`, `cc16559`; SMTP autenticado/STARTTLS, envio assíncrono pós-commit, retry seletivo, `MailMetrics`, log sanitizado) | **Não mesclada; PR não aberto** | **Abrir o PR e mesclar na `main` antes de implementar**; depois `git merge main` em `005-admin-panel`. A feature **generaliza** o `MailService` dessa branch (resultado devolvido, tipos, registro em `email_deliveries`); sem ela o painel não envia e-mail em produção. |
| Cloudflare Tunnel (`cloudflared`) | em produção (selfhost) | IP real só do túnel: `FORWARD_HEADERS_STRATEGY=none` + `TRUSTED_PROXY_CIDRS` (IP fixo do `cloudflared`) em `docker-compose.selfhost.yml` e `docs/operations.md`. |
| Extensão `unaccent` do PostgreSQL | disponível em `postgres:16`/`16-alpine` | criada na `V16` (extensão *trusted*, o dono do banco pode criar). |
| Segredo `PSEUDONYM_SECRET` (≥ 32 bytes, fora do banco) | **novo** | obrigatório em produção; documentado em `operations.md`; teste usa valor fixo. |
| Emenda à constituição 1.4.0 | **proposta abaixo** | aprovar/mesclar a emenda no mesmo PR (ou antes); o plano não edita a constituição. |

## Technical Context

**Language/Version**: Java 21, Spring Boot 3.5 (backend); TypeScript 5.x, Angular 22 (zoneless, standalone, Signals), Ionic 9, Capacitor 8 (já fixados)
**Primary Dependencies**: nenhuma nova no runtime. Reusa Spring Security (`@EnableMethodSecurity`), Spring Data JPA, Flyway, Micrometer (já via actuator), jakarta-mail (SMTP da branch de e-mail), Tailwind 4, Playwright + `@axe-core/playwright`. `unaccent` é extensão do PostgreSQL, não dependência Maven. HMAC/SHA-256 pelo JDK (`javax.crypto`).
**Storage**: PostgreSQL 16 — 11 tabelas novas, 6 colunas novas em `users`, migrações `V14`–`V20`; segredo de pseudonimização fora do banco; nada novo no aparelho (o app só ganha tratamento de `503 MAINTENANCE`)
**Testing**: JUnit + Testcontainers `postgres:16` + GreenMail (ITs de regras, isolamento, migração, imutabilidade, concorrência, retenção); Jest (guards, páginas, interceptor, `Login`); Playwright (E2E web + mobile, `@axe-core/playwright`); `LogRedactionIT` ampliado
**Target Platform**: painel: web desktop (utilizável em tablet, não otimizado para celular); aviso de exclusão e manutenção: web e app (Android 7+, iOS 15+ sem build nesta máquina)
**Project Type**: monorepo Nx: API + web + mobile + pacotes compartilhados (sem projeto novo)
**Performance Goals**: localizar usuário em < 30 s com 10 000 usuários (busca ≤ 100 ms no servidor); visão geral < 3 s (estatísticas em cache de 60 s); consulta de auditoria paginada por cursor em tempo constante; custo por requisição autenticada: **uma** projeção `users` + `auth_sessions` por PK (hoje uma)
**Constraints**: o administrador nunca lê dado financeiro de terceiros; auditoria sem `UPDATE/DELETE/TRUNCATE`; nenhum segredo, código, link, token, e-mail ou IP em log; a exclusão sempre prossegue; sem 2FA e sem exportação nesta versão; instância única da API (limitadores e snapshot de parâmetros em memória, como hoje)
**Scale/Scope**: ~45 operações novas em `/admin/**` + 4 públicas; 7 migrações; ~9 pacotes novos no backend (`admin/*`); 8 áreas de tela e ~25 componentes no web; ajustes em `Login` (compartilhado), `auth.interceptor` e `SessionService`; 6 jobs agendados

## Constitution Check

*GATE: avaliado antes da pesquisa (Fase 0) e reavaliado após o desenho (Fase 1). Resultado final: **aprovado condicionado à emenda 1.4.0** (Complexity Tracking); nenhuma violação sem justificativa.*

### Antes da pesquisa (Fase 0)

- [x] **I. Monorepo**: backend em novo pacote `com.jvtech.gefinc.admin` (mesma aplicação, sem projeto novo); DTOs/enums do contrato em `core-models`; telas do painel só no web (`apps/web-app/src/app/admin`), pois o mobile não as usa; o aviso de exclusão mora no `Login` de `ui-shared`.
- [x] **II. Financial integrity**: nenhum cálculo financeiro muda; o painel nunca soma valores (apenas contagens).
- [~] **III. Data isolation & auth**: o painel cria um **papel** e consultas agregadas globais; o texto atual ("toda consulta ... de `transactions` ... filtrada pelo `user_id` do token") **não prevê** contagens do sistema inteiro nem o perfil administrador → **precisa de emenda**; o requisito de isolamento em si (administrador não lê dado de terceiros) é reforçado por teste (SC-004).
- [x] **IV. Test-first**: ITs/Jest/Playwright escritos antes (tarefas `[Teste]` em `/speckit-tasks`); isolamento do administrador, concorrência do último administrador, migração, imutabilidade e retenção cobertos.
- [~] **V. Schema**: 11 tabelas novas e colunas em `users` fora da lista do princípio → **precisa de emenda** (a spec já a antecipa); FKs/`CHECK`/índices declarados no banco; tabelas de histórico sem FK de propósito (exceção a registrar).
- [x] **VI. Platform UX**: painel em desktop com menu lateral (ícone + nome), pt-BR, estados de carregamento/vazio/erro; app móvel ganha só o aviso de exclusão e de manutenção; lançamento rápido não é afetado.
- [~] **VII. Simplicity**: escopo muito além de RF01–RF03 (pedido do usuário do produto); exige justificativa por item em Complexity Tracking; sem dependência nova de runtime (sem ArchUnit, sem biblioteca de User-Agent, sem Redis).

### Depois do desenho (Fase 1)

- [x] **I. Monorepo**: `ClientIpResolver`, `Pseudonymizer`, `PerKeyRateLimiter`, `DeviceLabelResolver`, `MaintenanceFilter` em `common/*`; módulo `admin/*` isolado por teste de fronteira (`AdminModuleBoundaryTest`); `ADMIN_NAV_ITEMS` fora do `NAV_ITEMS` compartilhado (o app não mostra administração); contratos aditivos em `core-models`.
- [x] **II. Financial integrity**: confirmado — nenhuma entidade ou serviço financeiro tocado; estatísticas só `COUNT`.
- [x] **III. Data isolation & auth** *(com emenda 1.4.0)*: papel lido do banco a cada requisição; `/admin/**` fechado por padrão; única exceção financeira = `UsageStatsRepository` (`COUNT` por dia); `AdminIsolationIT` percorre **todos** os GET do painel com dados financeiros semeados e prova que nada aparece; JWT continua curto com refresh; segredos (`PSEUDONYM_SECRET`) por variável de ambiente; logs sem dado pessoal (`LogRedactionIT`).
- [x] **IV. Test-first**: plano de testes por história abaixo; Testcontainers real (não H2) para triggers, `unaccent`, advisory locks e `TRUNCATE`; teste de migração no padrão `AccountMigrationV7IT`.
- [x] **V. Schema** *(com emenda 1.4.0)*: `V14`–`V20` aditivas e imutáveis; `ddl-auto=validate`; `CHECK` em todo enum novo; índices por consulta; gatilhos para o raiz e para a imutabilidade da auditoria; exceção "histórico sem FK" justificada (D9).
- [x] **VI. Platform UX**: acessibilidade verificada com axe + teclado + leitor de tela; alerta com ícone e texto; identidade Aurora FinTech reaproveitada (`gef-*`, `ICON_SET`).
- [x] **VII. Simplicity**: justificativas em Complexity Tracking; alternativas simples avaliadas e registradas em `research.md` (ex.: papel em coluna única, sem tabela de papéis; limitadores em memória; sem biblioteca de User-Agent).

## Project Structure

### Documentation (this feature)

```text
specs/005-admin-panel/
├── plan.md              # Este arquivo
├── research.md          # Decisões D1 a D32
├── data-model.md        # users (colunas) + 11 tabelas, máquinas de estado, gatilhos
├── quickstart.md        # Roteiro de validação (inclui criação do raiz)
├── contracts/
│   └── openapi-delta.md # Endpoints /admin/**, públicos novos, alterações aditivas, códigos de erro
├── checklists/requirements.md
└── tasks.md             # Gerado por /speckit-tasks
```

### Source Code (repository root)

```text
apps/api-server/src/main/
├── java/com/jvtech/gefinc/
│   ├── admin/                              # NOVO: tudo sob @AdminOnly (@PreAuthorize hasRole ADMIN)
│   │   ├── common/                         # AdminOnly, AdminPolicy (raiz, último admin, si mesmo), AdminActionExecutor (audit-or-rollback),
│   │   │                                   # Reauthenticator, AdminRateLimitInterceptor, AdminAccessAuditor (negativas + dedupe)
│   │   ├── user/                           # AdminUserController/Service/Repository (busca unaccent), SessionAdmin, EmailChangeService, UserPolicyDtos
│   │   ├── deletion/                       # DeletionRequestService, AccountErasureService, DeletionReason(+Controller/Service), PendingCommunication(+Job)
│   │   ├── audit/                          # AuditLog (@Immutable), AuditLogClient, AuditService, AuditDetails/AuditKey, AuditQueryService, AuditController, jobs de retenção
│   │   ├── email/                          # EmailAdminController, EmailDeliveryRecorder, EmailDeliveryPurgeJob
│   │   ├── invitation/                     # Invitation, InvitationService, InvitationController (+ endpoints públicos em /auth/invitations), InvitationExpiryJob
│   │   ├── parameter/                      # SystemParameter(+Service snapshot), ParameterController, MaintenanceGuard
│   │   └── system/                         # SystemHealthService, UsageStatsRepository (ÚNICA classe com tabela financeira), StatsController
│   ├── auth/                               # ALTERADOS: AuthService (suspensão, origem, manutenção, sessões), AccountDeletionService (livro-razão),
│   │                                       # TokenService (auth_sessions), RegistrationService (cadastros fechados, convite), AuthController (IP real, /auth/me)
│   ├── user/                               # User (role, suspended_at, last_access_at, deletion_*), UserRepository (projeção de token, findForUpdate)
│   ├── common/
│   │   ├── security/                       # ALTERADOS: JwtAuthenticationFilter (papel, sid, suspensão), JwtService (claim sid), SecurityConfig (/admin/**, method security),
│   │   │                                   # ProblemSecurityHandlers (auditoria de negativas); NOVOS: ClientIpResolver, MaintenanceFilter, Pseudonymizer, DeviceLabelResolver
│   │   ├── mail/                           # ALTERADOS (sobre a branch de SMTP): MailService.send(OutgoingMail, DeliveryMode) → MailOutcome; PasswordResetMailListener registra o envio
│   │   ├── ratelimit/                      # NOVO: PerKeyRateLimiter (base de LoginAttemptLimiter, PasswordResetRateLimiter e dos limites do painel)
│   │   └── error/ErrorCode.java            # códigos novos (ver contracts)
│   └── (account, category, transaction, invoice, transfer, dashboard: SEM alteração)
└── resources/
    ├── db/migration/V14 … V20              # ver data-model.md
    └── mail/*.txt                          # modelos pt-BR: convite, aviso de exclusão (prazo/imediata), cancelamento (x2), código de e-mail, avisos de troca, teste
apps/api-server/src/test/java/com/jvtech/gefinc/admin/…      # ITs e unitários (lista abaixo)
apps/api-server/pom.xml                                          # + objetivo build-info do spring-boot-maven-plugin (versão no painel)

packages/
├── core-models/openapi/gefinc.openapi.yaml + src/                # contratos e tipos (aditivos) — Princípio I
└── ui-shared/src/lib/
    ├── auth/login/                                               # aviso de exclusão administrativa/suspensão/manutenção; sem "Cancelar" quando canCancel=false
    ├── api/                                                      # auth.interceptor (503 MAINTENANCE sem expirar sessão; 403 /admin), SessionService.isAdmin(), system.api, notices
    ├── auth/privacy/                                             # PrivacyNoticePage (/privacidade) — FR-061
    └── icons/                                                    # shield, users, audit, mail, ticket, sliders

apps/web-app/src/app/
├── layout/shell.ts                                               # grupo "Administração" (só administradores)
└── admin/                                                        # NOVO, só web
    ├── admin.routes.ts, admin.guard.ts, admin-nav.ts, admin-layout.ts (alerta permanente), admin.api.ts
    ├── overview/ users/ (lista, detalhe, diálogos de ação) audit/ email/ invitations/ deletion-reasons/ settings/
apps/mobile-app/src/app/                                          # tratamento de MAINTENANCE (faixa; fila preservada) e aviso de exclusão (Login compartilhado)
apps/web-app-e2e/src/admin-*.spec.ts, support.ts (promoteToRoot)  # E2E por história + admin-accessibility.spec.ts
apps/mobile-app-e2e/src/…                                         # aviso de exclusão, manutenção + fila offline
tools/ops/promote-root.sh                                         # conveniência do roteiro do raiz
docs/operations.md, docs/deploy-self-hosted-cloudflare-tunnel.md, docker-compose.selfhost.yml, .env.example   # raiz, IP real, segredo, retenção, endurecimento
```

**Structure Decision**: o módulo `admin` é um pacote novo da mesma aplicação Spring, isolado por convenção e por teste (nenhum import de pacotes financeiros fora de `UsageStatsRepository`); o que atravessa a aplicação (IP real, pseudonimização, limitadores, manutenção, e-mail) vive em
`common/*`, pronto para ser reutilizado. No front, o painel é **só do web** (não vai para `ui-shared`, que o app empacota), mas o contrato, o `Login` e o interceptor compartilhados mudam em `ui-shared`/`core-models`.

## Plano de testes (Princípio IV — escritos antes, vistos falhando)

| Área / história | Testes principais |
|---|---|
| **Acesso (US1, SC-001/008/020)** | `AdminAccessIT` (enumera `/admin/**`: anônimo 401, comum 403, 1 auditoria por janela, contador no `MeterRegistry`); `RoleChangeTakesEffectIT` (perfil retirado vale na requisição seguinte); `RootProtectionIT` (6 operações contra o raiz recusadas + auditadas); `RootGuardTriggerIT` (roteiro com `SET LOCAL` funciona; sem ele `42501`); `LastAdminConcurrencyIT` (duas transações simultâneas, no máximo uma vale); `AdminMigrationV16IT` |
| **Isolamento (SC-004)** | `AdminIsolationIT` (semear contas/lançamentos/categorias/transferências de A e B; percorrer todos os GET do painel como administrador: nenhum valor, nome de conta/categoria ou descrição aparece); `AdminModuleBoundaryTest` (fronteira de imports); administrador comum continua 404 em recursos financeiros de terceiros (`*IsolationIT` existentes) |
| **Usuários (US2)** | `UserListSearchIT` (paginação, filtros, ordenação, `unaccent`, curingas literais, 10 000 usuários < 300 ms); `UserDetailAuditIT` (abrir audita; lista/busca não) |
| **Suspensão/sessões (US3, SC-003/017)** | `UserSuspensionIT` (sessão antiga recusada, login recusado, reativar, combinar com exclusão, redefinição não reativa); `SessionManagementIT` (uma, todas, sistema com exceções; `sid` vale na requisição seguinte); `LoginLockClearIT`; `RevertAttemptIT` (todos os canais, 1 registro por janela); `ClientIpResolverTest`; `DeviceLabelResolverTest`; `AdminMigrationV17IT` |
| **Redefinição (US4, SC-006)** | `AdminPasswordResetIT` (reenviar, forçar, nunca expõe senha/link, falha de SMTP desfaz, limite 3/h, conta suspensa recusada); `PasswordResetIT` existente ajustado |
| **Auditoria (US5, SC-005/011/021)** | `AuditImmutabilityIT` (UPDATE/DELETE/TRUNCATE falham); `AuditApiSurfaceIT`; `AuditDedupeIT` (`MutableClock`, janela de 15 min); `AuditQueryIT` (filtros, cursor); `AuditRetentionIT` (cascata na exclusão, job de visitantes 90 dias, `client_ref` correlacionável, linha mantida); `AuditDetailsLeakIT` (varre `details`); `PseudonymizerTest` |
| **Saúde/uso (US6, SC-007)** | `SystemHealthIT` (banco simulado fora → `DOWN` sem detalhes); `UsageStatsIT` (só contagens; cache e refresh) |
| **E-mail (US7)** | `EmailConfigIT` (nunca a senha); `EmailDeliveryIT` (registro, filtros, sem corpo/link/código, purge 90 dias sem tocar pendências); `PendingCommunicationIT` (alerta, reenvio, descarte auditado, expiração 30 dias, endereço retido zerado); `MailServiceTest` ampliado (`SYNC_ONCE` × `WITH_RETRY`, classificação) |
| **Manutenção/parâmetros (US8, SC-019)** | `MaintenanceModeIT` (comum barrado em API/login/refresh/sync, administrador passa, redefinição passa, jobs rodam, convite recusado); `SignupsClosedIT`; `ParameterAuditIT` (valor anterior/novo); front: interceptor não expira a sessão em `503 MAINTENANCE` |
| **Convites/edição (US9, SC-018)** | `InvitationIT` (7 dias, reenviar/cancelar por outro administrador, cadastro próprio consome, expira, e-mail em claro só pendente, manutenção bloqueia, cadastros fechados não); `EmailChangeIT` (código nunca vaza em resposta/auditoria/histórico/log, expira em 15 min, 5 erros, uso único, novo pedido invalida, cancelar, unicidade na solicitação e na confirmação, sessões encerradas, dois avisos); `LogRedactionIT` ampliado |
| **Exclusão (US10–US12, SC-010/012/014/016)** | `DeletionByAdminIT` (com prazo, imediata, prazo fora de 1–30, motivo inativo, reautenticação, e-mail digitado, sempre prossegue com SMTP fora); `DeletionRestoreIT` (cancelar restaura: ativa, suspensa, antecipação volta à data original/origem USER); `UserCannotCancelAdminDeletionIT` (login, `/auth/account-deletion/cancel`, Minha conta); `ErasureAnonymizationIT` (nada de e-mail/nome/IP/dispositivo em `audit_log*`/`email_deliveries`; justificativa mantida); `DeletionReasonIT` (iniciais, não apaga, último ativo, mensagem genérica, fixada); `UserNoticeIT` (uma vez, variantes); `AdminMigrationV15IT/V16IT` |
| **Limites/reautenticação (FR-035/055, SC-013/020)** | `ReauthIT` (5 ações de risco sem senha válida recusadas; 5 falhas revogam a sessão); `AdminRateLimitIT` (30/min, 10/15 min; `429` + `Retry-After`) |
| **Regressão (D31)** | `AuthRegistrationLoginIT`, `AccountDeletionIT`, `RefreshTokenIT`, `PasswordResetIT`, `LoginThrottlingIT` ajustados; todos os `*IsolationIT`, `*ContractIT` seguem verdes |
| **Front (Jest)** | `adminGuard`, `admin.api`, páginas (lista, detalhe, diálogos de ação com texto do efeito), `Login` (423 `ADMIN`, 403 suspensa, 503), `auth.interceptor` (503/403/429), `Shell` (grupo só para administradores), `PrivacyNoticePage` |
| **E2E web (Playwright)** | `admin-access.spec`, `admin-users.spec`, `admin-sessions.spec`, `admin-audit.spec`, `admin-health.spec`, `admin-email.spec`, `admin-maintenance.spec`, `admin-invitations.spec`, `admin-deletion.spec`, `admin-deletion-reasons.spec`, `admin-accessibility.spec` (axe em cada tela, foco/teclado, `role=alert/status`, sem depender só de cor); raiz criado via `promoteToRoot` |
| **E2E mobile** | aviso de exclusão administrativa (sem cancelar), aviso de cancelamento único, manutenção com fila offline preservada e reenviada depois |

## Riscos e mitigações

| # | Risco | Mitigação |
|---|---|---|
| R1 | **E-mail não funciona em produção** se a branch de SMTP não for mesclada; PRs conflitam nos mesmos arquivos | Mesclar `fix/smtp-brevo-async-reset-mail` primeiro (Dependências); gerar o plano de tarefas já sobre a `main` atualizada |
| R2 | **IP forjado** se `TRUSTED_PROXY_CIDRS` for largo ou `native` continuar ligado | Padrão vazio = nunca confia; compose com IP fixo `/32`; `ClientIpResolverTest` (origem não confiável ignora o cabeçalho); passo de verificação no quickstart |
| R3 | **Perda do `PSEUDONYM_SECRET`** (novos identificadores deixam de casar com os antigos) ou vazamento (IPv4 vira reversível) | Guardar com as credenciais; falha ao subir sem segredo; não rotacionar; vazamento exige rotação e é aceito como perda de correlação, não de dados |
| R4 | **Sessão por requisição fica mais pesada** (`sid`, papel, suspensão) | Uma projeção por PK com junção a `auth_sessions`; teste de custo (`TransactionListQueryCountIT` segue verde; novo `AuthQueryCountIT`); sem escrita por requisição (`last_used_at` só na renovação) |
| R5 | **Estatísticas lentas** em `transaction_groups` sem índice por `created_at` | Cache de 60 s; limite de 90 dias; se SC-007 estourar na medição, índice `ix_groups_created_at` (decisão registrada, nova migração) |
| R6 | **`TRUNCATE` dos testes** apaga sementes e esbarra nos gatilhos | `AdminSeed.restore` e `session_replication_role = replica` no `IntegrationTestBase` (D10); documentado para os próximos autores de teste |
| R7 | **Texto de privacidade** pode não bastar juridicamente | Conteúdo mínimo exigido pela spec (FR-061); revisão do dono do produto antes do lançamento; fora do escopo de código |
| R8 | **Justificativa livre com dado pessoal** fica na auditoria para sempre | Risco aceito pelo produto; mitigações: aviso no formulário (FR-048), tamanho máximo, nunca enviada ao usuário; sem exportação |
| R9 | **Estado de exclusão complexo** (origem, antecipação, restauração, suspensão independente) | Máquina de estados em `data-model.md`, `DeletionPolicyTest`/`DeletionRestoreIT` com matriz completa; trava por linha elimina corridas com o job |
| R10 | **Aviso de exclusão só no login com e-mail e senha corretos** (não "ao abrir o app") | Decisão confirmada pelo usuário do produto (D22; spec alinhada em US12/FR-041/FR-042): evita enumeração de contas |
| R11 | **Manutenção desloga o app por engano** (qualquer falha de renovação expira a sessão hoje) | Interceptor compartilhado trata `503 MAINTENANCE` sem `expire()`; teste dedicado; app antigo cai no tratamento de `>= 500` (fila mantida) |
| R12 | **`unaccent` indisponível** em banco gerenciado | Extensão *trusted*; plano B (coluna normalizada mantida pelo serviço) fica fora do escopo e é decisão futura |
| R13 | **Limitadores em memória** zeram no reinício e não valem com várias instâncias | Igual ao que já existe e está documentado em `operations.md`; deduplicação de auditoria e trava do último administrador **estão no banco** |
| R14 | **Lock do `admin-set` e dos dois administradores** pode serializar demais | Conjunto minúsculo de administradores e operações raras; trava só nas ações que mudam o conjunto |
| R15 | **Raiz perdido** (e-mail inacessível) | Roteiro de recuperação pelo banco (D3), testado; aceito pela spec |

## Complexity Tracking

| Adição | Por que é necessária | Alternativa mais simples rejeitada porque |
|---|---|---|
| 11 tabelas administrativas + 6 colunas em `users` (V14–V20) | Auditoria imutável, exclusão com origem/prazo/restauração, convites, trocas de e-mail, histórico e pendências são requisitos da spec (FR-013…FR-062) | Guardar em `users`/JSON perderia histórico, retenções distintas e anonimização por tabela (D7, D10, D13) |
| Gatilhos do PostgreSQL (raiz e imutabilidade da auditoria) | "Só o dono da implantação, pelo banco" e "auditoria imutável" precisam valer mesmo se o código errar (FR-003, FR-020, FR-051) | Só validação no serviço deixaria um `UPDATE` indevido passar; ~40 linhas de PL/pgSQL testáveis |
| `audit_log_client` separado de `audit_log` | Anonimizar IP/dispositivo **sem editar** a auditoria (cascata do banco + job de 90 dias) | `UPDATE` com contorno do gatilho = exceção à imutabilidade e mais risco |
| Tabelas de histórico **sem FK** para `users` | Precisam sobreviver à exclusão do usuário; só guardam ids sem significado externo | FK `SET NULL` apagaria o vínculo que a auditoria e o livro-razão usam; FK `CASCADE` apagaria o histórico |
| `auth_sessions` + claim `sid` | Listar sessões com IP/dispositivo e encerrar **uma** valendo na hora (FR-008, FR-011) | Só `refresh_tokens` não tem IP/dispositivo/último uso e não derruba o token de acesso já emitido |
| `PerKeyRateLimiter` (extração) | Três políticas (login, redefinição, painel) + envios por usuário | Copiar a classe mais duas vezes |
| `ClientIpResolver` (substitui `FORWARD_HEADERS_STRATEGY=native`) | Aceitar `CF-Connecting-IP` **só** do túnel (FR-054) | `native` confia em `X-Forwarded-For`; `remoteip` confia em faixa privada inteira |
| `Pseudonymizer` (HMAC) + `PSEUDONYM_SECRET` | Identificador estável e não reversível, mesmo por força bruta de IPv4 (FR-039, FR-062) | Hash simples de IP é reversível pelo espaço pequeno |
| `DeviceLabelResolver` próprio | Tipo de dispositivo/navegador (FR-008) sem gravar o `User-Agent` bruto e sem dependência | `uap-java`/`ua-parser` (dependência para um rótulo grosseiro) |
| Job de exclusão a cada 5 min (era diário) | Prazos de 1–30 dias e rede de segurança da exclusão imediata (D8) | Diário: até 24 h de atraso |
| 5 jobs de retenção | Cumprem FR-057, FR-059, FR-062 e a limpeza de sessões | Retenção manual não é verificável (SC-011/016/021) |
| Extensão `unaccent` | Busca sem acento (FR-007) | Normalizar no cliente exigiria carregar todos os usuários |
| Objetivo `build-info` no `pom.xml` | Versão em execução (FR-023) | Hardcode da versão |
| Teste de fronteira por leitura de fontes (`AdminModuleBoundaryTest`) | Provar o isolamento do administrador (SC-004) sem ArchUnit | Nova biblioteca de teste |
| **Emenda à constituição 1.3.1 → 1.4.0 (MINOR)** | Princípios III e V não cobrem papel administrativo, contagens globais nem as tabelas novas (a spec já antecipava) | Não emendar deixaria a feature em violação formal dos Princípios III e V |

### Texto proposto para a emenda (a ser aplicada em PR próprio, **não** editada por este plano)

**Sync Impact Report**: versão `1.3.1 → 1.4.0` (MINOR: expansão material dos Princípios III e V — papel administrativo, contagens agregadas globais, tabelas administrativas). Origem: branch `005-admin-panel`.

**Princípio III — reescrever o primeiro marcador e acrescentar um novo, mantendo os demais**:

> - A API MUST autenticar via JWT de curta duração com refresh token; não há sessão HTTP no servidor. O **estado de revogação** (`token_version`, `auth_sessions`, `refresh_tokens`) é guardado no banco e consultado a cada requisição; o token não carrega papel.
> - **Perfil administrador.** O papel (`users.role`: `USER`, `ADMIN`, `ROOT`) MUST ser verificado no servidor a cada requisição, e `/admin/**` MUST ser fechado por padrão. O administrador administra **contas, não finanças**: nenhuma função administrativa MAY ler, listar, somar ou exportar dados das tabelas listadas acima de qualquer usuário. **Única exceção**: contagens agregadas do sistema inteiro (`COUNT` por dia, sem valores, linhas nem identificação de usuário), isoladas em um único repositório (`UsageStatsRepository`), para as estatísticas do painel. O administrador raiz só pode ser criado, alterado ou removido por quem possui o banco.

**Princípio V — substituir o terceiro marcador por**:

> - O modelo de dados — tabelas e entidades JPA — MUST permanecer coerente com o conjunto de dados financeiros (`users`, `accounts`, `categories`, `transaction_groups`, `transactions`, `invoice_payments`, `idempotency_keys`, `account_transfers`) e com as tabelas **administrativas**, que MUST NOT guardar dados financeiros: `system_parameters`, `deletion_reasons`, `account_deletion_requests`, `user_notices`, `auth_sessions`, `audit_log`, `audit_log_client`, `email_deliveries`, `pending_communications`, `invitations`, `pending_email_changes`. `audit_log` é **append-only** (UPDATE, DELETE e TRUNCATE bloqueados no banco). Tabelas de histórico MAY guardar `user_id` sem chave estrangeira quando precisam sobreviver à exclusão do usuário; novas tabelas ou colunas exigem atualização da especificação.

**Princípio IV — acrescentar**: "Todo recurso administrativo MUST ter teste de isolamento provando que o administrador não acessa dados financeiros de terceiros (SC-004)".

**Templates e propagação**: nenhuma alteração necessária em `plan-template.md`, `tasks-template.md`, `spec-template.md`, `checklist-template.md` (reverificar na emenda). `Last Amended` atualizado na data do PR.

## Fases do `/speckit-plan` e artefatos

- **Fase 0** — concluída: `research.md` (D1–D32, sem `NEEDS CLARIFICATION` pendente).
- **Fase 1** — concluída: `data-model.md`, `contracts/openapi-delta.md`, `quickstart.md`.
- **Contexto do agente**: o passo do skill que atualizaria `CLAUDE.md` (bloco `<!-- SPECKIT START -->…<!-- SPECKIT END -->`, trocando `specs/003-bank-accounts-ui-redesign/plan.md` por `specs/005-admin-panel/plan.md`) **não foi aplicado** neste planejamento, por instrução; fica para quando o mantenedor decidir.
- **Próximo passo**: mesclar a infraestrutura de e-mail, aprovar a emenda 1.4.0 e executar `/speckit-tasks`.

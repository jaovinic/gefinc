---
description: "Lista de tarefas da feature Gestão Financeira Pessoal (GEFINC)"
---

# Tasks: Gestão Financeira Pessoal (GEFINC)

**Input**: Documentos de design em `/specs/001-personal-finance-management/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: Pela constituição (Princípio IV, Test-First), os testes são **obrigatórios** para regras de cálculo, endpoints/repositórios (Testcontainers + PostgreSQL) e isolamento de dados. Em cada história, os testes são escritos **antes** da implementação e devem falhar primeiro.

**Organization**: Tarefas agrupadas por história de usuário (P1 a P7). As histórias dependem umas das outras no backend (ver *Dependencies*), mas cada uma tem um teste independente e entrega valor verificável.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: história a que pertence (US1 a US7); fases de Setup, Foundational e Polish não têm rótulo
- Todo caminho é relativo à raiz do repositório

## Path Conventions

- Backend: `apps/api-server/src/main/java/com/jvtech/gefinc/<módulo>/` (código) e `apps/api-server/src/test/java/com/jvtech/gefinc/<módulo>/` (testes)
- Migrações: `apps/api-server/src/main/resources/db/migration/`
- Web: `apps/web-app/src/app/<feature>/`; Mobile: `apps/mobile-app/src/app/<feature>/`
- Pacotes: `packages/core-models/`, `packages/ui-shared/`, `packages/utils/`
- Nenhum app importa código de outro app (Princípio I)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicialização do monorepo e dos projetos

- [ ] T001 Criar os arquivos de workspace Nx na raiz: `package.json` (scripts `dev`, `test`, `build`, `lint`; `dev` sobe o Docker Compose e executa `api-server:serve`, `web-app:serve` e `mobile-app:serve` em paralelo), `nx.json` e `tsconfig.base.json`
- [ ] T002 [P] Criar as bibliotecas `packages/core-models/`, `packages/ui-shared/` e `packages/utils/` (cada uma com `project.json`, `tsconfig.lib.json`, `jest.config.ts` e `src/index.ts`)
- [ ] T003 Criar o projeto Maven `apps/api-server/pom.xml` (Java 21, Spring Boot 3.x, Web, Security, Data JPA, Validation, Mail, Actuator, Flyway + driver PostgreSQL, biblioteca JWT, Testcontainers, GreenMail, swagger-request-validator, Spotless), o Maven Wrapper `apps/api-server/mvnw` e a classe `apps/api-server/src/main/java/com/jvtech/gefinc/GefincApplication.java`
- [ ] T004 Criar `apps/api-server/project.json` com os alvos Nx `build`, `test`, `serve` e `lint` executando `./mvnw` por `nx:run-commands` (depende de T003)
- [ ] T005 [P] Criar o app Angular standalone `apps/web-app/` com Tailwind CSS, Jest e Playwright (`apps/web-app/project.json`, `apps/web-app/tailwind.config.js`, `apps/web-app/playwright.config.ts`)
- [ ] T006 [P] Criar o app Ionic + Angular + Capacitor `apps/mobile-app/` com Tailwind CSS para estilo, conforme o Princípio VI da constituição (`apps/mobile-app/project.json`, `apps/mobile-app/capacitor.config.ts`, `apps/mobile-app/playwright.config.ts` com viewport de celular)
- [ ] T007 Adicionar as plataformas nativas ao app móvel (`npx cap add android` e, apenas em macOS, `npx cap add ios`), gerando `apps/mobile-app/android/` e `apps/mobile-app/ios/`, e conferir que `npx nx run mobile-app:sync` conclui (depende de T006)
- [ ] T008 [P] Criar `docker-compose.yml` (PostgreSQL 16 e Mailpit) e `.env.example` (`DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `APP_BASE_URL`)
- [ ] T009 [P] Configurar ESLint e Prettier na raiz (`.eslintrc.json`, `.prettierrc`) com regra de fronteira de módulos Nx proibindo importação entre apps
- [ ] T010 [P] Criar o pipeline `.github/workflows/ci.yml` executando `nx affected -t lint test build` com Docker disponível para o Testcontainers
- [ ] T011 T-DOC: atualizar `spec-genfic.md` §5 com as tabelas e colunas novas descritas em `specs/001-personal-finance-management/data-model.md` (`invoice_payments`, `refresh_tokens`, `password_reset_tokens` e colunas de apoio), como exige o Princípio V; fazer antes da primeira migração

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura comum que DEVE estar pronta antes de qualquer história

**⚠️ CRITICAL**: Nenhuma história começa antes desta fase terminar

- [ ] T012 [P] Copiar o contrato para `packages/core-models/openapi/gefinc.openapi.yaml`, criar o alvo `generate` em `packages/core-models/project.json` (openapi-typescript → `packages/core-models/src/generated/api.ts`) e exportar os tipos em `packages/core-models/src/index.ts`
- [ ] T013 [P] Criar os vetores de teste compartilhados `packages/core-models/fixtures/installments.json`: cartão fechando dia 10 e vencendo dia 17 (compra dia 5 e dia 12), compra no próprio dia de fechamento, vencimento anterior ao fechamento (fecha 25, vence 5), dia 31 em mês curto, virada de ano, R$ 100,00 em 3 parcelas (33,33/33,33/33,34), parcela única, `closing_day == due_day` (vence no mês seguinte ao fechamento), compra avulsa e ocorrência fixa em cartão (o vencimento informado é ignorado) e carnê na conta corrente (R$ 300,00 em 3 parcelas com primeiro vencimento em 10/11)
- [ ] T014 [P] Escrever testes que falham para `Money` em `packages/utils/src/lib/money.spec.ts` (parse de string decimal, soma/subtração exata, divisão em parcelas com resto, formatação BRL, rejeição de mais de 2 casas decimais)
- [ ] T015 Implementar `Money` em `packages/utils/src/lib/money.ts` (string decimal sobre centavos em `BigInt`, formatação `R$ 1.234,56`) e exportar em `packages/utils/src/index.ts` (depende de T014)
- [ ] T016 [P] Criar o tratamento de erros RFC 7807 em `apps/api-server/src/main/java/com/jvtech/gefinc/common/error/` (`ApiException.java`, `ErrorCode.java`, `GlobalExceptionHandler.java` com campo `code` e lista `errors` para validação)
- [ ] T017 [P] Criar `apps/api-server/src/main/java/com/jvtech/gefinc/common/config/ClockConfig.java` com `Clock` no fuso `America/Sao_Paulo`
- [ ] T018 [P] Criar `apps/api-server/src/main/resources/application.yml` e `application-local.yml` (datasource por variáveis de ambiente, Flyway, `ddl-auto: validate`, e-mail, propriedades JWT, origens CORS)
- [ ] T019 [P] Criar o log estruturado em `apps/api-server/src/main/java/com/jvtech/gefinc/common/logging/CorrelationIdFilter.java` e `apps/api-server/src/main/resources/logback-spring.xml` (JSON, sem e-mail, valores ou tokens)
- [ ] T020 [P] Escrever o teste que falha `apps/api-server/src/test/java/com/jvtech/gefinc/common/security/JwtServiceTest.java` (emissão, validação, expiração de 15 minutos, assinatura inválida, claim com a versão do token)
- [ ] T021 Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/common/security/JwtService.java`, `SecurityConfig.java` (stateless; filtro JWT que, a cada requisição, confere `users.token_version` e a exclusão pendente por meio da interface `TokenVersionLookup`, com implementação provisória em memória nesta fase, substituída pelo adaptador de T033; CORS; cabeçalhos de segurança; rotas públicas: register, login, refresh, password-reset/request, password-reset/confirm e account-deletion/cancel, enquanto logout e account-deletion exigem autenticação) e `CurrentUser.java` que expõe o `userId` do token (depende de T020)
- [ ] T022 [P] Criar o suporte de testes `apps/api-server/src/test/java/com/jvtech/gefinc/support/IntegrationTestBase.java` (Testcontainers PostgreSQL 16, helpers para criar e autenticar usuários de teste) e `support/ContractAssertions.java` (valida respostas contra `packages/core-models/openapi/gefinc.openapi.yaml`; depende de T012)
- [ ] T023 [P] Criar a casca do web em `apps/web-app/src/app/core/` (`api-client.ts`, `auth.interceptor.ts` com cabeçalho `X-Client: web`, `withCredentials`, uma renovação de token em `401` e, se ela falhar, preservação do rascunho do formulário em `sessionStorage` com redirecionamento ao login e retomada depois, tratamento de `409 STALE_VERSION` com mensagem de conflito e recarga do registro, `app.routes.ts`, `app.config.ts` com locale `pt-BR`) e o layout com botão de sair em `apps/web-app/src/app/layout/`
- [ ] T024 [P] Criar a casca do mobile em `apps/mobile-app/src/app/core/` (`api-client.ts`, `secure-storage.service.ts` sobre o plugin de armazenamento seguro do Capacitor, `auth.interceptor.ts` com preservação do rascunho do formulário e retomada após novo login quando a renovação falhar, tratamento de `409 STALE_VERSION` com mensagem de conflito e recarga do registro, `app.routes.ts`) e a ação de sair
- [ ] T025 [P] Criar componentes base em `packages/ui-shared/src/lib/` (`money-input/`, `state-views/` para carregamento, vazio e erro, `month-picker/`) com testes Jest

**Checkpoint**: Fundação pronta; as histórias podem começar

---

## Phase 3: User Story 1 - Acesso seguro aos meus dados financeiros (Priority: P1) 🎯 MVP

**Goal**: Cadastro, login, renovação de sessão, recuperação de senha e exclusão de conta com carência de 30 dias

**Independent Test**: Cadastrar dois usuários, entrar com cada um, renovar a sessão, recuperar a senha pelo Mailpit, solicitar e cancelar a exclusão; confirmar que cada usuário acessa só a si mesmo e que sem login o acesso é bloqueado

### Tests for User Story 1 (MANDATORY) ⚠️

> **Escreva primeiro e confirme que FALHAM antes da implementação**

- [ ] T026 [P] [US1] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/auth/AuthRegistrationLoginIT.java` (cadastro, e-mail duplicado `409`, senha fraca `422`, login, credenciais erradas com mensagem genérica, rotas protegidas sem token `401`)
- [ ] T027 [P] [US1] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/auth/RefreshTokenIT.java` (renovação com rotação, cookie `HttpOnly` no modo web e corpo no mobile, reuso de token rotacionado revoga a família, logout revoga)
- [ ] T028 [P] [US1] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/auth/PasswordResetIT.java` (e-mail recebido via GreenMail, link válido por 60 minutos e de uso único, expirado/usado `400`, resposta idêntica para e-mail inexistente, limite de 3 por hora `429`, novo link invalida o anterior, sessões antigas revogadas, token de acesso emitido antes da troca recusado na hora)
- [ ] T029 [P] [US1] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/auth/AccountDeletionIT.java` (senha incorreta recusada, token de acesso emitido antes do pedido recusado na hora, login com exclusão pendente responde `423` sem tokens, cancelamento restaura o acesso, e-mail reservado durante a carência, job apaga em cascata após 30 dias usando `Clock` fixo, inclusive usuário com contas, categorias e lançamentos)
- [ ] T030 [P] [US1] Teste unitário `apps/api-server/src/test/java/com/jvtech/gefinc/auth/PasswordPolicyTest.java` (mínimo de 10 caracteres e máximo de 72 **bytes** em UTF-8, incluindo acentos e emoji)
- [ ] T031 [P] [US1] Teste E2E `apps/web-app/e2e/auth.spec.ts` (cadastro, login, logout, fluxo de recuperação de senha via Mailpit, solicitar e cancelar exclusão)

### Implementation for User Story 1

- [ ] T032 [US1] Criar a migração `apps/api-server/src/main/resources/db/migration/V1__users_and_tokens.sql` (`users` com índice único em `lower(email)` e coluna `token_version`, `refresh_tokens`, `password_reset_tokens` e índices, conforme `data-model.md`)
- [ ] T033 [P] [US1] Criar `apps/api-server/src/main/java/com/jvtech/gefinc/user/User.java` e `UserRepository.java`, mais o adaptador `TokenVersionLookup` usado pelo filtro JWT (T021)
- [ ] T034 [P] [US1] Criar as entidades e repositórios `auth/RefreshToken.java`, `RefreshTokenRepository.java`, `PasswordResetToken.java`, `PasswordResetTokenRepository.java` em `apps/api-server/src/main/java/com/jvtech/gefinc/auth/`
- [ ] T035 [US1] Implementar `auth/PasswordPolicy.java` e `auth/RegistrationService.java` (BCrypt custo 12, e-mail único sem diferenciar maiúsculas) em `apps/api-server/src/main/java/com/jvtech/gefinc/auth/`, publicando `user/UserRegisteredEvent.java` ao concluir o cadastro
- [ ] T036 [US1] Implementar `auth/TokenService.java` (geração, hash SHA-256, rotação, revogação por família) e `auth/AuthService.java` (login emitindo o JWT com a versão do usuário, refresh, logout, resposta `423` com a data limite em exclusão pendente) em `apps/api-server/src/main/java/com/jvtech/gefinc/auth/`
- [ ] T037 [US1] Implementar `auth/PasswordResetService.java` (token de 60 minutos, limite de 3 por hora por e-mail, resposta sempre `202`, incrementa `token_version` ao confirmar a nova senha) e `common/mail/MailService.java` com o modelo `apps/api-server/src/main/resources/mail/password-reset.txt` em pt-BR
- [ ] T038 [US1] Implementar `auth/AccountDeletionService.java` (confirmação por senha, revogação de sessões e incremento de `token_version`, cancelamento) e `auth/AccountDeletionJob.java` (`@Scheduled` diário, remove usuários com carência vencida) em `apps/api-server/src/main/java/com/jvtech/gefinc/auth/`
- [ ] T039 [US1] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/auth/AuthController.java` com todos os endpoints `/auth/*` do contrato, entregando o refresh token em cookie `HttpOnly; Secure; SameSite=Strict` quando `X-Client: web` e no corpo nos demais casos
- [ ] T040 [P] [US1] Criar as telas web `apps/web-app/src/app/auth/` (`login/`, `register/`, `forgot-password/`, `reset-password/`, `delete-account/`) com validação e mensagens em pt-BR
- [ ] T041 [P] [US1] Criar as telas mobile `apps/mobile-app/src/app/auth/` e a restauração de sessão ao abrir o app, guardando os tokens no armazenamento seguro do dispositivo

**Checkpoint**: Usuários podem se cadastrar, entrar, recuperar a senha e excluir a conta

---

## Phase 4: User Story 2 - Cadastrar contas bancárias, dinheiro e cartões de crédito (Priority: P2)

**Goal**: CRUD de contas e cartões com dia de fechamento e vencimento

**Independent Test**: Cadastrar conta corrente, carteira e cartão (dias 10 e 17), editar, inativar e consultar a lista; confirmar que cartão sem dias é recusado e que um usuário não vê as contas de outro

### Tests for User Story 2 (MANDATORY) ⚠️

- [ ] T042 [P] [US2] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/account/AccountApiIT.java` (criar os três tipos, dias obrigatórios só no cartão e proibidos nos demais, dias fora de 1 a 31 `422`, edição, inativação e reativação, listagem com e sem inativas, versão desatualizada `409`, mudança dos dias do cartão publica o evento de alteração)
- [ ] T043 [P] [US2] Teste de isolamento `apps/api-server/src/test/java/com/jvtech/gefinc/account/AccountIsolationIT.java` (usuário B recebe `404` ao ler, editar ou excluir conta do usuário A)

### Implementation for User Story 2

- [ ] T044 [US2] Criar a migração `apps/api-server/src/main/resources/db/migration/V2__accounts.sql` (`accounts` com `CHECK` de tipo, dias e coerência cartão/dias, `UNIQUE (id, user_id)`, `active`, `version`)
- [ ] T045 [P] [US2] Criar `apps/api-server/src/main/java/com/jvtech/gefinc/account/Account.java` (com `@Version`) e `AccountRepository.java` (toda consulta filtrada por `userId`)
- [ ] T046 [US2] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/account/AccountService.java` (validação dos dias, publicação de `account/CardDaysChangedEvent.java` ao mudar os dias do cartão, inativação, regra de exclusão: `409 ACCOUNT_IN_USE` quando houver lançamentos)
- [ ] T047 [US2] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/account/AccountController.java` conforme `/accounts` do contrato
- [ ] T048 [P] [US2] Criar a tela web `apps/web-app/src/app/accounts/` (lista, formulário com campos de fechamento e vencimento só para cartão, inativar e reativar)

**Checkpoint**: Contas e cartões funcionam de forma independente

---

## Phase 5: User Story 3 - Receitas e despesas fixas e avulsas, categorias e status (Priority: P3)

**Goal**: Categorias, lançamentos fixos e avulsos, marcação de pago e listagem filtrada

**Independent Test**: Cadastrar salário fixo, despesa fixa e compra avulsa, classificar em categorias, marcar um como pago e desfazer, conferir a lista por mês e os filtros

### Tests for User Story 3 (MANDATORY) ⚠️

- [ ] T049 [P] [US3] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/category/CategoryApiIT.java` (categorias iniciais criadas no cadastro, CRUD, nome único por tipo, cor inválida `422`, exclusão em uso `409`, `reassignTo` com tipo diferente `422`, isolamento entre usuários)
- [ ] T050 [P] [US3] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/transaction/TransactionGroupFixedVariableIT.java` (avulso gera 1 lançamento no mês do vencimento; fixo gera 12 ocorrências; `amount-changes` altera só de um mês em diante e preserva anteriores e pagas; `end` remove as pendentes posteriores; no cartão, avulso e fixo ignoram o vencimento informado e usam o da fatura, cenários 8 e 9 da US3; conta inativa recusa novo lançamento com `422 ACCOUNT_INACTIVE`)
- [ ] T051 [P] [US3] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/transaction/TransactionPayUnpayListIT.java` (pagar com data, desfazer remove a data, filtros por mês, conta, categoria, tipo e status, paginação, indicador de atraso)
- [ ] T052 [P] [US3] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/transaction/FixedRecurrenceJobIT.java` (completa a janela de 12 meses, é idempotente, ignora grupos encerrados)
- [ ] T053 [P] [US3] Testes `apps/api-server/src/test/java/com/jvtech/gefinc/transaction/TransactionIsolationIT.java` (acesso cruzado `404`, conta ou categoria de outro usuário `404`) e `account/AccountInUseIT.java` (excluir conta com lançamentos `409 ACCOUNT_IN_USE`)
- [ ] T054 [P] [US3] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/transaction/TransactionValidationIT.java` (valor zero ou negativo, data inválida, campos obrigatórios, mais de 2 casas decimais, versão desatualizada `409`)
- [ ] T055 [P] [US3] Teste unitário `apps/api-server/src/test/java/com/jvtech/gefinc/transaction/DueDateCalculatorTest.java` lendo `packages/core-models/fixtures/installments.json` (fechamento, compra no dia de fechamento, `closing_day == due_day`, mês curto, virada de ano, ocorrência fixa em cartão)
- [ ] T056 [P] [US3] Teste `packages/utils/src/lib/due-date.spec.ts` lendo os mesmos vetores de `packages/core-models/fixtures/installments.json`
- [ ] T057 [P] [US3] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/transaction/CardDaysChangeIT.java` (ocorrência fixa pendente futura é recalculada; paga, avulsa e parcela são mantidas; fatura com pagamento registrado fica intacta; vencimento hoje ou anterior não muda, regra `> hoje`; compra nova segue os novos dias)

### Implementation for User Story 3

- [ ] T058 [US3] Criar a migração `apps/api-server/src/main/resources/db/migration/V3__categories.sql` (`categories` com `CHECK` de tipo e cor, `UNIQUE (user_id, type, name)` e `UNIQUE (id, user_id)`)
- [ ] T059 [US3] Criar a migração `apps/api-server/src/main/resources/db/migration/V4__transaction_groups_and_transactions.sql` (`transaction_groups` e `transactions` com chaves estrangeiras compostas (`ON DELETE NO ACTION` para conta e categoria), `CHECK` de status/pagamento, `reference_month`, unicidades `(group_id, installment_number)` e `(group_id, reference_month)` e os índices por `user_id`)
- [ ] T060 [P] [US3] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/category/` (`Category.java`, `CategoryRepository.java`, `CategoryService.java` com `reassignTo`, `CategoryController.java`)
- [ ] T061 [P] [US3] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/category/DefaultCategorySeeder.java`, que cria as categorias iniciais ao receber `UserRegisteredEvent`
- [ ] T062 [P] [US3] Criar as entidades e repositórios `transaction/TransactionGroup.java`, `Transaction.java`, `TransactionGroupRepository.java`, `TransactionRepository.java` em `apps/api-server/src/main/java/com/jvtech/gefinc/transaction/` (`@Version`, consultas sempre por `userId`)
- [ ] T063 [P] [US3] Implementar a classe pura `apps/api-server/src/main/java/com/jvtech/gefinc/transaction/DueDateCalculator.java` (vencimento da fatura a partir da data da compra e dos dias de fechamento e vencimento do cartão; usada por avulso, fixo e parcelas)
- [ ] T064 [P] [US3] Implementar `packages/utils/src/lib/due-date.ts` (mesma regra, para prévia na interface) e exportar em `packages/utils/src/index.ts`
- [ ] T065 [US3] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/transaction/TransactionGroupService.java` para `VARIABLE` e `FIXED` (geração das 12 ocorrências, edição, `amount-changes`, `end`; em conta de cartão o vencimento de cada ocorrência vem do `DueDateCalculator`, e fora do cartão exige `firstDueDate`)
- [ ] T066 [US3] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/transaction/FixedRecurrenceJob.java` (`@Scheduled` diário que completa a janela de 12 meses, usando o `DueDateCalculator` em conta de cartão)
- [ ] T067 [US3] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/transaction/FixedDueDateRecalculationListener.java`, que ouve `CardDaysChangedEvent` e aplica a regra do FR-014 usando o `DueDateCalculator`
- [ ] T068 [US3] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/transaction/TransactionService.java` (listagem filtrada e paginada, edição, pagar, desfazer, indicador de atraso com `Clock`)
- [ ] T069 [US3] Implementar `transaction/TransactionGroupController.java` e `transaction/TransactionController.java` em `apps/api-server/src/main/java/com/jvtech/gefinc/transaction/` conforme o contrato
- [ ] T070 [P] [US3] Criar a tela web `apps/web-app/src/app/categories/` (lista, criação, edição, exclusão com reatribuição)
- [ ] T071 [P] [US3] Criar a tela web `apps/web-app/src/app/transactions/` (tabela analítica por mês com filtros, formulário de lançamento fixo e avulso (em cartão o campo de vencimento some e a prévia do vencimento vem de `packages/utils`), pagar e desfazer, alterar valor a partir de um mês, encerrar fixo)

**Checkpoint**: Controle básico de receitas e despesas funcionando

---

## Phase 6: User Story 4 - Compras parceladas com projeção automática (Priority: P4)

**Goal**: Gerar parcelas com vencimento correto no cartão e fora dele

**Independent Test**: Registrar R$ 1.000,00 em 3 parcelas num cartão e um carnê na conta corrente; conferir datas, soma exata e o aviso ao excluir com parcelas pagas

### Tests for User Story 4 (MANDATORY) ⚠️

- [ ] T072 [P] [US4] Teste unitário `apps/api-server/src/test/java/com/jvtech/gefinc/transaction/InstallmentSchedulerTest.java` que lê `packages/core-models/fixtures/installments.json`
- [ ] T073 [P] [US4] Teste `packages/utils/src/lib/installments.spec.ts` lendo os mesmos vetores de `packages/core-models/fixtures/installments.json`
- [ ] T074 [P] [US4] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/transaction/TransactionGroupInstallmentIT.java` (cenários 1 a 7 da US4: fechamento, compra após o fechamento, resto de centavos, parcela única, carnê, pagar só a parcela 2)
- [ ] T075 [P] [US4] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/transaction/GroupImpactAndDeleteIT.java` (`/impact` informa pagas e pendentes, `DELETE` exige `confirm=true`, parcelas pagas são preservadas, edição de descrição e categoria)

### Implementation for User Story 4

- [ ] T076 [US4] Implementar a classe pura `apps/api-server/src/main/java/com/jvtech/gefinc/transaction/InstallmentScheduler.java` (delega o vencimento no cartão ao `DueDateCalculator`, mensal fora do cartão, último dia do mês, resto de centavos na última parcela)
- [ ] T077 [P] [US4] Implementar `packages/utils/src/lib/installments.ts` (mesma regra, usando `due-date.ts`, para prévia na interface) e exportar em `packages/utils/src/index.ts`
- [ ] T078 [US4] Estender `apps/api-server/src/main/java/com/jvtech/gefinc/transaction/TransactionGroupService.java` para `INSTALLMENT` (usa `InstallmentScheduler` e os dias da conta) e adicionar `impact` e a exclusão com confirmação em `TransactionGroupController.java`
- [ ] T079 [P] [US4] Criar o formulário web `apps/web-app/src/app/transactions/installment-form/` com prévia das parcelas e o diálogo de confirmação ao editar ou excluir `apps/web-app/src/app/transactions/group-impact-dialog/`

**Checkpoint**: Compras parceladas geradas e verificadas

---

## Phase 7: User Story 5 - Projetar e pagar faturas e ver o saldo residual (Priority: P5)

**Goal**: Fatura derivada, pagamento total ou parcial, projeção por cartão e saldo residual mensal

**Independent Test**: Com salário fixo, despesas fixas e uma compra parcelada, abrir a projeção, pagar parte da fatura, quitar, desfazer; conferir totais contra a soma manual

### Tests for User Story 5 (MANDATORY) ⚠️

- [ ] T080 [P] [US5] Teste unitário `apps/api-server/src/test/java/com/jvtech/gefinc/invoice/InvoiceCalculatorTest.java` (total, pago individual, pago por fatura, restante, restante nunca negativo)
- [ ] T081 [P] [US5] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/invoice/InvoicePaymentIT.java` (cenários 6 a 10 da US5, quitação marca os itens pendentes, desfazer após a quitação reverte só os itens quitados automaticamente, pagamento acima do restante `409 INVOICE_BALANCE_VIOLATION`, valor zero ou negativo `422`)
- [ ] T082 [P] [US5] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/invoice/InvoiceBalanceGuardIT.java` (excluir ou reduzir um item que deixaria o restante negativo responde `409`; dois pagamentos simultâneos não ultrapassam o restante)
- [ ] T083 [P] [US5] Testes de integração `apps/api-server/src/test/java/com/jvtech/gefinc/invoice/InvoiceProjectionIT.java` (totais por cartão e mês, mês vazio zerado, fatura com vencimentos distintos exibe o mais recente) e `dashboard/CashflowIT.java` (saldo residual = receitas − despesas, valor negativo, usuário B não enxerga o fluxo do usuário A)
- [ ] T084 [P] [US5] Teste de isolamento `apps/api-server/src/test/java/com/jvtech/gefinc/invoice/InvoiceIsolationIT.java` (fatura, pagamento e projeção de outro usuário respondem `404` ou vazio)

### Implementation for User Story 5

- [ ] T085 [US5] Criar a migração `apps/api-server/src/main/resources/db/migration/V5__invoice_payments.sql` (`invoice_payments`, coluna `transactions.settled_by_payment_id` com chave estrangeira `ON DELETE NO ACTION` e `CHECK`, índice por conta e mês)
- [ ] T086 [P] [US5] Criar `apps/api-server/src/main/java/com/jvtech/gefinc/invoice/InvoicePayment.java` e `InvoicePaymentRepository.java`
- [ ] T087 [US5] Adicionar `settledByPaymentId` a `apps/api-server/src/main/java/com/jvtech/gefinc/transaction/Transaction.java` e as consultas de soma por fatura em `TransactionRepository.java`
- [ ] T088 [P] [US5] Implementar a classe pura `apps/api-server/src/main/java/com/jvtech/gefinc/invoice/InvoiceCalculator.java`
- [ ] T089 [US5] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/invoice/InvoiceService.java` (fatura derivada com itens e pagamentos, `dueDate` igual ao maior vencimento dos itens, projeção por cartão e mês)
- [ ] T090 [US5] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/invoice/InvoicePaymentService.java` (trava a linha da conta com `FOR UPDATE`, valida o restante, quita e marca os itens com `payment_date` igual à data do pagamento que quitou, desfaz o pagamento revertendo antes os itens quitados por ele)
- [ ] T091 [US5] Aplicar a trava de saldo nas operações de excluir e editar lançamentos em `transaction/TransactionService.java` e `transaction/TransactionGroupService.java` (responde `409 INVOICE_BALANCE_VIOLATION` com o restante)
- [ ] T092 [US5] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/invoice/InvoiceController.java` (fatura, pagamentos, `settle`, `DELETE /invoice-payments/{id}`, `/invoices/projection`)
- [ ] T093 [US5] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/dashboard/CashflowService.java` e `CashflowController.java` (`/cashflow`)
- [ ] T094 [P] [US5] Criar a tela web `apps/web-app/src/app/invoices/` (detalhe da fatura com itens e restante, diálogo de pagamento parcial e total, desfazer, tabela de projeção por cartão)
- [ ] T095 [P] [US5] Criar a visão web `apps/web-app/src/app/invoices/cashflow/` com o saldo residual por mês e destaque para valores negativos

**Checkpoint**: Faturas, pagamentos e saldo residual corretos

---

## Phase 8: User Story 6 - Painel do mês (Priority: P6)

**Goal**: Indicadores, gráfico por categoria e distribuição por cartão, sempre por mês de vencimento

**Independent Test**: Com lançamentos pagos e pendentes em várias categorias e cartões, abrir o painel e conferir cada número contra os dados; trocar de mês e ver a compra de 05/11 (vence 17/12) só em dezembro

### Tests for User Story 6 (MANDATORY) ⚠️

- [ ] T096 [P] [US6] Teste de integração `apps/api-server/src/test/java/com/jvtech/gefinc/dashboard/DashboardIT.java` (Total do Mês, Total a Vencer, Total Pago com pagamentos parciais atribuídos ao mês do vencimento e sem contar duas vezes os itens quitados pela fatura, atrasados, por categoria, por cartão, mês por vencimento, mês vazio, isolamento entre usuários)
- [ ] T097 [P] [US6] Teste de desempenho `apps/api-server/src/test/java/com/jvtech/gefinc/dashboard/DashboardPerformanceIT.java` (6.000 lançamentos de um usuário, painel e projeção com p95 abaixo de 2 s, SC-006)

### Implementation for User Story 6

- [ ] T098 [US6] Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/dashboard/DashboardRepository.java` (agregações SQL nativas por `reference_month`, conforme as fórmulas de indicadores do `data-model.md`), `DashboardService.java` e `DashboardController.java` (`/dashboard`)
- [ ] T099 [P] [US6] Criar os gráficos `packages/ui-shared/src/lib/charts/` (rosca por categoria com a cor da categoria e barras por cartão, Chart.js 4) com testes Jest
- [ ] T100 [US6] Criar o painel web `apps/web-app/src/app/dashboard/` (cartões de indicadores, seletor de mês, gráficos, estado vazio com orientação)
- [ ] T101 [P] [US6] Teste E2E `apps/web-app/e2e/invoices-dashboard.spec.ts` (compra parcelada, pagamento parcial da fatura, conferência dos totais do painel)

**Checkpoint**: Painel mensal completo

---

## Phase 9: User Story 7 - Lançar uma despesa rapidamente pelo celular (Priority: P7)

**Goal**: Registrar despesa avulsa em até 3 toques a partir da tela inicial do app

**Independent Test**: No app móvel, a partir da tela inicial, concluir uma despesa avulsa e contar os toques

### Tests for User Story 7 (MANDATORY para o limite de toques) ⚠️

- [ ] T102 [P] [US7] Teste E2E `apps/mobile-app/e2e/quick-expense.spec.ts` em viewport de celular (conta os toques e exige no máximo 3, ajuste inline de conta, categoria e data, campos obrigatórios ausentes preservam o que foi digitado)
- [ ] T103 [P] [US7] Teste unitário `apps/mobile-app/src/app/quick-expense/quick-expense-defaults.service.spec.ts` (conta, categoria e data padrão ou últimas usadas)

### Implementation for User Story 7

- [ ] T104 [US7] Implementar `apps/mobile-app/src/app/quick-expense/quick-expense-defaults.service.ts` (guarda a última conta e categoria usadas)
- [ ] T105 [US7] Implementar `apps/mobile-app/src/app/quick-expense/quick-expense.page.ts` (formulário aberto pelo botão da tela inicial: valor, ajustes inline, salvar; em falha de rede mantém o rascunho e informa o usuário)
- [ ] T106 [P] [US7] Criar a tela inicial `apps/mobile-app/src/app/home/` (ponto de partida do FR-041) com o botão de ação do lançamento rápido e o Total do Mês obtido de `/dashboard`

**Checkpoint**: Todas as histórias funcionam

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Melhorias que atravessam várias histórias

- [ ] T107 [P] Teste `apps/api-server/src/test/java/com/jvtech/gefinc/common/logging/LogRedactionIT.java` garantindo que e-mail, senha, tokens e valores não aparecem nos logs (FR-003)
- [ ] T108 [P] Teste `apps/api-server/src/test/java/com/jvtech/gefinc/common/security/SecurityHeadersIT.java` (cabeçalhos de segurança e CORS restrito às origens do web e do app)
- [ ] T109 [P] Revisão de acessibilidade, textos em pt-BR e estados de carregamento, vazio e erro em `apps/web-app/src/app/` e `apps/mobile-app/src/app/`
- [ ] T110 [P] Atualizar `README.md` com instruções de execução, testes e a estrutura final do monorepo
- [ ] T111 [P] Criar `docs/operations.md` registrando a retenção de backups após a exclusão de conta e o backlog de limitação de tentativas de login
- [ ] T112 [P] Criar o teste de carga `apps/api-server/loadtest/concurrent-users.js` (k6, 1.000 usuários simultâneos nos fluxos de lançamento, painel e projeção, SC-008) com instruções de execução no cabeçalho do script
- [ ] T113 Executar o roteiro de validação de `specs/001-personal-finance-management/quickstart.md` de ponta a ponta e corrigir as divergências encontradas
- [ ] T114 Executar `npx nx run-many -t lint test build` e os testes E2E do web e do mobile, e corrigir as falhas

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências; T011 antes de qualquer migração (T032 em diante)
- **Foundational (Phase 2)**: depende do Setup e BLOQUEIA todas as histórias
- **User Stories (Phase 3 a 9)**: dependem da fase Foundational
- **Polish (Phase 10)**: depende das histórias desejadas

### User Story Dependencies

Diferente do modelo genérico, as histórias deste produto se apoiam no backend umas das outras (a spec já indica isso nas justificativas de prioridade):

- **US1 (P1)**: só depende da Foundational
- **US2 (P2)**: depende de US1 (usuário autenticado)
- **US3 (P3)**: depende de US1 e US2 (contas); consome o `UserRegisteredEvent` de US1 e o `CardDaysChangedEvent` de US2; cria o `DueDateCalculator`, que US4 reutiliza
- **US4 (P4)**: depende de US3 (serviço de grupos e `DueDateCalculator`) e US2 (dias do cartão)
- **US5 (P5)**: depende de US4 (itens parcelados) e US2
- **US6 (P6)**: depende de US3; usa pagamentos de fatura de US5 nos totais
- **US7 (P7)**: depende de US1, US2 e US3 (lançamento avulso); o resumo da tela inicial usa US6

As telas web e mobile de cada história podem avançar em paralelo ao backend assim que o contrato (`packages/core-models`) estiver gerado.

### Within Each User Story

- Testes escritos e FALHANDO antes da implementação
- Migração → entidades → serviços → controllers → telas
- Código de domínio puro (`InstallmentScheduler`, `InvoiceCalculator`) antes dos serviços que o usam

### Parallel Opportunities

- Setup: T002, T005, T006, T008, T009 e T010 em paralelo
- Foundational: T012, T013, T014, T016 a T020, T022 a T025 em paralelo
- Em cada história, todos os testes marcados [P] em paralelo e as telas web e mobile em paralelo com o backend
- Entre histórias, equipes diferentes podem trabalhar em frentes distintas (ex.: backend de US5 enquanto outra pessoa faz as telas de US3)

---

## Parallel Example: User Story 1

```bash
# Testes da US1 juntos (todos devem falhar antes da implementação):
Task: "Teste de integração AuthRegistrationLoginIT em apps/api-server/src/test/java/com/jvtech/gefinc/auth/AuthRegistrationLoginIT.java"
Task: "Teste de integração RefreshTokenIT em apps/api-server/src/test/java/com/jvtech/gefinc/auth/RefreshTokenIT.java"
Task: "Teste de integração PasswordResetIT em apps/api-server/src/test/java/com/jvtech/gefinc/auth/PasswordResetIT.java"
Task: "Teste de integração AccountDeletionIT em apps/api-server/src/test/java/com/jvtech/gefinc/auth/AccountDeletionIT.java"

# Depois, entidades e telas em paralelo:
Task: "Criar User e UserRepository em apps/api-server/src/main/java/com/jvtech/gefinc/user/"
Task: "Criar as telas web de autenticação em apps/web-app/src/app/auth/"
Task: "Criar as telas mobile de autenticação em apps/mobile-app/src/app/auth/"
```

---

## Implementation Strategy

### MVP First

1. Concluir Setup e Foundational
2. Concluir US1 (acesso seguro) e validar sozinho: é o menor incremento verificável
3. Concluir US2 e US3: com elas o produto já controla receitas e despesas, que é o **MVP de uso real** sugerido
4. Demonstrar e seguir para US4 a US7

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. US1 → acesso seguro (validação independente)
3. US2 + US3 → controle básico de receitas e despesas (MVP de uso)
4. US4 → parcelamentos
5. US5 → faturas, pagamento parcial e saldo residual
6. US6 → painel mensal
7. US7 → lançamento rápido no celular
8. Polish → endurecimento, documentação e validação final

### Parallel Team Strategy

Com várias pessoas, após Foundational:

1. Pessoa A: backend de US1, depois US2 e US3
2. Pessoa B: telas web e mobile de US1, depois das demais, a partir do contrato gerado
3. Pessoa C: `packages/utils` (Money e parcelas) e os vetores de teste, depois US4 e US5 no backend

---

## Notes

- [P] = arquivos diferentes e sem dependência de tarefa incompleta
- [Story] liga a tarefa à história de usuário para rastreabilidade
- Confirmar que os testes falham antes de implementar (Princípio IV)
- Os commits seguem a regra da constituição: limpos, sem co-autoria nem menção a ferramentas de IA
- Evitar: tarefas vagas, conflitos no mesmo arquivo, dependências entre histórias não listadas acima

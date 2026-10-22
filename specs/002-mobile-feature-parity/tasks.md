---
description: "Lista de tarefas da feature Paridade de funcionalidades nos aplicativos Android e iOS"
---

# Tasks: Paridade de funcionalidades nos aplicativos Android e iOS

**Input**: Documentos de design em `/specs/002-mobile-feature-parity/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi-delta.md, quickstart.md

**Tests**: Pela constituição (Princípio IV, Test-First), os testes são **obrigatórios** para regras de cálculo, endpoints e repositórios (Testcontainers + PostgreSQL) e isolamento de dados. Nesta feature, também são obrigatórios para a lógica do aplicativo (cache, fila, sincronização, bloqueio, lembretes) e há E2E por história. Em cada história, os testes são escritos **antes** da implementação e devem falhar primeiro (tarefas marcadas `[Teste]`).

**Organization**: Tarefas agrupadas por história de usuário (P1 a P9). Cada história tem um teste independente e entrega valor verificável.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: história a que pertence (US1 a US9); fases de Setup, Foundational e Polish não têm rótulo
- Todo caminho é relativo à raiz do repositório

## Path Conventions

- Backend: `apps/api-server/src/main/java/com/jvtech/gefinc/<módulo>/` e `apps/api-server/src/test/java/com/jvtech/gefinc/<módulo>/`
- Migrações: `apps/api-server/src/main/resources/db/migration/`
- Telas e serviços compartilhados: `packages/ui-shared/src/lib/<área>/`; cálculos: `packages/utils/src/lib/`
- Web: `apps/web-app/src/app/`; Mobile: `apps/mobile-app/src/app/<área>/`; E2E: `apps/web-app-e2e/src/` e `apps/mobile-app-e2e/src/`
- Nenhum app importa código de outro app (Princípio I)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependências, permissões nativas e utilitário de viewport

- [X] T001 Instalar `@capacitor/local-notifications`, `@capacitor/network`, `@aparajita/capacitor-biometric-auth` e `@capacitor-community/privacy-screen` em `package.json`, rodar `npx nx run mobile-app:sync` e conferir que `apps/mobile-app/android/app/capacitor.build.gradle`, `capacitor.settings.gradle` e `apps/mobile-app/ios/App/CapApp-SPM/Package.swift` listam os plugins novos e que `./gradlew assembleDebug` conclui
- [X] T002 [P] Declarar permissões em `apps/mobile-app/android/app/src/main/AndroidManifest.xml` (`POST_NOTIFICATIONS`, `USE_BIOMETRIC`) e criar o ícone de notificação em `apps/mobile-app/android/app/src/main/res/drawable/ic_stat_gefinc.xml`
- [X] T003 [P] Declarar `NSFaceIDUsageDescription` (texto em pt-BR) em `apps/mobile-app/ios/App/App/Info.plist`; sem Mac não há build do iOS, então só conferir o XML
- [X] T004 [P] Escrever o teste de `Viewport` em `packages/ui-shared/src/lib/viewport/viewport.spec.ts` (sinal `compact()` verdadeiro abaixo de 768 px e reagindo a mudanças de `matchMedia`) e vê-lo falhar
- [X] T005 Implementar `packages/ui-shared/src/lib/viewport/viewport.ts` (serviço injetável com `compact()`) e exportá-lo em `packages/ui-shared/src/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend (idempotência e resumo de vencimentos), contrato, API compartilhada e shell mobile. NENHUMA história começa antes desta fase.

- [X] T006 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/idempotency/IdempotencyIT.java` (Testcontainers): repetir a mesma chave em `POST /transaction-groups`, `/pay` e `/unpay` devolve a resposta original com `Idempotent-Replayed: true` e não duplica o efeito; mesma chave com outro corpo ou outro caminho responde 422 `IDEMPOTENCY_KEY_REUSED`; duas requisições simultâneas com a mesma chave (uma responde 409 `IDEMPOTENCY_IN_PROGRESS`); chave de um usuário não afeta outro (isolamento); falha 5xx libera a chave; requisição sem cabeçalho segue como hoje; limpeza apaga chaves com mais de 7 dias; exclusão de conta apaga as chaves; contrato validado com `matchesContract()`; ver falhar
- [X] T007 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/dashboard/DueSummaryIT.java`: contagem por data de despesas pendentes fora de cartão; faturas com saldo restante contadas uma vez na data de vencimento; item de cartão quitado por pagamento de fatura não conta; atrasado (antes de hoje) separado em itens e faturas; itens pagos e receitas ignorados; período inválido ou acima de 62 dias responde 400; isolamento entre usuários; ver falhar
- [X] T008 Criar a migração `apps/api-server/src/main/resources/db/migration/V6__idempotency_keys.sql` (tabela `idempotency_keys` com PK `(user_id, key)`, FK `ON DELETE CASCADE`, `CHECK` em `state`, índice em `created_at`, conforme `data-model.md`)
- [X] T009 Implementar o pacote `apps/api-server/src/main/java/com/jvtech/gefinc/idempotency/` (`IdempotencyKey`, `IdempotencyKeyRepository`, `IdempotencyService`, `IdempotencyFilter` registrado depois da autenticação em `common/security/SecurityConfig.java`, `IdempotencyCleanupJob` diário) e os códigos `IDEMPOTENCY_IN_PROGRESS` (409) e `IDEMPOTENCY_KEY_REUSED` (422) em `common/error/ErrorCode.java`, sem registrar corpo nem chave em logs
- [X] T010 Implementar `apps/api-server/src/main/java/com/jvtech/gefinc/dashboard/DueSummaryService.java`, DTOs e a rota `GET /due-summary` em `DashboardController.java`, reaproveitando as regras de fatura e atrasado do `DashboardService`
- [X] T011 Atualizar o contrato nas duas cópias (`packages/core-models/openapi/gefinc.openapi.yaml` e `specs/001-personal-finance-management/contracts/openapi.yaml`) conforme `specs/002-mobile-feature-parity/contracts/openapi-delta.md`, regenerar os tipos com `npx nx run core-models:generate` e conferir `IdempotencyIT` e `DueSummaryIT` verdes
- [X] T012 [P] Registrar a tabela `idempotency_keys` e a rota `/due-summary` em `specs/001-personal-finance-management/data-model.md` (Princípio V: nova tabela exige atualização do modelo)
- [X] T013 [P] [Teste+Impl] Criar `packages/ui-shared/src/lib/api/due-summary.api.ts` (`DueSummaryApi.get(from, to)`) e aceitar `idempotencyKey` opcional em `create`, `pay` e `unpay` de `packages/ui-shared/src/lib/api/transactions.api.ts`, com testes em `due-summary.api.spec.ts` e `transactions.api.spec.ts` (cabeçalho enviado só quando informado); exportar em `packages/ui-shared/src/lib/api/index.ts`
- [X] T014 [P] Estender `apps/api-server/src/test/java/com/jvtech/gefinc/dashboard/DashboardPerformanceIT.java` com `GET /due-summary` (p95 abaixo de 2 s com 6.000 lançamentos) e conferir que o filtro de idempotência não degrada `POST /transactions/{id}/pay`
- [X] T015 [P] [Teste] Escrever `apps/mobile-app/src/app/shell/mobile-shell.spec.ts`: barra de abas com Painel, Lançamentos, Faturas, Contas e Mais; menu Mais com Fluxo de caixa, Categorias, Minha conta e Sair; aba ativa marcada; área segura inferior respeitada; rotas só para autenticados; ver falhar
- [X] T016 Implementar `apps/mobile-app/src/app/shell/mobile-shell.ts` e `apps/mobile-app/src/app/shell/more.page.ts` e reestruturar `apps/mobile-app/src/app/app.routes.ts` com uma rota-mãe autenticada que usa o shell (filhos preenchidos pelas histórias); manter `quick-expense` e a rota pública de login, cadastro e recuperação
- [X] T017 [P] Adicionar em `apps/mobile-app/src/styles.css` as classes `.gef-tabbar`, `.gef-page` (espaçamento e `env(safe-area-inset-*)`) e `.gef-sheet`; criar `packages/ui-shared/src/lib/layout/sheet.ts` (`gef-sheet`, painel inferior para filtros e formulários) com teste `sheet.spec.ts` escrito antes (abre, fecha com Escape e toque no fundo, foco preso, rótulo acessível)

---

## Phase 3: User Story 1 - Gerenciar contas, cartões e categorias pelo celular (Priority: P1)

**Purpose**: Menu principal funcional, contas, cartões e categorias completos no app

- [ ] T018 [P] [US1] [Teste] Mover (`git mv`) `apps/web-app/src/app/accounts/accounts-page.spec.ts` e `apps/web-app/src/app/categories/categories-page.spec.ts` para `packages/ui-shared/src/lib/accounts/` e `packages/ui-shared/src/lib/categories/` e acrescentar casos de layout compacto (cartões em vez de tabela, ações editar e inativar acessíveis, aviso de recálculo ao mudar dias do cartão, mensagem de inativação em vez de exclusão); ver falhar
- [ ] T019 [P] [US1] [Teste] Criar `apps/mobile-app-e2e/src/support.ts` (cadastro, login e semente de dados pela API, login pela interface do app) e `apps/mobile-app-e2e/src/accounts-categories.spec.ts`: criar conta, cartão (dias inválidos recusados mantendo o digitado), categoria; editar; inativar conta com lançamentos; categoria em uso; ver falhar
- [ ] T020 [US1] Mover `apps/web-app/src/app/accounts/accounts-page.ts` e `account-form.ts` para `packages/ui-shared/src/lib/accounts/` com layout responsivo (tabela no desktop, cartões com `gef-sheet` para o formulário no celular) e exportar em `packages/ui-shared/src/index.ts`
- [ ] T021 [US1] Mover `apps/web-app/src/app/categories/categories-page.ts` para `packages/ui-shared/src/lib/categories/` com layout responsivo e exportar em `packages/ui-shared/src/index.ts`
- [ ] T022 [US1] Garantir nas telas de contas e categorias os avisos e regras exigidos: recálculo apenas de fixos pendentes futuros ao mudar os dias do cartão (FR-006), inativar em vez de excluir conta com lançamentos (FR-005) e reatribuição ao excluir categoria em uso (FR-007)
- [ ] T023 [US1] Ligar as rotas: `apps/web-app/src/app/app.routes.ts` do web passa a importar as telas de `@gefinc/ui-shared`; `apps/mobile-app/src/app/app.routes.ts` do mobile ganha `contas` e `categorias` sob o shell, com entradas na barra de abas e no menu Mais
- [ ] T024 [US1] Executar `npx nx e2e web-app-e2e` (accounts e categories continuam verdes) e `npx nx e2e mobile-app-e2e` (accounts-categories verde); corrigir regressões

---

## Phase 4: User Story 2 - Registrar e acompanhar lançamentos completos pelo celular (Priority: P2)

**Purpose**: Lista, filtros, cadastro dos três tipos, edição, pagamento e exclusão no app, mantendo o lançamento rápido em até 3 toques

- [ ] T025 [P] [US2] [Teste] Mover `apps/web-app/src/app/transactions/transactions-page.spec.ts` e `group-form.spec.ts` para `packages/ui-shared/src/lib/transactions/` e acrescentar casos compactos (filtros em `gef-sheet`, linhas em cartões, prévia das parcelas legível, ações por linha); ver falhar
- [ ] T026 [P] [US2] [Teste] Criar `apps/mobile-app-e2e/src/transactions.spec.ts` (E2E mobile): despesa avulsa, fixa e parcelada em cartão (prévia 33,33 / 33,33 / 33,34), filtros por mês, conta, categoria, tipo e status, pagar e desfazer, alterar valor de fixa a partir de um mês, encerrar, excluir com confirmação e aviso de parcelas pagas, conflito de versão com opção de recarregar, valor menor ou igual a zero preservando o digitado; ver falhar
- [ ] T027 [US2] Mover `apps/web-app/src/app/transactions/transactions-page.ts` para `packages/ui-shared/src/lib/transactions/` com layout responsivo (filtros em `gef-sheet`, linhas em cartões no celular) e aceitar filtros iniciais por parâmetros de rota (`month`, `status`, `date`), usados depois pelos lembretes
- [ ] T028 [US2] Mover `apps/web-app/src/app/transactions/group-form.ts` para `packages/ui-shared/src/lib/transactions/` com layout responsivo e rolagem segura com teclado aberto; exportar ambos em `packages/ui-shared/src/index.ts`
- [ ] T029 [US2] Ligar as rotas de lançamentos no web e no mobile (`lancamentos` sob o shell) e manter `quick-expense` com botão "+ Nova despesa" no Painel, preservando o limite de 3 toques (o E2E `quick-expense.spec.ts` continua verde)
- [ ] T030 [US2] Executar `npx nx e2e web-app-e2e` (transactions) e `npx nx e2e mobile-app-e2e` (transactions e quick-expense); corrigir regressões

---

## Phase 5: User Story 3 - Acompanhar e pagar faturas de cartão pelo celular (Priority: P3)

**Purpose**: Fatura por cartão e mês, pagamentos parcial e total, desfazer e projeção

- [ ] T031 [P] [US3] [Teste] Mover `apps/web-app/src/app/invoices/invoices-page.spec.ts` para `packages/ui-shared/src/lib/invoices/` e acrescentar casos compactos (itens em lista, pagamento em `gef-sheet`, recusa acima do restante, projeção por cartão em cartões); ver falhar
- [ ] T032 [P] [US3] [Teste] Criar `apps/mobile-app-e2e/src/invoices.spec.ts` (E2E mobile): pagar R$ 30 de R$ 100, recusar R$ 80, quitar o restante, desfazer pagamento, abrir projeção; ver falhar
- [ ] T033 [US3] Mover `apps/web-app/src/app/invoices/invoices-page.ts` para `packages/ui-shared/src/lib/invoices/` com layout responsivo e exportar em `packages/ui-shared/src/index.ts`
- [ ] T034 [US3] Ligar as rotas de faturas no web e no mobile (`faturas` sob o shell) e executar `npx nx e2e web-app-e2e` e `npx nx e2e mobile-app-e2e` (invoices)

---

## Phase 6: User Story 4 - Ver o painel e o fluxo de caixa pelo celular (Priority: P4)

**Purpose**: Painel com gráficos legíveis em tela pequena, navegação entre meses e fluxo de caixa; o Painel vira a tela inicial do app

- [ ] T035 [P] [US4] [Teste] Mover `apps/web-app/src/app/dashboard/dashboard-page.spec.ts` e `apps/web-app/src/app/invoices/cashflow-page.spec.ts` para `packages/ui-shared/src/lib/dashboard/` e `packages/ui-shared/src/lib/invoices/` e acrescentar casos compactos (indicadores em grade de 2 colunas, gráficos com legenda legível, estado vazio com atalho para criar lançamento); ver falhar
- [ ] T036 [P] [US4] [Teste] Criar `apps/mobile-app-e2e/src/dashboard-cashflow.spec.ts` (E2E mobile): comparar cada indicador, gráfico e linha do fluxo de caixa com a resposta da API para o mesmo mês (SC-002), trocar de mês, estado vazio, atualização imediata depois de criar e pagar; ver falhar
- [ ] T037 [US4] Mover `apps/web-app/src/app/dashboard/dashboard-page.ts` e `apps/web-app/src/app/invoices/cashflow-page.ts` para `packages/ui-shared/src/lib/dashboard/` e `packages/ui-shared/src/lib/invoices/` com layout responsivo e gráficos adaptados (`packages/ui-shared/src/lib/charts/`); exportar em `packages/ui-shared/src/index.ts`
- [ ] T038 [US4] Substituir `apps/mobile-app/src/app/home/home.page.ts` pela tela de Painel de `ui-shared` como tela inicial do mobile, mantendo o botão "+ Nova despesa" (`.gef-fab`) e adicionando `fluxo-de-caixa` ao menu Mais; remover o código antigo da home
- [ ] T039 [US4] Executar `npx nx e2e web-app-e2e` (invoices-dashboard) e `npx nx e2e mobile-app-e2e` (dashboard-cashflow e quick-expense)

---

## Phase 7: User Story 5 - Recuperar o acesso e gerenciar a própria conta pelo celular (Priority: P5)

**Purpose**: Minha conta: sair, exclusão com carência, cancelamento ao entrar e recuperação de senha

- [ ] T040 [P] [US5] [Teste] Escrever `apps/mobile-app/src/app/settings/settings.page.spec.ts`: sair encerra a sessão e limpa o armazenamento seguro, exclusão exige a senha e mostra a data limite, erros em português; e estender `apps/mobile-app/src/app/auth/auth-pages.spec.ts` para recuperação de senha (mesma resposta para e-mail cadastrado ou não e aviso do limite) e para a entrada com exclusão pendente (423 oferece cancelar); ver falhar
- [ ] T041 [P] [US5] [Teste] Criar `apps/mobile-app-e2e/src/account.spec.ts` (E2E mobile): pedir recuperação de senha, solicitar exclusão com senha, entrar de novo dentro da carência e cancelar, sair; ver falhar
- [ ] T042 [US5] Implementar `apps/mobile-app/src/app/settings/settings.page.ts` (Minha conta) com Sair (usando `core/logout.ts`) e a exclusão de conta (`DeleteAccount` de `@gefinc/ui-shared`), deixando as seções de bloqueio e lembretes para as histórias US8 e US9; ligar a rota `minha-conta`
- [ ] T043 [US5] Garantir no app o fluxo de entrada com exclusão pendente e a mensagem que explica que o link de redefinição de senha enviado por e-mail abre no navegador (`apps/mobile-app/src/app/auth/auth-pages.ts`)
- [ ] T044 [US5] Executar `npx nx e2e mobile-app-e2e` (account) e `npx nx test mobile-app`

---

## Phase 8: User Story 6 - Usar o aplicativo com conforto e segurança em qualquer aparelho (Priority: P6)

**Purpose**: Áreas seguras, teclado, alvos de toque, acessibilidade e preservação do digitado em todas as telas

- [ ] T045 [P] [US6] [Teste] Criar `apps/mobile-app-e2e/src/comfort.spec.ts` (E2E mobile, viewports 360x640 e Pixel 7): para cada rota do app sem rolagem horizontal, alvos de toque com pelo menos 44x44 px, nenhum controle sob a barra de abas ou a área segura, campo em edição visível com o teclado simulado, `@axe-core/playwright` sem violações A e AA; ver falhar
- [ ] T046 [P] [US6] [Teste] Estender os testes dos formulários migrados em `packages/ui-shared/src/lib/` (`accounts`, `categories`, `transactions`, `invoices`) para falha de rede ou validação preservando o digitado (`draft.service`) e toque duplo em Salvar ou Pagar registrando uma única vez; ver falhar
- [ ] T047 [US6] Ajustar as telas migradas e o shell: `min-h-11` em `.gef-btn-*` e links de ação (`packages/ui-shared/src/styles/theme.css`), `pb-[env(safe-area-inset-bottom)]` em listas e formulários, rolagem até o campo focado, rótulos acessíveis (`aria-label`) nos controles só com ícone
- [ ] T048 [US6] Aplicar bloqueio de reenvio (`busy`) e rascunho (`DraftService`) nos formulários que ainda não os usam, conferir estados de carregamento, vazio e erro em todas as telas (FR-022) e rodar `npx nx e2e mobile-app-e2e`

---

## Phase 9: User Story 7 - Usar o aplicativo sem internet (Priority: P7)

**Purpose**: Cache cifrado de leitura, fila durável de três operações, sincronização idempotente e avisos

- [ ] T049 [P] [US7] [Teste] Escrever `apps/mobile-app/src/app/offline/cache-crypto.spec.ts`: AES-GCM com vetor novo a cada gravação, dado adulterado falha, chave guardada no armazenamento seguro e recriada se faltar (cache apagado); ver falhar
- [ ] T050 [P] [US7] [Teste] Escrever `apps/mobile-app/src/app/offline/cache-store.spec.ts`: chave por usuário e URL com parâmetros ordenados, limite de 20 MB descartando os mais antigos, limpeza total e por usuário; ver falhar
- [ ] T051 [P] [US7] [Teste] Escrever `apps/mobile-app/src/app/offline/pending-queue.spec.ts`: ordem, estados `PENDING`, `SENDING`, `REJECTED`, persistência cifrada entre reinícios, descarte, reenvio com a mesma chave só se o corpo não mudou; ver falhar
- [ ] T052 [P] [US7] [Teste] Escrever `apps/mobile-app/src/app/offline/overlay.spec.ts`: aplicar operações pendentes sobre a lista em cache (novo lançamento avulso, fixo e parcelado calculados por `packages/utils`, pagar e desfazer), item pendente de envio não pode ser pago, editado nem excluído; ver falhar
- [ ] T053 [P] [US7] [Teste] Escrever `apps/mobile-app/src/app/offline/sync-engine.spec.ts`: envio sequencial na ordem, parada no primeiro erro de rede, 4xx marca `REJECTED` com a mensagem, 401 renova a sessão, 429 e 5xx com espera crescente, `Idempotency-Key` igual em reenvios, gatilhos (rede voltou, app voltou ao primeiro plano, botão); ver falhar
- [ ] T054 [P] [US7] [Teste] Escrever `apps/mobile-app/src/app/offline/offline.interceptor.spec.ts`: GET rede primeiro, falha de rede responde do cache com data da sincronização, só os três POST permitidos entram na fila (resposta 202 sintética), demais ações devolvem o erro `OFFLINE_REQUIRES_CONNECTION` com mensagem em português; ver falhar
- [ ] T055 [P] [US7] [Teste] Escrever `apps/mobile-app/src/app/core/logout.spec.ts` (ampliado): sair, sessão revogada e exclusão de conta apagam cache, fila, preferências e avisos agendados; com operações pendentes pede confirmação antes; ver falhar
- [ ] T056 [P] [US7] [Teste] Criar `apps/mobile-app-e2e/src/offline.spec.ts` (E2E mobile com `context.setOffline`): consultar painel, lançamentos e faturas sem conexão com o aviso da data; registrar despesa e pagar item; ver "pendente de envio"; reconectar e conferir uma única ocorrência no servidor; envio interrompido e repetido sem duplicar; recusa com motivo; ação que exige conexão; ver falhar
- [ ] T057 [US7] Implementar `apps/mobile-app/src/app/offline/cache-crypto.ts` (WebCrypto AES-GCM, chave no `SecureStorage`) e `apps/mobile-app/src/app/offline/cache-store.ts` (IndexedDB `gefinc-cache`)
- [ ] T058 [US7] Implementar `apps/mobile-app/src/app/offline/pending-queue.ts` (Capacitor Preferences, cifrada) e `apps/mobile-app/src/app/offline/overlay.ts` (reaproveita `scheduleInstallments` e `invoiceDueDate` de `@gefinc/utils`)
- [ ] T059 [US7] Implementar `apps/mobile-app/src/app/offline/network-status.ts` (`@capacitor/network` e retorno ao primeiro plano via `@capacitor/app`) e `apps/mobile-app/src/app/offline/sync-engine.ts`
- [ ] T060 [US7] Implementar `apps/mobile-app/src/app/offline/offline.interceptor.ts` e registrá-lo em `apps/mobile-app/src/app/app.config.ts`; acrescentar o código `OFFLINE_REQUIRES_CONNECTION` e a mensagem em `packages/ui-shared/src/lib/api/problem.ts`
- [ ] T061 [US7] Criar um ponto de extensão opcional em `packages/ui-shared/src/lib/transactions/transactions-page.ts` (token de injeção `PENDING_MARKER`) para marcar linhas como "pendente de envio" e desabilitar ações, fornecido só pelo mobile
- [ ] T062 [US7] Implementar `apps/mobile-app/src/app/offline/offline-banner.ts` (data e hora da última sincronização, aviso de que painel, faturas e fluxo de caixa não incluem pendentes, botão "Sincronizar agora") e `apps/mobile-app/src/app/offline/pending-list.page.ts` (pendentes e recusadas com motivo, corrigir ou descartar); ligar no shell e em Minha conta
- [ ] T063 [US7] Ampliar `apps/mobile-app/src/app/core/logout.ts` para apagar cache, fila, preferências e avisos e confirmar quando houver operações pendentes (FR-033); ajustar `apps/mobile-app/src/app/quick-expense/quick-expense.page.ts` para informar "salvo no aparelho, será enviado quando houver conexão"
- [ ] T064 [US7] Executar `npx nx test mobile-app`, `npx nx e2e mobile-app-e2e` (offline) e conferir que web e backend seguem verdes

---

## Phase 10: User Story 8 - Desbloquear o aplicativo com biometria (Priority: P8)

**Purpose**: Bloqueio opcional por biometria, alternativa por senha e conteúdo oculto em apps recentes

- [ ] T065 [P] [US8] [Teste] Escrever `apps/mobile-app/src/app/lock/app-lock.service.spec.ts`: padrão desligado, bloquear quando o tempo em segundo plano passa de 0, 1 ou 5 minutos, desbloquear com sucesso, falhas repetidas oferecem a senha, biometria indisponível ou removida desliga o bloqueio e pede senha, ativar exige confirmar a biometria, preferências por usuário; ver falhar
- [ ] T066 [P] [US8] [Teste] Escrever `apps/mobile-app/src/app/lock/lock-screen.spec.ts`: cobre todo o conteúdo, tenta a biometria ao aparecer, botões "Tentar de novo" e "Entrar com senha" (encerra a sessão, com confirmação se houver pendentes); ver falhar
- [ ] T067 [P] [US8] [Teste] Criar `apps/mobile-app-e2e/src/support/native-doubles.ts` (dublês de biometria, rede e notificações injetados pelo teste) e `apps/mobile-app-e2e/src/lock.spec.ts` (E2E mobile): ativar em Minha conta, segundo plano além do tempo, bloqueio, desbloqueio, recusa e alternativa de senha, indisponível; ver falhar
- [ ] T068 [US8] Implementar `apps/mobile-app/src/app/lock/app-lock.service.ts` (`@aparajita/capacitor-biometric-auth`, `@capacitor/app` para segundo plano e primeiro plano, preferências em Capacitor Preferences por usuário)
- [ ] T069 [US8] Implementar `apps/mobile-app/src/app/lock/lock-screen.ts` e integrá-la em `apps/mobile-app/src/app/app.ts` por cima de todo o conteúdo; implementar `apps/mobile-app/src/app/lock/privacy.ts` (`@capacitor-community/privacy-screen` ligado enquanto o bloqueio estiver ativo)
- [ ] T070 [US8] Acrescentar em `apps/mobile-app/src/app/settings/settings.page.ts` a seção de bloqueio (ligar e desligar, tempo, mensagem de indisponibilidade com como habilitar no aparelho, aviso de que no Android a captura de tela fica bloqueada); a exclusão de conta continua exigindo a senha (FR-037)
- [ ] T071 [US8] Executar `npx nx test mobile-app` e `npx nx e2e mobile-app-e2e` (lock)

---

## Phase 11: User Story 9 - Receber lembretes de vencimento (Priority: P9)

**Purpose**: Planejamento puro dos avisos, agendamento local, preferências e toque que abre a lista

- [ ] T072 [P] [US9] [Teste] Escrever `packages/utils/src/lib/reminders.spec.ts` para `planReminders`: horizonte de 14 dias, "vencem amanhã" na véspera e "vencem hoje" no dia no horário escolhido, resumo diário de atrasados por até 7 dias, tipos desligados não geram aviso, no máximo 35 avisos, ids determinísticos `AAAAMMDD*10+tipo`, singular e plural, texto sem valores nem nomes, virada de mês e de ano; ver falhar
- [ ] T073 [P] [US9] [Teste] Escrever `apps/mobile-app/src/app/reminders/reminders.service.spec.ts`: pedir permissão só ao ativar, permissão negada explica como liberar, cancelar tudo e reagendar, reagendar ao abrir, sincronizar, pagar ou desfazer e mudar preferências, toque no aviso navega para `/lancamentos` com os filtros; ver falhar
- [ ] T074 [P] [US9] [Teste] Criar `apps/mobile-app-e2e/src/reminders.spec.ts` (E2E mobile com dublê de notificações): ativar lembretes, avisos agendados para o que vence amanhã, pagar o item remove o aviso, desligar um tipo, permissão negada; ver falhar
- [ ] T075 [US9] Implementar `packages/utils/src/lib/reminders.ts` (`planReminders`) e exportar em `packages/utils/src/index.ts`
- [ ] T076 [US9] Implementar `apps/mobile-app/src/app/reminders/reminders.service.ts` (`@capacitor/local-notifications`, `DueSummaryApi`, reagendamento total com ids determinísticos e canal de notificação no Android) e ligá-lo ao `SyncEngine`, à abertura do app e às ações de pagar e desfazer
- [ ] T077 [US9] Tratar o toque no aviso (`localNotificationActionPerformed`) abrindo `/lancamentos` com `status=PENDING` e a data; acrescentar em `apps/mobile-app/src/app/settings/settings.page.ts` a seção de lembretes (tipos, horário, estado da permissão) e persistir as preferências
- [ ] T078 [US9] Executar `npx nx test utils`, `npx nx test mobile-app` e `npx nx e2e mobile-app-e2e` (reminders)

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Documentação, desempenho, aparelho real e verificação final

- [ ] T079 [P] Atualizar `README.md` (escopo do app: todas as funções do web, offline, biometria e lembretes; como gerar e instalar o APK) e `docs/operations.md` (retenção de 7 dias das chaves de idempotência, limites dos lembretes locais, `FLAG_SECURE` bloqueando capturas, dados locais cifrados e apagados ao sair)
- [ ] T080 [P] Medir SC-005 e SC-011 no perfil Pixel 7 com 6.000 lançamentos (painel, lista e faturas, online e do cache) em `apps/mobile-app-e2e/src/performance.spec.ts` e ajustar paginação ou carregamento se passar de 2 s
- [ ] T081 [P] Criar o roteiro de fumaça em aparelho `apps/mobile-app-e2e/device/android-smoke.cjs` (login, offline com modo avião via `adb shell cmd connectivity airplane-mode`, lembrete agendado conferido por `adb shell dumpsys notification`, bloqueio) e documentá-lo no `quickstart.md`
- [ ] T082 Rodar `npx nx run-many -t lint test build --skip-nx-cache`, `cd apps/api-server && DB_PORT=5433 ./mvnw test`, `npx nx e2e web-app-e2e` e `npx nx e2e mobile-app-e2e`; tudo verde
- [ ] T083 Executar o roteiro do `quickstart.md` no Galaxy S21 (instalar o APK, perfil de paridade, offline, lembrete agendado; a confirmação da digital é manual) e registrar os resultados e os problemas achados
- [ ] T084 Rodar `npx nx run mobile-app:sync` para o iOS, conferir `Package.swift` e `Info.plist` e registrar em `docs/operations.md` que o build e a verificação em iPhone dependem de um Mac (pendência conhecida)
- [ ] T085 Conferir a spec (FR-001 a FR-041 e SC-001 a SC-013) contra o que foi entregue e atualizar `specs/002-mobile-feature-parity/tasks.md` com notas de implementação

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)** → **Foundational (Fase 2)** → histórias → **Polish (Fase 12)**.
- A Fase 2 bloqueia todas as histórias: o contrato e a API compartilhada (T011–T013) e o shell mobile (T015–T017) são usados por todas.

### User Story Dependencies

- **US1 (P1)**: depende só da Fase 2.
- **US2 (P2)**: depende de US1 (contas e categorias existem para lançar).
- **US3 (P3)** e **US4 (P4)**: dependem de US2 (lançamentos); US3 e US4 podem andar em paralelo entre si.
- **US5 (P5)**: depende da Fase 2; fornece a tela Minha conta usada por US8 e US9.
- **US6 (P6)**: auditoria transversal; roda depois de US1 a US4 (as telas migradas) e é reexecutada ao final.
- **US7 (P7)**: depende de US2 (lista e cadastro) e de US5 (saída da conta e limpeza).
- **US8 (P8)**: depende de US5 (Minha conta) e do armazenamento de preferências; reaproveita a confirmação de pendências de US7.
- **US9 (P9)**: depende de US2 (filtros por rota), US5 (Minha conta) e US7 (gatilho de sincronização).

### Within Each User Story

- Testes `[Teste]` primeiro, vistos falhando; depois modelos e serviços; depois telas e rotas; por fim a verificação E2E da história.
- Mover tela (`git mv`) e ajustar a rota do web no mesmo passo para o web não quebrar; o E2E do web da área precisa continuar verde antes de seguir.

### Parallel Opportunities

- Fase 1: T002, T003 e T004 juntas.
- Fase 2: T006 e T007 (testes de backend), T012, T013, T014, T015 e T017 em paralelo (arquivos distintos).
- US7: todos os testes `[Teste]` (T049–T056) em paralelo.
- US8 e US9 podem andar em paralelo depois de US5 e US7.

## Implementation Strategy

### MVP First

1. Fases 1 e 2 (backend de idempotência e resumo, contrato, shell).
2. **US1** (contas, cartões e categorias): já permite começar a usar o app sem o web.
3. **US2** (lançamentos): uso diário completo. Parar e validar no Galaxy S21.

### Incremental Delivery

US3 → US4 → US5 → US6 entregam a paridade completa com o web. US7, US8 e US9 acrescentam o que é próprio do celular. Cada história termina com E2E verde (web e mobile) e pode ser demonstrada sozinha.

### Notas de risco

- iOS não tem build nem verificação nesta máquina (sem Mac); só o código compartilhado e a sincronização de projeto são validados.
- A confirmação da digital e a entrega real da notificação dependem de ação manual no aparelho.

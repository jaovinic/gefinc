---
description: "Lista de tarefas da feature Contas PF/PJ, cartões vinculados com ícone, receita no app e nova identidade visual"
---

# Tasks: Contas PF/PJ, cartões vinculados com ícone, receita no app e nova identidade visual

**Input**: Documentos de design em `/specs/003-bank-accounts-ui-redesign/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi-delta.md, quickstart.md

**Tests**: Pela constituição (Princípio IV, Test-First), os testes são **obrigatórios** para regras de negócio, endpoints e repositórios (Testcontainers + PostgreSQL), isolamento de dados e migração. Aqui também são obrigatórios para os componentes novos (ícone, logo, selo, seletor, menu lateral, toast) e há E2E por história, mais auditorias de identidade e de conforto. Em cada história, os testes são escritos **antes** da implementação e devem falhar primeiro (tarefas `[Teste]`).

**Organization**: Tarefas agrupadas por história de usuário (P1 a P5). Cada história tem um teste independente e entrega valor verificável.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: história a que pertence (US1 a US5); fases de Setup, Foundational e Polish não têm rótulo
- Todo caminho é relativo à raiz do repositório

## Path Conventions

- Backend: `apps/api-server/src/main/java/com/jvtech/gefinc/<módulo>/` e `apps/api-server/src/test/java/com/jvtech/gefinc/<módulo>/`; migrações em `apps/api-server/src/main/resources/db/migration/`
- Telas e serviços compartilhados: `packages/ui-shared/src/lib/<área>/`; cálculos: `packages/utils/src/lib/`; tipos: `packages/core-models/`
- Web: `apps/web-app/src/app/`; Mobile: `apps/mobile-app/src/app/<área>/`; E2E: `apps/web-app-e2e/src/` e `apps/mobile-app-e2e/src/`
- Marca: `packages/ui-shared/src/brand/` (SVG-fonte) e `tools/brand/` (gerador)
- Nenhum app importa código de outro app (Princípio I)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Marca em SVG, script de geração dos arquivos da marca e utilitário de ícone padrão

- [X] T001 [P] Criar o SVG-fonte do símbolo `packages/ui-shared/src/brand/gefinc-symbol.svg` (hexágono com casa, seta de crescimento a 45° e três barras escalonadas, gradiente `#00E599`→`#00B4D8`, grid 8x8 do manual) e `packages/ui-shared/src/brand/gefinc-wordmark.svg` (símbolo + "GEFINC" em Plus Jakarta Sans 800, versão para fundo escuro)
- [X] T002 [P] Criar `tools/brand/ico.mjs` (escritor mínimo de `.ico` com PNGs embutidos) com teste `tools/brand/ico.test.mjs` (`node --test`: cabeçalho, quantidade e tamanhos das imagens) escrito antes; acrescentar os scripts `brand:generate` e `brand:test` em `package.json`
- [X] T003 [P] [Teste] Escrever `packages/utils/src/lib/account-icons.spec.ts` para `defaultIconFor(type, holderType)`: `CHECKING`+PF → `bank`, `CHECKING`+PJ → `building`, `CASH` → `cash`, `CREDIT_CARD` → `card`, titular ausente em conta bancária → `bank`; ver falhar
- [X] T004 Implementar `packages/utils/src/lib/account-icons.ts` (`defaultIconFor`) e exportar em `packages/utils/src/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Banco, API e contrato; tipos; ícones, logo e itens de navegação compartilhados. NENHUMA história começa antes desta fase.

- [X] T005 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/account/AccountHolderIT.java` (Testcontainers): conta `CHECKING` exige `holderType` (PF/PJ) com erro no campo; `CASH` e `CREDIT_CARD` com `holderType` são recusados; `icon` escolhido é gravado e devolvido; sem `icon` a resposta traz o padrão do tipo (`bank`, `building`, `cash`, `card`); ícone fora do catálogo responde 422; alterar o titular de PF para PJ; contrato validado com `matchesContract()`; ver falhar
- [X] T006 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/account/CardBankLinkIT.java`: criar cartão sem `bankAccountId` responde 422 no campo; vínculo com conta de outro usuário responde 404 (isolamento); com conta que não é `CHECKING` ou inativa responde 422; resposta do cartão traz `bankAccountId`, `bankAccountName` e `holderType` herdado; trocar o vínculo não altera lançamentos, faturas nem vencimentos; editar cartão antigo sem vínculo exige o vínculo, mas inativar sozinho é permitido; excluir conta bancária com cartões vinculados responde 409 `ACCOUNT_IN_USE` e inativar é permitido; ver falhar
- [X] T007 [P] [Teste] Escrever `apps/api-server/src/test/java/com/jvtech/gefinc/account/AccountMigrationV7IT.java`: migrar até a V6 com a API do Flyway, inserir contas antigas (bancária, dinheiro, cartão), migrar até a última; a bancária vira PF, as demais ficam sem titular, cartão antigo segue sem vínculo, `icon` nulo, e os `CHECK` e a FK composta passam a valer; ver falhar
- [X] T008 Criar a migração `apps/api-server/src/main/resources/db/migration/V7__account_holder_icon_and_card_bank.sql` (colunas `holder_type`, `icon`, `bank_account_id`; preenchimento PF; `CHECK`s de titular, vínculo e ícone; FK composta `(bank_account_id, user_id)`; índice `ix_accounts_bank`), conforme `data-model.md`
- [X] T009 Implementar no módulo `apps/api-server/src/main/java/com/jvtech/gefinc/account/`: enums `HolderType` e `AccountIcon`, colunas em `Account`, campos novos em `AccountDtos` (entrada, atualização e resposta com ícone padrão, `bankAccountName` e `holderType` herdado) e as regras de titular, ícone e vínculo em `AccountService`/`AccountRepository`; `toString()` redigido nos DTOs novos
- [X] T010 Atualizar o contrato nas duas cópias (`packages/core-models/openapi/gefinc.openapi.yaml` e `specs/001-personal-finance-management/contracts/openapi.yaml`) conforme `specs/003-bank-accounts-ui-redesign/contracts/openapi-delta.md`, regenerar os tipos (`npx nx run core-models:generate`), exportar `HolderType`, `AccountIcon`, `HOLDER_TYPES` e `ACCOUNT_ICONS` em `packages/core-models/src/lib/models.ts` e conferir `AccountHolderIT`, `CardBankLinkIT` e `AccountMigrationV7IT` verdes
- [X] T011 [P] Registrar as colunas novas de `accounts` e a migração V7 em `specs/001-personal-finance-management/data-model.md`
- [X] T012 [P] [Teste] Escrever `packages/ui-shared/src/lib/icons/icon-set.spec.ts`: toda chave de `ACCOUNT_ICONS` e todas as chaves de navegação, ações e status têm desenho (caminho SVG não vazio); chave desconhecida cai no ícone padrão; `gef-icon` expõe `aria-hidden` sem rótulo e `role="img"` com `label`; ver falhar
- [X] T013 Implementar `packages/ui-shared/src/lib/icons/icon-set.ts` (catálogo de desenhos: contas, navegação, ações, natureza e status) e `packages/ui-shared/src/lib/icons/icon.ts` (`gef-icon`, entradas `name`, `size`, `label`), exportando em `packages/ui-shared/src/index.ts`
- [X] T014 [P] [Teste] Escrever `packages/ui-shared/src/lib/brand/logo.spec.ts`: `gef-logo` mostra o símbolo com rótulo "GEFINC" e, na variante com nome, o nome visível; tamanhos configuráveis; ver falhar
- [X] T015 Implementar `packages/ui-shared/src/lib/brand/logo.ts` (`gef-logo`, variantes símbolo e símbolo + nome, com o desenho do `gefinc-symbol.svg` embutido) e exportar
- [X] T016 [P] [Teste] Escrever `packages/ui-shared/src/lib/nav/nav-items.spec.ts`: lista única com Painel, Lançamentos, Faturas, Fluxo de caixa, Contas e cartões, Categorias e Minha conta, cada um com ícone e rotas do web e do app; ver falhar
- [X] T017 Implementar `packages/ui-shared/src/lib/nav/nav-items.ts` (`NAV_ITEMS`) e exportar
- [X] T018 [P] Estender `apps/api-server/src/test/java/com/jvtech/gefinc/dashboard/DashboardPerformanceIT.java` para conferir que `GET /accounts` com os campos novos mantém p95 abaixo de 2 s com 6.000 lançamentos
- [X] T019 Atualizar as fixtures e os testes existentes que criam contas bancárias e cartões sem os campos novos (conta `CHECKING` passa a enviar `holderType: "PF"`; cartão passa a enviar `bankAccountId` de uma conta bancária criada antes): `apps/api-server/src/test/java/com/jvtech/gefinc/support/TestApi.java` e os ITs que criam contas (`AccountApiIT`, `AccountIsolationIT`, `TransactionValidationIT`, `CardDaysChangeIT`, `FixedRecurrenceJobIT`, `InvoiceProjectionIT`, `InvoicePaymentIT`, `DashboardPerformanceIT`), `apps/web-app-e2e/src/support.ts` e as specs E2E de web e mobile com `prepareUser`/criação de conta (`accounts`, `transactions`, `invoices-dashboard`, `accessibility`, `quick-expense`, `invoices`, `offline`, `comfort`, `performance`, `dashboard-cashflow`, `accounts-categories`), `packages/ui-shared/src/testing/testbed.ts`, `apps/mobile-app/src/test/testbed.ts` e os mocks de conta dos specs de `ui-shared` e `mobile-app`; ao final, todos os testes **existentes** passam com o contrato novo antes de qualquer história começar

---

## Phase 3: User Story 1 - Cadastrar contas bancárias de pessoa física e jurídica (Priority: P1)

**Purpose**: Tipo de titular PF/PJ, ícone, selo, filtro e tratamento de contas antigas

- [X] T020 [P] [US1] [Teste] Escrever `packages/ui-shared/src/lib/accounts/account-badge.spec.ts`: o selo mostra ícone e nome, o selo PF ou PJ quando informado, ícone padrão quando a conta não tem ícone (cópia local antiga) e nome longo cortado com o texto completo em `title`; ver falhar
- [X] T021 [P] [US1] [Teste] Escrever `packages/ui-shared/src/lib/accounts/icon-picker.spec.ts`: grade de ícones do catálogo com rótulos acessíveis, seleção por toque e por teclado (setas e Enter), valor inicial marcado, funciona como campo de formulário; ver falhar
- [X] T022 [P] [US1] [Teste] Criar `packages/ui-shared/src/lib/accounts/account-form.spec.ts` e estender `packages/ui-shared/src/lib/accounts/accounts-page.spec.ts`: titular PF/PJ obrigatório em conta bancária (aviso mantendo o digitado), ícone escolhido enviado, dinheiro sem titular, selo PF/PJ e ícone na lista (tabela e cartões), filtro PF/PJ/todas escondido quando só há um tipo, conta antiga sem titular aparece como PF e pode virar PJ; ver falhar
- [X] T023 [P] [US1] [Teste] Criar `apps/web-app-e2e/src/accounts-pf-pj.spec.ts` (E2E web): cadastrar conta PF e PJ com ícones, filtrar, alterar o titular, inativar; e `apps/mobile-app-e2e/src/accounts-pf-pj.spec.ts` (E2E mobile) com o mesmo roteiro em viewport de celular; ver falhar
- [X] T024 [US1] Implementar `packages/ui-shared/src/lib/accounts/account-badge.ts` (`gef-account-badge`) e `packages/ui-shared/src/lib/accounts/icon-picker.ts` (`gef-icon-picker`) e exportá-los
- [X] T025 [US1] Tornar `packages/ui-shared/src/lib/api/reference-data.ts` tolerante à cópia local antiga (titular ausente = PF, ícone ausente = padrão do tipo via `defaultIconFor`, cartão sem `bankAccountId`) e acrescentar `account(id)` e `cardsOf(bankAccountId)`
- [X] T026 [US1] Atualizar `packages/ui-shared/src/lib/accounts/account-form.ts` (tipo conta bancária/dinheiro/cartão, titular PF/PJ como escolha visível, `gef-icon-picker`, nome) e `packages/ui-shared/src/lib/accounts/accounts-page.ts` (selo PF/PJ, ícone, filtro PF/PJ/todas, aviso de conta antiga)
- [X] T027 [US1] Executar `npx nx run-many -t lint test --projects=ui-shared,core-models,utils`, o E2E web de contas e o E2E mobile de contas; corrigir regressões

---

## Phase 4: User Story 2 - Cartões vinculados a uma conta bancária, com ícone e nome (Priority: P2)

**Purpose**: Vínculo obrigatório em cartões novos, seletor de conta/cartão com ícone e identificação em todas as telas

- [X] T028 [P] [US2] [Teste] Escrever `packages/ui-shared/src/lib/accounts/account-picker.spec.ts`: campo de formulário que mostra o selecionado com ícone e nome, abre a lista em `gef-sheet`, cada opção mostra ícone, nome, conta vinculada e selo PF/PJ do cartão, operável por teclado, `role="listbox"` com opções rotuladas, contas inativas fora da lista, estado sem contas com atalho; ver falhar
- [X] T029 [P] [US2] [Teste] Estender `packages/ui-shared/src/lib/accounts/account-form.spec.ts` (criado em T022) e `accounts-page.spec.ts` para cartões: conta bancária obrigatória (aviso mantendo o digitado), orientação com atalho quando não há conta bancária, nome sugerido a partir da conta, cartão antigo com o aviso "vincule a uma conta bancária", aviso dos cartões ao inativar uma conta bancária, troca de vínculo; ver falhar
- [X] T030 [P] [US2] [Teste] Estender `packages/ui-shared/src/lib/transactions/group-form.spec.ts`, `transactions-page.spec.ts`, `packages/ui-shared/src/lib/invoices/invoices-page.spec.ts` e `packages/ui-shared/src/lib/dashboard/dashboard-page.spec.ts`: a escolha de conta/cartão usa o seletor com ícone; linhas e cartões de lançamento, faturas, projeção e distribuição por cartão mostram ícone e nome do cartão e a conta vinculada; ver falhar
- [X] T031 [P] [US2] [Teste] Estender `apps/mobile-app/src/app/quick-expense/quick-expense-defaults.service.spec.ts` e criar `apps/mobile-app/src/app/quick-expense/quick-expense.page.spec.ts`: seletor com ícone no registro rápido e conta padrão preservada; ver falhar
- [X] T032 [P] [US2] [Teste] Criar `apps/web-app-e2e/src/cards-linked.spec.ts` (E2E web) e `apps/mobile-app-e2e/src/cards-linked.spec.ts` (E2E mobile): sem conta bancária o cartão orienta a criar uma; criar cartão vinculado com ícone; lançar despesa no cartão e conferir ícone, nome, conta e selo em lançamentos, faturas e painel; trocar o vínculo sem mudar valores; inativar a conta e ler o aviso; ver falhar
- [X] T033 [US2] Implementar `packages/ui-shared/src/lib/accounts/account-picker.ts` (`gef-account-picker`, valor de formulário, usa `gef-sheet`) e exportar
- [X] T034 [US2] Atualizar `packages/ui-shared/src/lib/accounts/account-form.ts` e `accounts-page.ts` para o vínculo do cartão (seletor de conta bancária, nome sugerido, aviso e atalho sem contas, cartão antigo com aviso, aviso ao inativar conta com cartões)
- [X] T035 [US2] Usar `gef-account-picker` e `gef-account-badge` em `packages/ui-shared/src/lib/transactions/group-form.ts`, `transactions-page.ts` (filtro de conta, linhas e cartões), `packages/ui-shared/src/lib/invoices/invoices-page.ts` (seletor de cartão, projeção) e `packages/ui-shared/src/lib/dashboard/dashboard-page.ts` (distribuição por cartão), e em `apps/mobile-app/src/app/quick-expense/quick-expense.page.ts`
- [X] T036 [US2] Executar os testes de `ui-shared` e `mobile-app`, `AccountHolderIT`/`CardBankLinkIT`, os E2E web e mobile de contas e cartões e o E2E existente de lançamentos e faturas; corrigir regressões

---

## Phase 5: User Story 3 - Lançar receitas pelo aplicativo Android e iOS (Priority: P3)

**Purpose**: Registro rápido por natureza (Despesa ou Receita) e natureza como primeiro campo do cadastro completo

> Atualizado em round 3: as tarefas T037 a T041 abaixo foram escritas para dois botões ("Nova despesa" e "Nova receita") lado a lado. A implementação final tem um único botão "Novo lançamento" na tela inicial (`/novo?tipo=despesa|receita`, página `apps/mobile-app/src/app/new-entry/new-entry.page.ts`, que substituiu `quick-expense.page.ts`); o texto original das tarefas foi mantido como histórico.

- [X] T037 [P] [US3] [Teste] Escrever `apps/mobile-app/src/app/home/home.page.spec.ts`: a tela inicial mostra "Nova despesa" e "Nova receita" lado a lado com o mesmo destaque, cada uma com a rota do registro rápido da natureza; ver falhar
- [X] T038 [P] [US3] [Teste] Estender `apps/mobile-app/src/app/quick-expense/quick-expense-defaults.service.spec.ts` e `quick-expense.page.spec.ts`: padrões de conta e categoria **por natureza** (receita sem histórico usa "Salário" ou a primeira categoria de receita), título, rótulos e categorias só da natureza, cor de receita, salvar envia a natureza certa e preserva o digitado em falha; ver falhar
- [X] T039 [P] [US3] [Teste] Estender `packages/ui-shared/src/lib/transactions/group-form.spec.ts`: o seletor segmentado "Receita | Despesa" é o primeiro campo, troca a lista de categorias e zera a categoria escolhida; ver falhar
- [X] T040 [P] [US3] [Teste] Criar `apps/mobile-app-e2e/src/income.spec.ts` (E2E mobile): encontrar "Nova receita" na tela inicial, registrar receita em até 3 toques contando os toques, categorias só de receita, receita sem conexão enviada uma única vez, receita aparece no painel e no fluxo de caixa; ver falhar
- [X] T041 [US3] Implementar `apps/mobile-app/src/app/home/home.page.ts` com as duas ações e `apps/mobile-app/src/app/quick-expense/quick-expense.page.ts` + `quick-expense-defaults.service.ts` por natureza (parâmetro `kind`), ajustando `apps/mobile-app/src/app/app.routes.ts`
- [X] T042 [US3] Trocar a natureza de `<select>` por seletor segmentado no topo de `packages/ui-shared/src/lib/transactions/group-form.ts`
- [X] T043 [US3] Executar `npx nx run-many -t lint test --projects=ui-shared,mobile-app` e o E2E mobile de receita e de despesa rápida (3 toques); corrigir regressões

---

## Phase 6: User Story 4 - Navegação lateral com ícones no web (Priority: P4)

**Purpose**: Barra lateral esquerda com logo, recolher, gaveta em tela estreita e teclado

- [X] T044 [P] [US4] [Teste] Escrever `apps/web-app/src/app/layout/shell.spec.ts`: menu lateral com logo e os itens de `NAV_ITEMS` com ícone e nome, item atual com `aria-current="page"` e destaque não só por cor, recolher mostra só ícones com nome em dica e foco, escolha lembrada em `localStorage` (e funcionando se o armazenamento falhar), abaixo de 1024 px vira gaveta com botão, foco preso, Escape e toque fora fecham, rodapé com Minha conta e Sair; ver falhar
- [X] T045 [P] [US4] [Teste] Escrever `apps/web-app-e2e/src/sidenav.spec.ts` (E2E web): menu em tela larga, navegar por todas as áreas só pelo teclado, recolher e recarregar, janela estreita com gaveta, Sair; ver falhar
- [X] T046 [US4] Estender `packages/ui-shared/src/lib/layout/sheet.ts` com a entrada `side` (`bottom` ou `left`) para servir de gaveta, com teste em `sheet.spec.ts` escrito antes
- [X] T047 [US4] Reescrever `apps/web-app/src/app/layout/shell.ts` como barra lateral esquerda (logo, `NAV_ITEMS`, recolher, rodapé) com gaveta em tela estreita, mantendo o aviso global e o conteúdo; atualizar `apps/web-app/src/app/app.routes.ts` se necessário
- [X] T048 [US4] Executar `npx nx run-many -t lint test --projects=web-app,ui-shared` e todo o E2E web (as buscas por link de menu nos testes existentes passam a usar o menu lateral); corrigir regressões

---

## Phase 7: User Story 5 - Identidade visual Aurora FinTech e experiência melhorada (Priority: P5)

**Purpose**: Arquivos da marca, aplicação do logo, ícones e tokens em todas as telas, estados, toasts, movimento reduzido e auditorias

- [X] T049 [P] [US5] [Teste] Escrever `packages/ui-shared/src/lib/state-views/state-views.spec.ts` estendido: `gef-empty` e `gef-error` com ícone (entrada `icon`), mensagem e ação; `gef-loading` anunciado; ver falhar
- [X] T050 [P] [US5] [Teste] Escrever `packages/ui-shared/src/lib/layout/toast-host.spec.ts` e `packages/ui-shared/src/lib/api/notice.service.spec.ts` estendido: `NoticeService.toast(mensagem, { undo })` mostra confirmação discreta em `role="status"`, some sozinha, aceita Desfazer (executa a ação e fecha) e empilha no máximo 3; ver falhar
- [X] T051 [P] [US5] [Teste] Estender `packages/ui-shared/src/lib/transactions/transactions-page.spec.ts` e `packages/ui-shared/src/lib/invoices/invoices-page.spec.ts`: receita com sinal "+" e despesa com "−" mais ícone de seta, status com ícone (pago, pendente, atrasado) além de texto e cor, pagar um item mostra toast com Desfazer que chama o desfazer do pagamento; ver falhar
- [X] T052 [P] [US5] [Teste] Estender `packages/ui-shared/src/lib/auth/login/login.spec.ts`, `register`, `forgot-password` e `reset-password` e `packages/ui-shared/src/lib/auth/auth-card.ts`: as telas de acesso mostram o `gef-logo`; ver falhar
- [X] T053 [P] [US5] [Teste] Criar `apps/web-app-e2e/src/identity.spec.ts` (E2E web) e `apps/mobile-app-e2e/src/identity.spec.ts` (E2E mobile): cor de fundo `#090D16` e superfícies `#131B2E` calculadas, fonte Plus Jakarta Sans em uso, logo nas telas de acesso e nos shells, `link rel=icon` e `apple-touch-icon` e `manifest` presentes e com arquivos que carregam, com `prefers-reduced-motion` as transições e animações somem; ver falhar
- [X] T054 [P] [US5] [Teste] Estender `apps/web-app-e2e/src/accessibility.spec.ts` (web) e `apps/mobile-app-e2e/src/comfort.spec.ts` (mobile) para as telas novas e para todas as combinações de cor novas (axe AA sem violações) e conferir que receita/despesa e status nunca dependem só da cor; ver falhar
- [X] T055 [US5] Implementar `tools/brand/generate-assets.mjs` (renderiza os SVG no Chromium do Playwright: favicons 16/32/48 e `favicon.ico`, `apple-touch-icon` 180, ícones 192/512 do manifesto, ícones de Android `mipmap-*` com `foreground` adaptável e monocromático, ícone de notificação, `AppIcon-512@2x.png` 1024 do iOS; valida tamanhos e cabeçalhos) e rodar `npm run brand:generate`, versionando os arquivos gerados
- [X] T056 [US5] Aplicar os favicons e o manifesto: `apps/web-app/src/index.html`, `apps/web-app/public/`, `apps/mobile-app/src/index.html`, `apps/mobile-app/public/`, `apps/mobile-app/android/app/src/main/res/` (mipmap, `ic_launcher_foreground`, cor de fundo adaptável, `ic_stat_gefinc.xml` com o símbolo) e `apps/mobile-app/ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- [X] T057 [US5] Consolidar os tokens em `packages/ui-shared/src/styles/theme.css` (paleta do manual, gradiente de marca, estados de foco, `prefers-reduced-motion`, sombras e raios) e ajustar `apps/mobile-app/src/styles.css` para usar os mesmos tokens
- [X] T058 [US5] Implementar `packages/ui-shared/src/lib/state-views/state-views.ts` com ícones, `packages/ui-shared/src/lib/layout/toast-host.ts` + `NoticeService.toast` (nos dois shells e na raiz do app) e usar `gef-logo` em `packages/ui-shared/src/lib/auth/auth-card.ts`, no cabeçalho de `apps/mobile-app/src/app/shell/mobile-shell.ts` e no shell lateral do web
- [X] T059 [US5] Aplicar nas telas a hierarquia visual: sinal, cor e ícone de natureza (receita/despesa) e de status em `transactions-page.ts`, `invoices-page.ts`, `dashboard-page.ts` e `cashflow-page.ts` (em `packages/ui-shared/src/lib/invoices/`), e o toast com Desfazer ao pagar item e ao pagar fatura
- [X] T060 [US5] Revisão de consistência de títulos, espaçamentos, botões, formulários, tabelas, cartões e listas em todas as telas do web (`packages/ui-shared/src/lib/*`) e do app (`apps/mobile-app/src/app/*`), sem remover função existente, com as ações principais ao alcance do polegar no app
- [X] T061 [US5] Executar `npx nx run-many -t lint test build`, todo o E2E web e mobile e `npm run brand:test`; corrigir regressões

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentação, constituição, desempenho, aparelho real e verificação final

- [X] T062 [P] Atualizar `README.md` (menu lateral, contas PF/PJ e cartões vinculados, receita no app, como gerar a marca com `npm run brand:generate`) e `docs/operations.md` (migração V7, cartões antigos sem vínculo, geração e troca do logo)
- [X] T063 [P] Emendar `.specify/memory/constitution.md` (Princípio VI: lançamento rápido de despesa **e de receita** em até 3 toques; navegação lateral no web; versão MINOR com Sync Impact Report) e conferir os modelos em `.specify/templates/`
- [X] T064 [P] Medir SC-009 em `apps/mobile-app-e2e/src/performance.spec.ts` (já existente) com os componentes novos de ícone e seletor (painel, lançamentos e faturas em até 2 s com 6.000 lançamentos, online e do cache)
- [X] T065 Rodar `npx nx run-many -t lint test build --skip-nx-cache`, `cd apps/api-server && DB_PORT=5433 ./mvnw test`, `npx nx e2e web-app-e2e` e `npx nx e2e mobile-app-e2e`; tudo verde
- [X] T066 Gerar o APK, instalar no Galaxy S21 e rodar `apps/mobile-app-e2e/device/android-smoke.cjs` e o roteiro do `quickstart.md` (ícone do app, receita em 3 toques, seletor com ícones, identidade); capturar telas e registrar os achados
- [X] T067 Rodar `npx nx run mobile-app:sync` para o iOS, conferir o `AppIcon` e registrar em `docs/operations.md` que o build em iPhone segue pendente de um Mac
- [X] T068 Conferir a spec (FR-001 a FR-036 e SC-001 a SC-010) contra o que foi entregue e atualizar `specs/003-bank-accounts-ui-redesign/tasks.md` com notas de implementação

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)** → **Foundational (Fase 2)** → histórias → **Polish (Fase 8)**.
- A Fase 2 bloqueia as histórias: banco, API e contrato (T005–T011), ícones, logo e itens de navegação (T012–T017) e a atualização das fixtures existentes (T019).

### User Story Dependencies

- **US1 (P1)**: depende da Fase 2 (colunas, contrato, ícones).
- **US2 (P2)**: depende de US1 (contas bancárias para vincular, badge e seletor de ícone).
- **US3 (P3)**: independente de US1 e US2 no código do app, mas usa o seletor de US2 no registro rápido; pode começar depois de T033.
- **US4 (P4)**: depende só da Fase 2 (`NAV_ITEMS`, `gef-icon`, `gef-logo`).
- **US5 (P5)**: depende das anteriores para aplicar logo, ícones e estados nas telas finais; o gerador da marca (T055) pode começar logo depois da Fase 1.

### Within Each User Story

- Testes `[Teste]` primeiro, vistos falhando; depois modelos e serviços; depois telas e rotas; por fim a verificação E2E da história.

### Parallel Opportunities

- Fase 1: T001, T002 e T003 juntas. Fase 2: T005, T006 e T007 (testes de backend), T012, T014 e T016 (testes de ícone, logo e navegação) em paralelo.
- US1, US2 e US4 podem andar em paralelo depois da Fase 2 (US2 espera os componentes de US1).

## Implementation Strategy

### MVP First

1. Fases 1 e 2 (backend, contrato, ícones, logo).
2. **US1 e US2**: contas PF/PJ e cartões vinculados com ícone, o núcleo funcional pedido. Parar e validar.

### Incremental Delivery

US3 (receita no app) → US4 (menu lateral) → US5 (identidade e UX de ponta a ponta). Cada história termina com E2E verde (web e mobile) e pode ser demonstrada sozinha.

### Notas de risco

- Os arquivos de logo finais não vieram do link compartilhado: a marca é gerada a partir do SVG-fonte e pode ser trocada depois sem mudar as telas.
- iOS continua sem build nem verificação nesta máquina (sem Mac).

## Notas de implementação

- **Verificação final**: `nx run-many -t lint test build` verde (backend 249 testes; utils 57, core-models 2, ui-shared 205, mobile-app 167, web-app 13), E2E web 27/27 e mobile 55/55 (SC-009: painel/lançamentos/faturas entre 80 e 190 ms com 6.000 lançamentos, online e offline), `npm run brand:test` 4/4 e smoke no Galaxy S21 4/4 com o APK novo (ícone, abertura, receita, seletor e formulário conferidos por captura via WebView; capturas nativas ficam bloqueadas pelo `FLAG_SECURE` do bloqueio por biometria).
- **Desvios do planejado**: o ícone de notificação dos lembretes continua sendo o sino monocromático (`ic_stat_gefinc`), por ser o padrão do Android para avisos; o contrato devolve `400` (e não `422`) para ícone fora do catálogo, como já ocorre com `type` inválido; o filtro PF/PJ e os cartões de uma conta são calculados no cliente, sem endpoint novo.
- **Pendente**: build e verificação em iPhone (precisa de um Mac); os arquivos do iOS (`AppIcon` e abertura) foram regenerados e sincronizados.
- **Round 3 (ajustes após revisão)**: seletor de mês no topo do painel e remoção do atalho "Gerenciar contas"; "Saldo geral" em destaque no celular (até 2rem por container query); receita legada em cartão segue a regra de despesa em Editar, Receber e Desfazer; troca de natureza por toque devolve o foco ao valor, por teclado não; saldo inicial negativo ("Negativo (devendo)") no cadastro de conta; saldo atual por conta na tela de Contas; dica de data da receita ("Entra na conta hoje", "Entra na conta na data informada" ou "Fica a receber até ..."); filtro de status em Receita com "A receber" e "Recebidas".

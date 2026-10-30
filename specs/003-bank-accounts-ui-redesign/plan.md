# Implementation Plan: Contas PF/PJ, cartões vinculados com ícone, receita no app e nova identidade visual

**Branch**: `003-bank-accounts-ui-redesign` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-bank-accounts-ui-redesign/spec.md`

## Summary

Cinco entregas ligadas (ver [research.md](./research.md)):

1. **Contas PF/PJ e ícones**: três colunas novas em `accounts` (`holder_type`, `icon`, `bank_account_id`, migração V7), contrato OpenAPI aditivo, filtro PF/PJ no cliente.
2. **Cartão vinculado a conta bancária**: chave estrangeira composta (mesmo usuário), obrigatório para cartões novos no serviço, cartões antigos continuam válidos com aviso; ícone e nome do cartão aparecem em toda tela que mostra conta ou cartão, por um `gef-account-badge` e um `gef-account-picker` (lista com ícone no lugar do `<select>`).
3. **Receita no app**: um único botão "Novo lançamento" na tela inicial que abre a tela onde se escolhe despesa ou receita, registro rápido por natureza, natureza como primeiro campo do cadastro completo; receita só entra em conta (nunca em cartão) e o saldo é por conta, com saldo geral no painel (`GET /balances`).
4. **Menu lateral do web**: barra lateral esquerda com logo e ícones, recolhível (preferência lembrada), gaveta em tela estreita, operável por teclado.
5. **Identidade Aurora FinTech e UX**: logo e conjunto de ícones próprios (SVG), favicons e ícones de Android e iOS gerados por script a partir de um SVG-fonte, tokens e fonte do manual aplicados de ponta a ponta, estados com ícone, toasts com Desfazer, movimento reduzido, não depender só de cor.

## Technical Context

**Language/Version**: Java 21 (backend); TypeScript 5.x, Angular 22 (zoneless, standalone, Signals), Ionic 9, Capacitor 8 (já fixados)
**Primary Dependencies**: nenhuma nova. Reusa Spring Boot 3.5/Flyway, Angular, Tailwind 4, Playwright (também para gerar os PNG da marca) e a fonte Plus Jakarta Sans variável já empacotada (`@fontsource-variable`)
**Storage**: PostgreSQL 16 (colunas novas em `accounts`, migração V7); `localStorage` (menu recolhido, com `try/catch`); Capacitor Preferences (padrões do registro rápido por natureza)
**Testing**: Jest (utils, ui-shared, mobile-app, web-app), JUnit + Testcontainers (backend, incluindo migração com a API do Flyway), Playwright (E2E web e mobile no perfil Pixel 7, `@axe-core/playwright`)
**Target Platform**: web (desktop e tablet), Android 7+ e iOS 15+ (iOS sem build nesta máquina)
**Project Type**: monorepo Nx: API + web + mobile + pacotes compartilhados
**Performance Goals**: painel, lançamentos e faturas em até 2 s com 6.000 lançamentos, online e do cache (SC-009); ícones inline e fonte local, sem requisições extras
**Constraints**: a cópia local antiga (sem campos novos) deve continuar funcionando; contraste AA e "não só cor"; nada de dependência nova de ícones ou de imagem
**Scale/Scope**: 3 colunas e 1 migração, contrato aditivo (3 campos de entrada, 4 de saída, 2 enums), ~40 ícones (16 de conta + navegação, ações e status), 2 componentes de conta (badge e picker), 1 shell novo no web, 1 script de marca

## Constitution Check

*GATE: avaliado antes da pesquisa (Fase 0) e reavaliado após o desenho (Fase 1). Resultado: aprovado, com as adições justificadas em Complexity Tracking.*

- [x] **I. Monorepo**: ícones, badge, picker, logo, toasts e `NAV_ITEMS` em `packages/ui-shared`; tipos novos (`HolderType`, `AccountIcon`) em `core-models` a partir do OpenAPI; shell lateral só em `apps/web-app`; ícones e favicons por script em `tools/brand`
- [x] **II. Financial integrity**: nenhum cálculo muda; trocar o vínculo do cartão não altera vencimento nem fatura (teste dedicado); sinal e cor de receita/despesa só na apresentação, valores continuam pelas funções de `utils`
- [x] **III. Data isolation & auth**: o vínculo usa FK composta `(bank_account_id, user_id)`; teste de isolamento (conta de outro usuário como alvo do vínculo responde 404); nada sensível em logs; nenhum dado novo vai a terceiros
- [x] **IV. Test-first**: ITs de regras e de migração, testes de componentes e E2E escritos antes das implementações (tarefas `[Teste]`)
- [x] **V. Schema**: migração V7 versionada e imutável, `CHECK` de titular, vínculo e ícone, FK composta e índice; `data-model.md` atualizado; `ddl-auto` segue `validate`
- [x] **VI. Platform UX**: web ganha navegação lateral tabular-friendly; mobile mantém registro rápido em até 3 toques e agora para receita também (emenda proposta ao texto do Princípio VI, ver Complexity Tracking); pt-BR com estados de carregamento, vazio e erro
- [x] **VII. Simplicity**: sem dependências novas; ícones próprios em SVG, `localStorage` simples, filtro PF/PJ no cliente; escopo além de RF01–RF03 pedido explicitamente pelo usuário e justificado abaixo

## Project Structure

### Documentation (this feature)

```text
specs/003-bank-accounts-ui-redesign/
├── plan.md              # Este arquivo
├── research.md          # Decisões D1 a D15
├── data-model.md        # Colunas de accounts, regras, preferências locais
├── quickstart.md        # Roteiro de validação
├── contracts/
│   └── openapi-delta.md # Enums e campos novos de Account
└── tasks.md             # Gerado por /speckit-tasks
```

### Source Code (repository root)

```text
apps/api-server/src/main/
├── java/com/jvtech/gefinc/account/   # HolderType, AccountIcon, Account (colunas), AccountDtos, AccountService (regras de vínculo)
└── resources/db/migration/V7__account_holder_icon_and_card_bank.sql
apps/api-server/src/test/java/com/jvtech/gefinc/account/
├── AccountHolderIT.java  CardBankLinkIT.java  AccountMigrationV7IT.java

packages/
├── core-models/                       # openapi (HolderType, AccountIcon, campos) + tipos gerados + ACCOUNT_ICONS/HOLDER_TYPES
├── utils/src/lib/                     # helper de ícone padrão por tipo (função pura, testada)
└── ui-shared/src/
    ├── brand/                         # gefinc-symbol.svg, gefinc-wordmark.svg (fonte única da marca)
    ├── styles/theme.css               # tokens, movimento reduzido, estados de foco
    └── lib/
        ├── icons/                     # gef-icon e catálogo de desenhos (conta, navegação, ações, status)
        ├── brand/                     # gef-logo (símbolo e símbolo + nome)
        ├── accounts/                  # account-badge, account-picker; formulário e lista de contas (PF/PJ, ícone, vínculo, filtro)
        ├── nav/                       # NAV_ITEMS (web e app)
        ├── layout/                    # toast-host; Sheet com lado (gaveta); EmptyView/ErrorView com ícone
        └── transactions|invoices|dashboard/  # badge de conta/cartão, sinal e ícone de natureza e status

apps/web-app/
├── src/app/layout/shell.ts            # barra lateral esquerda, recolher, gaveta, rodapé
├── src/index.html + public/           # favicons, apple-touch-icon, manifesto
apps/mobile-app/
├── src/app/home/                      # botão único "Novo lançamento"
├── src/app/new-entry/                 # novo lançamento rápido (natureza escolhida na tela)
├── src/app/quick-expense/             # padrões por natureza (QuickExpenseDefaults)
├── android/app/src/main/res/          # mipmap, adaptive icon (foreground e monocromático), ícone de notificação
└── ios/App/App/Assets.xcassets/       # AppIcon 1024 (sem build: sem Mac)

tools/brand/generate-assets.mjs        # renderiza os SVG no Chromium do Playwright, grava PNG, ICO e recursos de Android e iOS
apps/web-app-e2e/  apps/mobile-app-e2e/ # E2E por história, identidade e conforto
```

**Structure Decision**: o que é comum a web e app (ícones, logo, badge, picker, toast, itens de navegação) vive em `ui-shared`; o shell lateral é só do web e a tela inicial com as duas ações é só do app; a marca nasce de um único SVG-fonte e é gerada por script. O backend ganha colunas e regras no módulo `account`, sem módulo novo.

## Complexity Tracking

| Adição | Por que é necessária | Alternativa mais simples rejeitada porque |
|---|---|---|
| Colunas `holder_type`, `icon`, `bank_account_id` + migração V7 | Pedido do usuário (PF/PJ, cartão vinculado, ícone) | Guardar só no cliente perderia dados entre aparelhos e web/app |
| FK composta + `CHECK`s | Isolamento entre usuários e consistência no banco (Princípios III e V) | Validar só no serviço deixaria o banco aceitar vínculo de outro usuário |
| Conjunto próprio de ícones SVG (`gef-icon`) | Identidade visual, offline, sem marcas registradas, um desenho para menu, ações e estados | Biblioteca de ícones traria dependência e peso para ~40 desenhos |
| `gef-account-picker` no lugar do `<select>` | Mostrar ícone, nome, conta vinculada e selo (FR-015); `<option>` não exibe ícones | Texto/emoji na opção não segue a marca e varia por sistema |
| Menu lateral próprio (recolher, gaveta, teclado) | Pedido do usuário; padrão de sistemas de gestão | Manter o topo contraria o pedido |
| Script de geração da marca (`tools/brand`) | Favicons e ícones de Android/iOS repetíveis a partir de um SVG; troca fácil pelo logo final | Gerar à mão não é repetível; `sharp`/`resvg` seriam dependências novas |
| `ToastHost` com Desfazer | FR-033; confirmação visível e reversível ao pagar | Alerta fixo no topo é intrusivo e não desfaz |
| Emenda à constituição (Princípio VI): "lançamento rápido de despesa **e de receita** em até 3 toques" e "navegação lateral no web" | O texto atual só cita despesa; a regra passa a valer também para receita | Deixar o texto como está tornaria a receita um requisito sem amparo formal |

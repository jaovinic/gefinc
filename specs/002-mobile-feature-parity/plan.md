# Implementation Plan: Paridade de funcionalidades nos aplicativos Android e iOS

**Branch**: `002-mobile-feature-parity` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-mobile-feature-parity/spec.md`

## Summary

Levar ao Android e ao iOS todas as funções da versão web, mais uso sem internet, bloqueio por
biometria e lembretes de vencimento. A abordagem (ver [research.md](./research.md)):

1. **Paridade**: mover as telas de funcionalidade do `web-app` para `packages/ui-shared` como
   componentes responsivos (tabela no desktop, cartões no celular); o web fica só com shell e
   rotas, o mobile ganha shell com barra de abas. Uma implementação, dois apps (SC-002).
2. **Offline**: interceptor só do mobile com cache de leitura cifrado (IndexedDB + AES-GCM, chave
   no armazenamento seguro) e fila durável de três operações (criar lançamento, pagar, desfazer),
   com sobreposição na lista de lançamentos.
3. **Servidor**: cabeçalho `Idempotency-Key` nas três operações (tabela `idempotency_keys`, V6) e
   `GET /due-summary` para os lembretes. Nenhuma regra financeira muda.
4. **Biometria**: `AppLockService` + tela de bloqueio + proteção da visão de apps recentes.
5. **Lembretes**: notificações locais planejadas por uma função pura (`planReminders`, em `utils`)
   a partir de `GET /due-summary`.

## Technical Context

**Language/Version**: Java 21 (backend); TypeScript 5.x, Angular 22 (zoneless, standalone, Signals), Ionic 9, Capacitor 8 (já fixados no monorepo)
**Primary Dependencies**: já existentes (Spring Boot 3.5, Flyway, Angular, Tailwind 4, Ionic, Capacitor, Chart.js). Novas, todas oficiais ou do mesmo autor de plugins já usados e justificadas em Complexity Tracking: `@capacitor/local-notifications`, `@capacitor/network`, `@aparajita/capacitor-biometric-auth`, `@capacitor-community/privacy-screen`
**Storage**: PostgreSQL 16 (uma tabela nova, `idempotency_keys`); no aparelho: IndexedDB (cache cifrado) e Capacitor Preferences (fila e preferências); chave AES-GCM no armazenamento seguro
**Testing**: Jest (utils, ui-shared, mobile-app), JUnit + Testcontainers (backend), Playwright (E2E web e mobile no perfil Pixel 7, com `setOffline` e dublês de plugins), roteiro em aparelho real (S21) via ADB e depuração do WebView
**Target Platform**: Android 7+ (minSdk 24, alvo 36) e iOS 15+; web e API inalterados em plataforma
**Project Type**: Monorepo Nx: API + web + mobile + pacotes compartilhados
**Performance Goals**: painel, lista de lançamentos e faturas em até 2 s com 6.000 lançamentos (online e do cache); desbloqueio por biometria em até 3 s
**Constraints**: nada financeiro em claro no aparelho nem em logs; no máximo 35 avisos agendados (limite de 64 do iOS); cache até 20 MB; o web precisa continuar com os mesmos testes E2E verdes
**Scale/Scope**: 7 áreas de navegação, 6 telas migradas para `ui-shared`, 3 operações offline, 1 endpoint novo, 1 migração

## Constitution Check

*GATE: avaliado antes da pesquisa (Fase 0) e reavaliado após o desenho (Fase 1). Resultado: aprovado, com as justificativas em Complexity Tracking.*

- [x] **I. Monorepo**: telas e lógica comuns vão para `packages/ui-shared`/`packages/utils`; plugins nativos e interceptores de plataforma ficam em `apps/mobile-app`; nenhum app importa outro; tipos novos saem do OpenAPI em `core-models`
- [x] **II. Financial integrity**: nenhum cálculo financeiro novo; a sobreposição offline usa as funções de `utils` (parcelas, formatação) e as telas continuam mostrando o que o servidor calcula; contagens de `due-summary` seguem as regras de fatura e atrasado do painel
- [x] **III. Data isolation & auth**: `idempotency_keys` tem `user_id` na chave primária e `ON DELETE CASCADE`; `due-summary` filtra por `user_id` do token; cache e fila ficam cifrados e são apagados ao sair, ao revogar a sessão e ao excluir a conta; avisos sem valores nem nomes; nada sensível em logs
- [x] **IV. Test-first**: testes de `planReminders`, sobreposição da fila, cache, cifra e bloqueio (Jest) e de idempotência e `due-summary` (Testcontainers, incluindo isolamento entre usuários) são tarefas anteriores às implementações
- [x] **V. Schema**: uma migração V6 imutável, com `CHECK` no estado, FK e índice; `ddl-auto` segue `validate`; `data-model.md` atualizado (a constituição exige atualização da spec ao criar tabela)
- [x] **VI. Platform UX**: mobile mantém o lançamento rápido em até 3 toques (botão no Painel, 1 toque para abrir); web segue tabular; pt-BR com estados de carregamento, vazio e erro; áreas seguras tratadas
- [x] **VII. Simplicidade**: offline, biometria e lembretes ultrapassam RF01–RF03; foram pedidos explicitamente pelo usuário e estão justificados abaixo, com o menor desenho que cumpre a spec (fila só de 3 operações, sem resolução automática de conflitos, sem push remoto)

## Project Structure

### Documentation (this feature)

```text
specs/002-mobile-feature-parity/
├── plan.md              # Este arquivo
├── research.md          # Decisões D1 a D11
├── data-model.md        # Tabela idempotency_keys e estruturas locais
├── quickstart.md        # Roteiro de validação
├── contracts/
│   └── openapi-delta.md # Idempotency-Key e GET /due-summary
└── tasks.md             # Gerado por /speckit-tasks
```

### Source Code (repository root)

```text
apps/api-server/src/main/
├── java/com/jvtech/gefinc/
│   ├── idempotency/             # IdempotencyFilter, IdempotencyKey, repositório, serviço, job de limpeza
│   └── dashboard/               # DueSummaryService e rota GET /due-summary (junto de DashboardController)
└── resources/db/migration/V6__idempotency_keys.sql
apps/api-server/src/test/java/com/jvtech/gefinc/
├── idempotency/IdempotencyIT.java
└── dashboard/DueSummaryIT.java

packages/
├── core-models/             # openapi (Idempotency-Key, /due-summary) + tipos gerados
├── utils/src/lib/reminders/ # planReminders (função pura) e testes
└── ui-shared/src/lib/
    ├── viewport/            # serviço compact() (matchMedia)
    ├── accounts/  categories/  transactions/  invoices/  dashboard/  settings/
    │                        # telas migradas do web, responsivas (tabela x cartões)
    └── api/                 # DueSummaryApi, cabeçalho Idempotency-Key opcional

apps/web-app/src/app/        # fica só shell, rotas e providers; telas vêm de ui-shared
apps/mobile-app/src/app/
├── shell/                   # barra de abas, menu "Mais", rotas
├── offline/                 # offline.interceptor, cache cifrado, fila, sincronização, banners
├── lock/                    # AppLockService, LockScreen, privacidade em apps recentes
├── reminders/               # RemindersService (agenda via local-notifications), tela de lembretes
├── settings/                # Minha conta: bloqueio, lembretes, sair, exclusão
└── quick-expense/           # mantido, passa a usar a fila offline
apps/mobile-app/android/     # POST_NOTIFICATIONS, permissões e ícone de notificação
apps/mobile-app/ios/         # NSFaceIDUsageDescription e permissões de notificação (sem build: sem Mac)
apps/mobile-app-e2e/  apps/web-app-e2e/   # E2E por história; web segue verde
```

**Structure Decision**: mover telas para `ui-shared` (Princípio I) e manter no `mobile-app` apenas o
que depende de plugin nativo ou de ciclo de vida do aparelho (offline, bloqueio, lembretes). O
backend ganha dois pacotes pequenos; nada existente muda de contrato além dos cabeçalhos opcionais.

## Complexity Tracking

| Violação / adição | Por que é necessária | Alternativa mais simples rejeitada porque |
|---|---|---|
| Modo offline (cache cifrado + fila de 3 operações) | Pedido explícito; registrar despesa onde não há sinal é o ganho central do celular | Só leitura em cache não permite registrar; fila de todas as operações geraria conflitos sem resolução automática |
| Tabela `idempotency_keys` (V6) | Garante registro único quando um envio offline é interrompido e repetido (SC-010) | Deduplicar por conteúdo bloqueia compras legítimas iguais; sem idempotência, o reenvio duplica dinheiro |
| Endpoint `GET /due-summary` | Lembretes precisam de contagens corretas por regra de fatura; evita duplicar a regra no aparelho | Calcular a partir do cache de listas divergiria do painel e exigiria cache de vários meses |
| Plugin `@capacitor/local-notifications` (oficial) | Única forma suportada de agendar avisos locais nas duas plataformas | Push remoto exige Firebase e APNs, que o projeto não tem |
| Plugin `@capacitor/network` (oficial) | Detecta retorno da conexão para sincronizar sem sondar a API | Sondar a API gasta bateria e dados |
| Plugin `@aparajita/capacitor-biometric-auth` | Acesso à biometria nativa (Android BiometricPrompt, iOS LocalAuthentication); mesmo autor do plugin de armazenamento seguro já usado | Não existe API web equivalente no WebView |
| Plugin `@capacitor-community/privacy-screen` | Oculta a miniatura em apps recentes (`FLAG_SECURE`/cobertura), exigido pelo SC-012 | Overlay em JavaScript tem corrida com o sistema que tira a miniatura |
| Cifra do cache com WebCrypto + chave no armazenamento seguro | Dados financeiros no aparelho precisam de proteção (Princípio III) | SQLCipher exigiria plugin nativo e manutenção nas duas plataformas |
| Mover telas do web para `ui-shared` | Princípio I e SC-002 (uma implementação, valores idênticos) | Duplicar páginas no mobile diverge com o tempo e dobra os testes |

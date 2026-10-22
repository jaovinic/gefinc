# Implementation Plan: Gestão Financeira Pessoal (GEFINC)

**Branch**: `001-personal-finance-management` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-personal-finance-management/spec.md`

## Summary

Plataforma web e mobile de finanças pessoais: cadastro seguro de usuários, contas e cartões,
lançamentos fixos, avulsos e parcelados com vencimentos derivados do fechamento do cartão,
pagamento total ou parcial de faturas, projeção de faturas, saldo residual e painel mensal por
vencimento.

Abordagem técnica (detalhes em [research.md](./research.md)): monorepo Nx com API Spring Boot
(Java 21, JPA, Flyway, PostgreSQL 16) contract-first em OpenAPI, autenticação JWT de curta
duração com refresh token rotativo, aplicativos Angular (web) e Ionic/Capacitor (mobile)
compartilhando `core-models` (tipos gerados do contrato), `ui-shared` e `utils` (dinheiro e
cálculo de parcelas, validados por vetores de teste comuns ao backend). Faturas são visões
derivadas; só os pagamentos de fatura são persistidos.

## Technical Context

**Language/Version**: Java 21 (backend); TypeScript 5.x com Angular 17+ (web e mobile). Versões exatas fixadas no scaffolding, usando a última estável da faixa exigida
**Primary Dependencies**: Spring Boot 3.x (Web, Security, Data JPA, Validation, Mail, Actuator), Flyway, Maven; Angular 17+ (Signals, standalone), Tailwind CSS, Ionic 7+, Capacitor, Chart.js 4, Nx
**Storage**: PostgreSQL 16 (`NUMERIC(19,2)` para dinheiro); migrações Flyway; Mailpit para e-mail em desenvolvimento
**Testing**: JUnit 5, AssertJ, Testcontainers (PostgreSQL 16), swagger-request-validator; Jest + Testing Library; Playwright (web e viewport móvel); k6 (carga sob demanda)
**Target Platform**: API em Linux (JVM 21); web em navegadores modernos desktop; app móvel Android e iOS via Capacitor
**Project Type**: Monorepo Nx: web application + mobile app + API
**Performance Goals**: painel e projeção em até 2 s (p95) com ~6.000 lançamentos por usuário (SC-006); 1.000 usuários simultâneos sem degradação perceptível (SC-008)
**Constraints**: dinheiro sempre exato (sem `float`/`double`); isolamento por `user_id` em todas as consultas; sessão stateless; interface em pt-BR; app móvel exige internet; lançamento rápido em até 3 toques
**Scale/Scope**: 1 instância da API (jobs agendados idempotentes); 7 histórias de usuário, 42 requisitos funcionais, ~36 operações de API, 6 tabelas de domínio mais 2 de tokens

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify against `.specify/memory/constitution.md` (versão vigente):

- [x] **I. Monorepo**: `apps/api-server`, `apps/web-app`, `apps/mobile-app`, `packages/core-models|ui-shared|utils`; sem importação entre apps; DTOs gerados do OpenAPI em `core-models`; cálculo de parcelas e dinheiro em `utils`
- [x] **II. Financial integrity**: `BigDecimal` + `NUMERIC(19,2)`; dinheiro como string decimal na API; `InstallmentScheduler` com resto de centavos na última parcela; regras de fechamento/vencimento e meses curtos cobertas por vetores de teste (D1, D2)
- [x] **III. Data isolation & auth**: `user_id` em todas as tabelas de domínio e FKs compostas; `userId` vem do token; JWT 15 min + refresh rotativo; mobile em secure storage, web em cookie HttpOnly; logs sem dados sensíveis (D5, D9, D16)
- [x] **IV. Test-first**: testes unitários dos cálculos e de pagamento de fatura, integração com Testcontainers/PostgreSQL e testes de isolamento entre usuários por recurso, escritos antes da implementação (D14)
- [x] **V. Schema**: tudo por migrações Flyway; `CHECK`, FKs e índices no banco; `ddl-auto=validate`. Pendência: atualizar `spec-genfic.md` §5 com as colunas/tabelas novas (tarefa T-DOC)
- [x] **VI. Platform UX**: web tabular + painel; mobile com fluxo "Nova despesa" em 2 toques mais digitação (D13); pt-BR com estados de carregamento, vazio e erro
- [x] **VII. Simplicity**: escopo limitado a RF01–RF03/RNFs e às decisões da clarificação; sem Redis, cache, filas ou serviços extras; justificativas em Complexity Tracking

**Re-avaliação pós-design (Fase 1)**: todos os portões continuam atendidos. O design adicionou
tabelas e colunas além do `spec-genfic.md` §5 (`invoice_payments`, `refresh_tokens`,
`password_reset_tokens` e colunas de apoio); foram justificadas abaixo e exigem a tarefa T-DOC.

## Project Structure

### Documentation (this feature)

```text
specs/001-personal-finance-management/
├── plan.md              # Este arquivo (/speckit-plan)
├── research.md          # Fase 0: decisões D1–D17
├── data-model.md        # Fase 1: tabelas, regras e transições
├── quickstart.md        # Fase 1: ambiente e roteiro de validação
├── contracts/
│   └── openapi.yaml     # Fase 1: contrato REST (OpenAPI 3.1)
├── checklists/
│   └── requirements.md  # Qualidade da spec
└── tasks.md             # Fase 2 (/speckit-tasks — NÃO criado por /speckit-plan)
```

### Source Code (repository root)

```text
apps/
├── api-server/                          # Spring Boot (Maven isolado; alvos Nx via mvnw)
│   ├── pom.xml
│   ├── project.json
│   └── src/
│       ├── main/java/com/jvtech/gefinc/
│       │   ├── common/                  # erros RFC 7807, Clock, segurança, config
│       │   ├── auth/                    # login, refresh, recuperação, exclusão de conta
│       │   ├── user/
│       │   ├── account/
│       │   ├── category/
│       │   ├── transaction/             # grupos, ocorrências, InstallmentScheduler, job de fixos
│       │   ├── invoice/                 # fatura derivada, pagamentos, projeção
│       │   └── dashboard/               # painel e fluxo de caixa
│       ├── main/resources/
│       │   ├── application.yml
│       │   └── db/migration/            # V1__..., V2__... (Flyway)
│       └── test/java/com/jvtech/gefinc/ # unit/ e integration/ (Testcontainers)
│
├── web-app/                             # Angular standalone + Signals + Tailwind
│   └── src/app/{core,auth,accounts,categories,transactions,invoices,dashboard}/
│
└── mobile-app/                          # Ionic + Angular + Capacitor
    └── src/app/{core,auth,home,quick-expense}/

packages/
├── core-models/                         # tipos gerados do OpenAPI + enums
│   ├── openapi/gefinc.openapi.yaml
│   └── fixtures/installments.json       # vetores de teste compartilhados com o backend
├── ui-shared/                           # componentes (gráficos, campos de dinheiro, tabelas)
└── utils/                               # Money (BRL), agenda de parcelas, formatação de datas

docker-compose.yml                       # PostgreSQL 16 + Mailpit
nx.json  package.json  .env.example
```

**Structure Decision**: aplicação web + app móvel + API em monorepo Nx, exatamente a estrutura
descrita no README e na constituição (Princípio I). O backend é modular por funcionalidade
(`auth`, `account`, `transaction`, `invoice`, …), cada módulo com controller → service →
repository; regras de cálculo ficam em classes puras sem dependência de Spring, para teste
unitário direto.

## Complexity Tracking

> Itens que ultrapassam o mínimo e foram aceitos de forma deliberada.

| Violação / Complexidade | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Dois modos de entrega do refresh token (cookie HttpOnly no web; corpo + secure storage no mobile) | Segurança contra XSS no web e armazenamento seguro exigido no mobile (RNF02, Princípio III) | Token em `localStorage` expõe o refresh token a XSS; cookie no mobile híbrido não é confiável entre origens |
| `user_id` redundante em `transactions` e FKs compostas | Garante no banco que referências são do mesmo usuário e acelera o índice `(user_id, due_date)` (Princípios III e V) | Filtro só na aplicação deixa um bug de serviço gravar ou ler dados de outro usuário |
| Cálculo de parcelas implementado em Java e em TypeScript | A constituição exige o cálculo em `utils` (prévia na UI) e o servidor precisa ser autoritativo (Princípios I e II) | Só no servidor adiciona latência e viola a localização exigida; só no cliente não é confiável. Vetores compartilhados evitam divergência |
| Tabelas e colunas além do `spec-genfic.md` §5 (`invoice_payments`, `refresh_tokens`, `password_reset_tokens`, `active`, `version`, `reference_month`, etc.) | Necessárias para pagamento de fatura, sessões com rotação, recuperação de senha, inativação e concorrência otimista, todas exigidas pela spec e pela clarificação | Remover qualquer uma impede atender FR-002, FR-006, FR-011, FR-034–FR-039 |
| Consulta indexada ao banco em cada requisição autenticada (`users.token_version`) | Invalidar de imediato os tokens de acesso ao trocar a senha ou pedir exclusão (FR-006, FR-008) | JWT puramente stateless deixa o token válido até 15 minutos após o evento |
| Materialização de 12 meses de lançamentos fixos + job diário | Consultas de painel e projeção ficam agregações SQL simples e testáveis (FR-020, SC-006) | Expandir recorrência em tempo de leitura complica as consultas e o teste de totais |

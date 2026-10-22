# GEFINC - Gestão Financeira Pessoal

Sistema integrado web e mobile estruturado em monorepo para gestão financeira pessoal, permitindo o controle detalhado de receitas e despesas (fixas, variáveis e parceladas em cartões de crédito).

---

## 🏗️ Arquitetura do Monorepo

```text
gefinc/
├── apps/
│   ├── web-app/            # Frontend Angular (Desktop / Gestão analítica)
│   ├── web-app-e2e/        # Testes ponta a ponta do web (Playwright, inclui acessibilidade)
│   ├── mobile-app/         # Aplicação Móvel Ionic + Capacitor com Angular (Lançamentos rápidos)
│   ├── mobile-app-e2e/     # Testes ponta a ponta do app em viewport de celular (limite de 3 toques)
│   └── api-server/         # Backend API em Java com Spring Boot (+ loadtest/ com o teste de carga k6)
│
├── packages/
│   ├── core-models/        # Contrato OpenAPI, tipos TypeScript gerados e Enums partilhados
│   ├── ui-shared/          # Biblioteca de componentes visuais Angular, cliente da API e gráficos
│   └── utils/              # Funções utilitárias (cálculo de parcelas, vencimento de cartão, dinheiro BRL)
│
├── docs/                   # Identidade visual e documentação operacional (operations.md)
├── specs/                  # Especificação, plano, contratos e tarefas (Spec Kit)
├── nx.json                 # Configuração do orquestrador Nx
├── package.json            # Dependências e scripts globais do monorepo
└── docker-compose.yml      # PostgreSQL local e Mailpit (e-mails de desenvolvimento)
```

## 🛠️ Stack Tecnológica

- **Orquestração de Monorepo:** [Nx](https://nx.dev/)

- **Backend:** Java 21, Spring Boot 3.5, Spring Data JPA, Spring Security (JWT), Flyway, Maven

- **Base de Dados:** PostgreSQL 16+

- **Frontend Web:** Angular 22 (Standalone Components, Signals, Tailwind CSS 4, Chart.js)

- **Mobile:** Ionic 9 com Angular e Capacitor 8

- **Controlo e Especificação:** Spec-kit

## 📋 Requisitos do Sistema

### 1. Gestão de Contas e Cartões

- Registo de contas correntes, dinheiro e múltiplos cartões de crédito.

- Definição explícita do dia de fecho e do dia de vencimento de cada cartão.

### 2. Gestão de Receitas e Despesas

- **Fixas:** Despesas ou receitas recorrentes mensais (ex.: salários, assinaturas, contas de consumo).

- **Variáveis/Avulsas:** Transações pontuais liquidadas no mês de competência.

- **Parceladas:** Compras divididas em múltiplas parcelas com projeção automática nos meses subsequentes até à conclusão do pagamento.

- **Atributos essenciais:** Descrição/estabelecimento, categoria, meio de pagamento, valor total, total de parcelas, valor da parcela, data de emissão, data de vencimento e estado (pendente ou pago).

### 3. Projeção de Faturas e Fluxo de Caixa

- Consulta consolidada de encargos futuros por cartão de crédito.

- Saldo residual dinâmico (`Total de Receitas Previstas - Total de Despesas Previstas`).

- Painel de controlo (dashboard) com resumos mensais, valores a vencer, montantes já liquidados e distribuição por categorias.

## ▶️ Como executar

Pré-requisitos: Node.js LTS, JDK 21 e Docker (PostgreSQL, Mailpit e Testcontainers). O Maven não precisa
estar instalado (`./mvnw`).

```bash
npm install
npm run dev
```

O `npm run dev` sobe o PostgreSQL e o Mailpit (Docker Compose) e, em paralelo:

| Serviço | Endereço |
|---|---|
| API | http://localhost:8080/api/v1 |
| Web | http://localhost:4200 |
| App móvel (no navegador) | http://localhost:8100 |
| Mailpit (e-mails de recuperação de senha) | http://localhost:8025 |

Se a porta 5432 já estiver ocupada por outro PostgreSQL, defina `DB_PORT=5433` antes de subir. As
variáveis locais ficam em `.env` (modelo em `.env.example`).

## 🧪 Testes

```bash
npx nx run-many -t lint test build     # tudo: lint, testes unitários/integração e build
npx nx run api-server:test             # só o backend (Testcontainers sobe o PostgreSQL 16)
npx nx e2e web-app-e2e                 # fluxos do web no navegador (Playwright)
npx nx e2e mobile-app-e2e              # lançamento rápido em viewport de celular
```

Com a porta 5432 ocupada, rode os E2E com `DB_PORT=5433`. O teste de carga (1.000 usuários) é o
`apps/api-server/loadtest/concurrent-users.js` (k6), descrito em [docs/operations.md](docs/operations.md).

Depois de mudar o contrato (`packages/core-models/openapi/gefinc.openapi.yaml`), regenere os tipos com
`npx nx run core-models:generate`.

## 📱 Aplicativo móvel

```bash
npx nx run mobile-app:serve                 # no navegador, para desenvolvimento
npx nx run mobile-app:sync                  # copia o build para os projetos nativos
npx nx run mobile-app:open -- android       # abre no Android Studio (ou ios)
```

No emulador Android a API local é `http://10.0.2.2:8080/api/v1` (`apps/mobile-app/src/environments`).
Redefinição de senha e exclusão de conta são feitas no web.

## 📚 Mais documentação

- [Especificação e plano](specs/001-personal-finance-management/) (`spec.md`, `plan.md`, `data-model.md`)
- [Roteiro de validação](specs/001-personal-finance-management/quickstart.md)
- [Operação: backups, logs e limites de login](docs/operations.md)

## 🗄️ Modelo de Dados Essencial

- `users`: Dados de autenticação e identificação de utilizadores.

- `accounts`: Contas bancárias, carteiras físicas ou cartões de crédito associados.

- `categories`: Categorização de entradas e saídas (alimentação, tecnologia, transporte, serviços, etc.).

- `transaction_groups`: Agrupador macro de despesas recorrentes ou compras parceladas.

- `transactions`: Lançamentos individuais e parcelas com datas de vencimento, montantes e estado de liquidação.

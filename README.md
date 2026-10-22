# GEFINC - Gestão Financeira Pessoal

Sistema integrado web e mobile estruturado em monorepo para gestão financeira pessoal, permitindo o controle detalhado de receitas e despesas (fixas, variáveis e parceladas em cartões de crédito).

---

## 🏗️ Arquitetura do Monorepo

```text
gefinc/
├── apps/
│   ├── web-app/            # Frontend Angular (Desktop / Gestão analítica)
│   ├── mobile-app/         # Aplicação Móvel Ionic + Capacitor com Angular (Lançamentos rápidos)
│   └── api-server/         # Backend API em Java com Spring Boot
│
├── packages/
│   ├── core-models/        # Interfaces TypeScript, DTOs e Enums partilhados
│   ├── ui-shared/          # Biblioteca de componentes visuais Angular comuns
│   └── utils/              # Funções utilitárias (cálculo de parcelas, formatação monetária BRL)
│
├── nx.json                 # Configuração do orquestrador Nx
├── package.json            # Dependências e scripts globais do monorepo
└── docker-compose.yml      # Base de dados PostgreSQL local e serviços auxiliares
```

## 🛠️ Stack Tecnológica

- **Orquestração de Monorepo:** [Nx](https://nx.dev/)

- **Backend:** Java 21, Spring Boot 3.x, Spring Data JPA, Spring Security (JWT), Flyway, Maven

- **Base de Dados:** PostgreSQL 16+

- **Frontend Web:** Angular 17+ (Standalone Components, Signals, Tailwind CSS)

- **Mobile:** Ionic 7+ com Angular e Capacitor

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

## 🗄️ Modelo de Dados Essencial

- `users`: Dados de autenticação e identificação de utilizadores.

- `accounts`: Contas bancárias, carteiras físicas ou cartões de crédito associados.

- `categories`: Categorização de entradas e saídas (alimentação, tecnologia, transporte, serviços, etc.).

- `transaction_groups`: Agrupador macro de despesas recorrentes ou compras parceladas.

- `transactions`: Lançamentos individuais e parcelas com datas de vencimento, montantes e estado de liquidação.
# Software Specification: GEFINC (Gestão Financeira Pessoal)

## 1. Visão Geral do Produto
O GEFINC é uma plataforma integrada (Web e Mobile) para planejamento financeiro pessoal, controle orçamentário e rastreamento de receitas e despesas (fixas, variáveis e parceladas em cartões de crédito).

## 2. Stack Tecnológica
- **Estratégia de Repositório:** Monorepo orquestrado com Nx.
- **Backend:** Java 21, Spring Boot 3.x, Spring Data JPA, Spring Security (JWT), Flyway, Maven.
- **Banco de Dados:** PostgreSQL 16.
- **Frontend Web:** Angular 17+ (Signals, Standalone Components, TailwindCSS).
- **Mobile:** Ionic 7+ com Angular e Capacitor (compartilhando componentes e tipagens do monorepo).
- **Pacotes Compartilhados:** `core-models` (TypeScript DTOs/Enums), `ui-shared` (Componentes Angular reutilizáveis).

## 3. Requisitos Funcionais (RF)

### RF01 - Gestão de Contas e Cartões
- O sistema deve permitir o cadastro de contas bancárias, dinheiro em espécie e cartões de crédito.
- Para cartões de crédito, registrar explicitamente: Dia de Fechamento e Dia de Vencimento da fatura.

### RF02 - Gestão de Receitas e Despesas
- O sistema deve diferenciar lançamentos entre:
  - **Fixos:** Recorrentes mensais (ex: Salário fixo, Mensalidades, Internet).
  - **Variáveis/Avulsos:** Compras pontuais debitadas no mês.
  - **Parcelados:** Compras divididas em N parcelas, gerando projeção automática mês a mês até a liquidação.
- Campos fundamentais: Descrição/Loja, Categoria, Conta/Cartão, Valor Total, Quantidade de Parcelas, Valor da Parcela, Data da Compra, Data de Vencimento, Status (Pendente, Pago).

### RF03 - Projeção de Faturas e Fluxo de Caixa
- Projeção de faturas futuras por cartão (exibir total já comprometido em meses futuros).
- Cálculo automático de saldo residual (`Total Receitas Previstas - Total Despesas Previstas`).
- Dashboard com indicadores: Total do Mês, Total a Vencer, Total Pago, Gráfico de Gastos por Categoria e Distribuição por Cartão.

## 4. Requisitos Não Funcionais (RNF)
- **RNF01 - Compatibilidade Monorepo:** O build do backend via Maven deve ser isolado em `apps/api-server`, com tarefas do Nx integradas para build e execução unificada via scripts `npm run dev`.
- **RNF02 - Autenticação Stateless:** Uso de JWT com refresh tokens, compatível com a sessão do navegador web e com o armazenamento seguro do dispositivo móvel (Capacitor Preferences/SecureStorage).
- **RNF03 - Responsividade:** A interface web deve ser otimizada para visualização tabular analítica em desktop, enquanto a aplicação mobile deve priorizar telas de cadastro rápido de despesa em menos de 3 toques.

## 5. Estrutura Inicial de Entidades (JPA / Banco de Dados)
- `users`: id, email, password_hash, created_at
- `accounts`: id, user_id, name, type (CHECKING, CASH, CREDIT_CARD), closing_day, due_day
- `categories`: id, user_id, name, type (INCOME, EXPENSE), color_hex
- `transaction_groups`: id, user_id, description, recurrence_type (FIXED, VARIABLE, INSTALLMENT), total_installments, total_amount
- `transactions`: id, group_id, account_id, category_id, installment_number, amount, due_date, payment_date, status (PENDING, PAID)

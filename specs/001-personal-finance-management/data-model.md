# Data Model: Gestão Financeira Pessoal (GEFINC)

**Feature**: `001-personal-finance-management` | **Date**: 2026-10-22

Modelo relacional (PostgreSQL 16), entregue exclusivamente por migrações Flyway
(Princípio V). Convenções: chaves `BIGINT GENERATED ALWAYS AS IDENTITY`; dinheiro
`NUMERIC(19,2)`; datas de negócio `DATE`; instantes `TIMESTAMPTZ`; todos os enums como `VARCHAR`
com `CHECK`.

> **Atenção (Princípio V)**: este modelo estende as 5 tabelas do `spec-genfic.md` §5 com as
> colunas e tabelas marcadas como **[novo]**. A seção §5 do `spec-genfic.md` deve ser atualizada
> como tarefa do plano (T-DOC), antes da primeira migração.

## Visão geral dos relacionamentos

```text
users 1──* accounts 1──* transactions *──1 categories *──1 users
users 1──* categories
users 1──* transaction_groups 1──* transactions
accounts(CREDIT_CARD) 1──* invoice_payments 1──* transactions (settled_by_payment_id)
users 1──* refresh_tokens
users 1──* password_reset_tokens
```

## Tabelas

### users

| Coluna | Tipo | Regras |
|---|---|---|
| id | BIGINT PK | |
| email | VARCHAR(254) | NOT NULL, UNIQUE (case-insensitive: índice em `lower(email)`) |
| password_hash | VARCHAR(100) | NOT NULL (BCrypt) |
| created_at | TIMESTAMPTZ | NOT NULL, default `now()` |
| deletion_requested_at **[novo]** | TIMESTAMPTZ | NULL = ativo. Preenchido = em carência (30 dias) |

### accounts

| Coluna | Tipo | Regras |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT | NOT NULL, FK → users ON DELETE CASCADE |
| name | VARCHAR(80) | NOT NULL, único por usuário entre contas ativas |
| type | VARCHAR(12) | NOT NULL, `CHECK IN ('CHECKING','CASH','CREDIT_CARD')` |
| closing_day | SMALLINT | `CHECK (closing_day BETWEEN 1 AND 31)` |
| due_day | SMALLINT | `CHECK (due_day BETWEEN 1 AND 31)` |
| active **[novo]** | BOOLEAN | NOT NULL, default `true` (FR-011 inativar) |
| version **[novo]** | BIGINT | NOT NULL, bloqueio otimista |

- `CHECK ((type = 'CREDIT_CARD') = (closing_day IS NOT NULL AND due_day IS NOT NULL))`
  (FR-012: obrigatórios no cartão e proibidos nos demais).
- `UNIQUE (id, user_id)` — alvo de chaves estrangeiras compostas.
- Exclusão física só se não houver lançamentos (`ON DELETE RESTRICT` nas referências); caso
  contrário a API responde `409 ACCOUNT_IN_USE` e sugere inativação (FR-013).

### categories

| Coluna | Tipo | Regras |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT | NOT NULL, FK → users ON DELETE CASCADE |
| name | VARCHAR(60) | NOT NULL, único por `(user_id, type)` |
| type | VARCHAR(7) | NOT NULL, `CHECK IN ('INCOME','EXPENSE')` |
| color_hex | CHAR(7) | NOT NULL, `CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$')` |

- `UNIQUE (id, user_id)`.
- Categorias iniciais (ex.: Alimentação, Moradia, Transporte, Saúde, Lazer, Educação, Serviços,
  Salário, Outras receitas) são criadas para o usuário no cadastro (FR-014).
- Excluir categoria em uso: `ON DELETE RESTRICT`; a API aceita `reassignTo=<id>` para mover os
  lançamentos antes da exclusão, dentro da mesma transação (FR-015).

### transaction_groups

| Coluna | Tipo | Regras |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT | NOT NULL, FK → users ON DELETE CASCADE |
| description | VARCHAR(120) | NOT NULL (descrição/loja) |
| recurrence_type | VARCHAR(11) | NOT NULL, `CHECK IN ('FIXED','VARIABLE','INSTALLMENT')` |
| total_installments | SMALLINT | NOT NULL, default 1. `CHECK (total_installments BETWEEN 1 AND 120)` |
| total_amount | NUMERIC(19,2) | NOT NULL, `CHECK (total_amount > 0)` |
| account_id **[novo]** | BIGINT | NOT NULL, FK composta `(account_id, user_id)` → accounts |
| category_id **[novo]** | BIGINT | NOT NULL, FK composta `(category_id, user_id)` → categories |
| purchase_date **[novo]** | DATE | NOT NULL (data da compra) |
| first_due_date **[novo]** | DATE | NOT NULL (vencimento da 1ª ocorrência) |
| end_month **[novo]** | DATE | NULL = recorrência sem fim (primeiro dia do mês). Só para FIXED |
| version **[novo]** | BIGINT | NOT NULL, bloqueio otimista |
| created_at **[novo]** | TIMESTAMPTZ | NOT NULL |

- `UNIQUE (id, user_id)`.
- Regras por tipo:
  - `VARIABLE`: `total_installments = 1`; gera 1 lançamento.
  - `INSTALLMENT`: `total_installments ≥ 2`; `total_amount` é o valor total; gera N lançamentos.
  - `FIXED`: `total_installments = 1`; `total_amount` é o valor **mensal** atual; gera
    ocorrências mensais (janela de 12 meses, D4 da pesquisa).
- O tipo (receita/despesa) é herdado de `categories.type`.

### transactions

| Coluna | Tipo | Regras |
|---|---|---|
| id | BIGINT PK | |
| group_id | BIGINT | NOT NULL, FK composta `(group_id, user_id)` → transaction_groups ON DELETE CASCADE |
| user_id **[novo]** | BIGINT | NOT NULL, FK → users ON DELETE CASCADE |
| account_id | BIGINT | NOT NULL, FK composta `(account_id, user_id)` → accounts ON DELETE RESTRICT |
| category_id | BIGINT | NOT NULL, FK composta `(category_id, user_id)` → categories ON DELETE RESTRICT |
| installment_number | SMALLINT | NOT NULL, `CHECK (installment_number >= 1)` |
| reference_month **[novo]** | DATE | NOT NULL, 1º dia do mês do `due_date` (`CHECK (reference_month = due_date - (EXTRACT(DAY FROM due_date)::int - 1))`, aritmética pura de datas, independente de fuso) |
| amount | NUMERIC(19,2) | NOT NULL, `CHECK (amount > 0)` |
| due_date | DATE | NOT NULL |
| payment_date | DATE | |
| status | VARCHAR(7) | NOT NULL, `CHECK IN ('PENDING','PAID')` |
| settled_by_payment_id **[novo]** | BIGINT | FK → invoice_payments ON DELETE SET NULL. Preenchido quando a quitação da fatura marcou o item |
| version **[novo]** | BIGINT | NOT NULL |

- `CHECK ((status = 'PAID') = (payment_date IS NOT NULL))`.
- `CHECK (settled_by_payment_id IS NULL OR status = 'PAID')`.
- `UNIQUE (group_id, installment_number)` (parcelas) e `UNIQUE (group_id, reference_month)`
  (idempotência das recorrências).
- Índices: `(user_id, due_date)`, `(user_id, account_id, due_date)`,
  `(user_id, category_id, due_date)`, `(user_id, status, due_date)`.

### invoice_payments **[novo]**

| Coluna | Tipo | Regras |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT | NOT NULL, FK → users ON DELETE CASCADE |
| account_id | BIGINT | NOT NULL, FK composta `(account_id, user_id)` → accounts. Deve ser `CREDIT_CARD` (validado no serviço) |
| invoice_month | DATE | NOT NULL, 1º dia do mês do vencimento da fatura |
| amount | NUMERIC(19,2) | NOT NULL, `CHECK (amount > 0)` |
| paid_at | DATE | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

- Índice `(user_id, account_id, invoice_month)`.
- `UNIQUE (id, user_id)`.

### refresh_tokens **[novo]**

| Coluna | Tipo | Regras |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT | NOT NULL, FK → users ON DELETE CASCADE |
| family_id | UUID | NOT NULL (identifica o login; reuso revoga a família) |
| token_hash | CHAR(64) | NOT NULL, UNIQUE (SHA-256 em hex) |
| expires_at | TIMESTAMPTZ | NOT NULL |
| revoked_at | TIMESTAMPTZ | |
| replaced_by_id | BIGINT | FK → refresh_tokens |
| created_at | TIMESTAMPTZ | NOT NULL |

### password_reset_tokens **[novo]**

| Coluna | Tipo | Regras |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT | NOT NULL, FK → users ON DELETE CASCADE |
| token_hash | CHAR(64) | NOT NULL, UNIQUE |
| expires_at | TIMESTAMPTZ | NOT NULL (criação + 60 min) |
| used_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | NOT NULL |

- Índice `(user_id, created_at)` para o limite de 3 solicitações por hora.

## Fatura (visão derivada, sem tabela)

Chave: `(account_id, invoice_month)`.

```text
itens           = transactions WHERE user_id = :u AND account_id = :a AND reference_month = :m
total           = Σ itens.amount
pago_individual = Σ itens.amount WHERE status = 'PAID' AND settled_by_payment_id IS NULL
pago_fatura     = Σ invoice_payments.amount WHERE account_id = :a AND invoice_month = :m
restante        = total − pago_individual − pago_fatura           (invariante: restante ≥ 0)
```

## Transições de estado

**Lançamento (`transactions.status`)**

```text
PENDING ──pagar item (payment_date)──────────────▶ PAID (settled_by_payment_id = NULL)
PAID    ──desfazer pagamento do item──────────────▶ PENDING (payment_date = NULL)
PENDING ──pagamento deixa restante = 0 (quitação)─▶ PAID (settled_by_payment_id = id do pagamento)
PAID    ──desfazer qualquer pagamento da fatura───▶ PENDING (apenas itens com settled_by_payment_id ≠ NULL)
```

**Conta**: `active=true ⇄ active=false` (inativar preserva histórico). Exclusão física só sem
lançamentos.

**Usuário**: `ativo → exclusão pendente (deletion_requested_at) → ativo (cancelado) | removido
(após 30 dias)`.

**Grupo FIXED**: `ativo (end_month NULL) → encerrado (end_month = mês)`. Ocorrências PENDING com
`reference_month > end_month` são removidas; PAID permanecem.

## Regras de validação (derivadas da spec)

| Regra | Origem | Onde é imposta |
|---|---|---|
| e-mail único e válido; senha dentro da política | FR-001 | serviço + índice único |
| `closing_day`/`due_day` 1–31, obrigatórios só no cartão | FR-012 | `CHECK` + serviço |
| valores > 0 com 2 casas decimais; datas válidas | FR-025 | `CHECK` + Bean Validation |
| soma das parcelas = `total_amount` (resto na última) | FR-023 | `InstallmentScheduler` + teste |
| vencimento no cartão conforme fechamento | FR-021 | `InstallmentScheduler` |
| vencimento mensal fora do cartão | FR-022 | `InstallmentScheduler` |
| pagamento de fatura ≤ restante; restante ≥ 0 | FR-033, FR-037 | serviço (transação com `FOR UPDATE`) |
| referências do mesmo usuário | Princípio III | FKs compostas |
| status ↔ `payment_date` | FR-018 | `CHECK` |
| exclusão de conta/categoria em uso | FR-013, FR-015 | `RESTRICT` + `409` |

## Mapeamento dos requisitos para o modelo

| Requisitos | Entidades |
|---|---|
| FR-001–FR-010 | users, refresh_tokens, password_reset_tokens |
| FR-011–FR-013 | accounts |
| FR-014–FR-015 | categories |
| FR-016–FR-026 | transaction_groups, transactions |
| FR-027–FR-032 | transactions (agregações), invoice_payments |
| FR-033–FR-038 | invoice_payments, transactions.settled_by_payment_id |

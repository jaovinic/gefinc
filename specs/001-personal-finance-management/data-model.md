# Data Model: Gestão Financeira Pessoal (GEFINC)

**Feature**: `001-personal-finance-management` | **Date**: 2026-10-22

Modelo relacional (PostgreSQL 16), entregue exclusivamente por migrações Flyway
(Princípio V). Convenções: chaves `BIGINT GENERATED ALWAYS AS IDENTITY`; dinheiro
`NUMERIC(19,2)`; datas de negócio `DATE`; instantes `TIMESTAMPTZ`; todos os enums como `VARCHAR`
com `CHECK`.

> **Chaves estrangeiras e exclusão em cascata**: as referências a tabelas pai usam `NO ACTION`
> (o padrão), nunca `RESTRICT`. `RESTRICT` não pode ser adiado e falharia ao apagar um usuário em
> cascata (FR-010) quando contas e lançamentos do mesmo usuário são removidos no mesmo comando; `NO ACTION`
> é checado ao fim do comando e continua impedindo exclusões isoladas de itens em uso.

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
| token_version **[novo]** | INTEGER | NOT NULL, default 0. Incrementado na troca de senha e no pedido de exclusão. O JWT carrega a versão; o filtro de segurança recusa tokens com versão diferente ou de usuário com exclusão pendente (invalidação imediata, FR-006 e FR-008) |

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
- Exclusão física só se não houver lançamentos (`ON DELETE NO ACTION` nas referências); caso
  contrário a API responde `409 ACCOUNT_IN_USE` e sugere inativação (FR-013).

### categories

| Coluna | Tipo | Regras |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT | NOT NULL, FK → users ON DELETE CASCADE |
| name | VARCHAR(60) | NOT NULL, único por `(user_id, type)` |
| type | VARCHAR(7) | NOT NULL, `CHECK IN ('INCOME','EXPENSE')` |
| color_hex | VARCHAR(7) | NOT NULL, `CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$')` |

- `UNIQUE (id, user_id)`.
- Categorias iniciais (ex.: Alimentação, Moradia, Transporte, Saúde, Lazer, Educação, Serviços,
  Salário, Outras receitas) são criadas para o usuário no cadastro (FR-015).
- Excluir categoria em uso: `ON DELETE NO ACTION`; a API aceita `reassignTo=<id>` para mover os
  lançamentos antes da exclusão, dentro da mesma transação (FR-016).

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
| first_due_date **[novo]** | DATE | NOT NULL (vencimento da 1ª ocorrência; em cartão é calculado pelo servidor e o valor informado é ignorado) |
| end_month **[novo]** | DATE | NULL = recorrência sem fim (primeiro dia do mês). Só para FIXED |
| version **[novo]** | BIGINT | NOT NULL, bloqueio otimista |
| created_at **[novo]** | TIMESTAMPTZ | NOT NULL |

- `UNIQUE (id, user_id)`.
- Regras por tipo:
  - `VARIABLE`: `total_installments = 1`; gera 1 lançamento.
  - `INSTALLMENT`: `total_installments ≥ 2`; `total_amount` é o valor total; gera N lançamentos.
  - `FIXED`: `total_installments = 1`; `total_amount` é o valor **mensal** atual; gera
    ocorrências mensais (janela de 12 meses, D4 da pesquisa).
- Em conta `CREDIT_CARD`, o vencimento de **toda** ocorrência (`VARIABLE`, `INSTALLMENT` e cada mês de
  `FIXED`, tratado como compra no dia de `purchase_date` daquele mês) é calculado por
  `DueDateCalculator`, a partir de `closing_day` e `due_day` (FR-022). Fora do cartão, usa `first_due_date`.
- Ao editar `closing_day` ou `due_day` de uma conta `CREDIT_CARD`, o serviço recalcula `due_date` e
  `reference_month` das ocorrências de grupos `FIXED` com `status = 'PENDING'` e `due_date > hoje`,
  ignorando as que pertençam a faturas (de origem ou de destino) com `invoice_payments` (FR-014).
  Parcelas, avulsos, itens pagos e itens quitados não são recalculados.
- O tipo (receita/despesa) é herdado de `categories.type`.

### transactions

| Coluna | Tipo | Regras |
|---|---|---|
| id | BIGINT PK | |
| group_id | BIGINT | NOT NULL, FK composta `(group_id, user_id)` → transaction_groups ON DELETE CASCADE |
| user_id **[novo]** | BIGINT | NOT NULL, FK → users ON DELETE CASCADE |
| account_id | BIGINT | NOT NULL, FK composta `(account_id, user_id)` → accounts ON DELETE NO ACTION |
| category_id | BIGINT | NOT NULL, FK composta `(category_id, user_id)` → categories ON DELETE NO ACTION |
| installment_number | SMALLINT | NOT NULL, `CHECK (installment_number >= 1)` |
| reference_month **[novo]** | DATE | NOT NULL, 1º dia do mês do `due_date` (`CHECK (reference_month = due_date - (EXTRACT(DAY FROM due_date)::int - 1))`, aritmética pura de datas, independente de fuso) |
| amount | NUMERIC(19,2) | NOT NULL, `CHECK (amount > 0)` |
| due_date | DATE | NOT NULL |
| payment_date | DATE | |
| status | VARCHAR(7) | NOT NULL, `CHECK IN ('PENDING','PAID')` |
| settled_by_payment_id **[novo]** | BIGINT | FK → invoice_payments ON DELETE NO ACTION (o serviço reverte o item antes de apagar o pagamento). Preenchido quando a quitação da fatura marcou o item; nesse caso `payment_date` = `paid_at` do pagamento que quitou |
| version **[novo]** | BIGINT | NOT NULL |

- `CHECK ((status = 'PAID') = (payment_date IS NOT NULL))`.
- `CHECK (settled_by_payment_id IS NULL OR status = 'PAID')`.
- `UNIQUE (group_id, installment_number)` (parcelas) e `UNIQUE (group_id, reference_month) DEFERRABLE
  INITIALLY DEFERRED` (idempotência das recorrências; adiável para permitir trocar meses ao recalcular vencimentos).
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
| token_hash | VARCHAR(64) | NOT NULL, UNIQUE (SHA-256 em hex) |
| expires_at | TIMESTAMPTZ | NOT NULL |
| revoked_at | TIMESTAMPTZ | |
| replaced_by_id | BIGINT | FK → refresh_tokens |
| created_at | TIMESTAMPTZ | NOT NULL |

### password_reset_tokens **[novo]**

| Coluna | Tipo | Regras |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT | NOT NULL, FK → users ON DELETE CASCADE |
| token_hash | VARCHAR(64) | NOT NULL, UNIQUE |
| expires_at | TIMESTAMPTZ | NOT NULL (criação + 60 min) |
| used_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | NOT NULL |

- Índice `(user_id, created_at)` (consultas por usuário). O limite de 3 solicitações por hora é controlado em memória, por e-mail (ver `research.md`, D6).

## Fatura (visão derivada, sem tabela)

Chave: `(account_id, invoice_month)`.

```text
itens           = transactions WHERE user_id = :u AND account_id = :a AND reference_month = :m
total           = Σ itens.amount
pago_individual = Σ itens.amount WHERE status = 'PAID' AND settled_by_payment_id IS NULL
pago_fatura     = Σ invoice_payments.amount WHERE account_id = :a AND invoice_month = :m
restante        = total − pago_individual − pago_fatura           (invariante: restante ≥ 0)
```

`due_date da fatura = MAX(due_date dos itens do mês)`. Após uma mudança nos dias do cartão, os itens
do mesmo mês podem ter vencimentos distintos; cada item mantém a própria data para efeito de atraso.

**Indicadores do painel de um mês M (por mês de vencimento, FR-031)**

```text
Total do Mês  = Σ amount das despesas com reference_month = M
Total Pago    = Σ amount das despesas de M com status PAID e settled_by_payment_id IS NULL
              + Σ invoice_payments.amount das faturas com invoice_month = M
                (itens quitados por pagamento de fatura não entram de novo)
Total a Vencer = Σ restante das faturas de M com due_date ≥ hoje
              + Σ amount das despesas de M fora de cartão, PENDING e due_date ≥ hoje
Atrasado      = o mesmo cálculo de Total a Vencer, com due_date < hoje
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
| valores > 0 com 2 casas decimais; datas válidas | FR-026 | `CHECK` + Bean Validation |
| soma das parcelas = `total_amount` (resto na última) | FR-024 | `InstallmentScheduler` + teste |
| vencimento no cartão conforme fechamento (parcela, avulso e fixo) | FR-022 | `DueDateCalculator` |
| vencimento mensal fora do cartão | FR-023 | `InstallmentScheduler` |
| pagamento de fatura ≤ restante; restante ≥ 0 | FR-034, FR-038 | serviço (transação com `FOR UPDATE`) |
| referências do mesmo usuário | Princípio III | FKs compostas |
| status ↔ `payment_date` | FR-019 | `CHECK` |
| exclusão de conta/categoria em uso | FR-013, FR-016 | `NO ACTION` + `409` |
| conta inativa não recebe novos lançamentos nem novas ocorrências fixas; fatura continua paga | FR-011 | serviço (`422 ACCOUNT_INACTIVE`) e job de fixos |

## Mapeamento dos requisitos para o modelo

| Requisitos | Entidades |
|---|---|
| FR-001–FR-010 | users, refresh_tokens, password_reset_tokens |
| FR-011–FR-014 | accounts |
| FR-015–FR-016 | categories |
| FR-017–FR-027 | transaction_groups, transactions |
| FR-028–FR-033 | transactions (agregações), invoice_payments |
| FR-034–FR-039 | invoice_payments, transactions.settled_by_payment_id |

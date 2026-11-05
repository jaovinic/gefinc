# Data Model: Transferência de saldo entre contas

As entidades de lançamento, fatura, categoria e usuário não mudam (ver `specs/001-personal-finance-management/data-model.md`).
Esta feature acrescenta **uma tabela** (`account_transfers`, migração `V13__account_transfers.sql`) e um campo aditivo na prévia de
exclusão de conta.

## Servidor

### `account_transfers` (nova, `V13__account_transfers.sql`)

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY` | chave primária |
| `user_id` | `BIGINT NOT NULL` | `REFERENCES users (id) ON DELETE CASCADE` |
| `from_account_id` | `BIGINT NOT NULL` | conta de origem |
| `to_account_id` | `BIGINT NOT NULL` | conta de destino |
| `amount` | `NUMERIC(19,2) NOT NULL` | `CHECK (amount > 0)` |
| `transfer_date` | `DATE NOT NULL` | passada, hoje ou futura |
| `description` | `VARCHAR(120)` anulável | aparada; vazia vira nula |
| `version` | `BIGINT NOT NULL DEFAULT 0` | trava otimista (`@Version`) |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

Restrições no banco (Princípio V):

- `ck_at_amount`: `amount > 0`.
- `ck_at_distinct`: `from_account_id <> to_account_id`.
- `fk_at_from`: `(from_account_id, user_id) → accounts (id, user_id)` e `fk_at_to`: `(to_account_id, user_id) → accounts (id, user_id)`,
  **sem cascata**: as duas pontas são do mesmo usuário e conta com transferência não é excluída (inativa-se).
- `uq_at_id_user`: `UNIQUE (id, user_id)`.
- Índices: `(user_id, transfer_date)`, `(user_id, from_account_id, transfer_date)`, `(user_id, to_account_id, transfer_date)`.

Migração: tabela nova, **sem preenchimento retroativo** (nasce vazia). Excluir o usuário remove as transferências em cascata.

Regras no serviço (testadas com Testcontainers):

- Tipo: apenas `CHECKING` e `CASH` (cartão nunca); contas ativas; `from <> to`.
- Criar e editar travam as duas contas com `findForUpdate` em ordem crescente de id (sem deadlock A→B/B→A; serializa contra a
  exclusão de conta). O saldo é derivado, então transferências simultâneas não corrompem nada. `AccountService.update` (inativar) usa
  `@Version`, sem trava pessimista: a corrida transferência × inativação é inofensiva.
- Excluir a transferência não exige conta ativa (estorno).

### Saldo por conta (derivado, sem coluna nova)

`saldo = saldo inicial + receitas pagas − despesas pagas − saídas de cartões vinculados − pagamentos de fatura`
`        + transferências recebidas (transfer_date <= hoje) − transferências enviadas (transfer_date <= hoje)`

Duas consultas agregadas por conta (destino e origem) em `BalanceService`; `total` continua somando só as contas **ativas**.

### `AccountUsage` (campo aditivo)

`transferCount` (`long`): transferências em que a conta é origem ou destino. `canDelete` exige `transferCount = 0`. Cópias locais
antigas sem o campo continuam válidas (o cliente trata ausente como 0).

## Aparelho e navegador

Nada novo é gravado: a lista do mês é lida (e guardada na cópia local do app) como qualquer leitura; criar, editar e excluir exigem
conexão.

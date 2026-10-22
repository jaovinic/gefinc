# Data Model: Contas PF/PJ, cartões vinculados com ícone, receita no app e nova identidade visual

As entidades de lançamento, fatura e usuário não mudam (ver `specs/001-personal-finance-management/data-model.md`).
Esta feature altera **uma tabela** (`accounts`, migração `V7`) e acrescenta preferências de interface no aparelho.

## Servidor

### `accounts` (colunas novas, migração `V7__account_holder_icon_and_card_bank.sql`)

| Coluna | Tipo | Regras |
|---|---|---|
| `holder_type` | `VARCHAR(2)` anulável | `CHECK (holder_type IN ('PF','PJ'))`; **obrigatório em `CHECKING`** e proibido nos demais tipos |
| `icon` | `VARCHAR(20)` anulável | chave de ícone do catálogo (`CHECK` com a lista); nulo = ícone padrão do tipo, resolvido na resposta |
| `bank_account_id` | `BIGINT` anulável | só em `CREDIT_CARD`; FK composta `(bank_account_id, user_id) → accounts (id, user_id)` (mesmo usuário) |

Regras no banco:

- `ck_accounts_holder`: `(type = 'CHECKING' AND holder_type IS NOT NULL) OR (type <> 'CHECKING' AND holder_type IS NULL)`.
- `ck_accounts_bank_link`: `bank_account_id IS NULL OR type = 'CREDIT_CARD'`.
- `ck_accounts_icon`: `icon IS NULL OR icon IN (<catálogo>)`.
- Índice `ix_accounts_bank (user_id, bank_account_id)` para listar os cartões de uma conta.
- Não há `NOT NULL` em `bank_account_id`: cartões anteriores à versão ficam sem vínculo.

Regras no serviço (testadas com Testcontainers):

- Criar cartão **exige** `bankAccountId`; o alvo deve ser do mesmo usuário (senão `404`), do tipo `CHECKING` (senão `422`) e ativo (senão `422 ACCOUNT_INACTIVE`).
- Editar cartão sem vínculo exige informar o vínculo, exceto quando a única mudança é `active`.
- Trocar o vínculo de um cartão não altera lançamentos nem faturas (vencimento depende só dos dias do cartão).
- Excluir conta bancária com cartões vinculados: `409 ACCOUNT_IN_USE` (mensagem cita os cartões); inativar é permitido e não toca nos cartões.
- Conta `CHECKING` nova sem `holderType`: `422` com erro no campo; `CASH` e `CREDIT_CARD` com `holderType`: `422`.

Migração (`V7`): `ALTER TABLE accounts ADD COLUMN ...`; `UPDATE accounts SET holder_type = 'PF' WHERE type = 'CHECKING'`; depois os `CHECK` e o índice. Cartões e ícones existentes ficam nulos.

### Resposta da API (`Account`)

Campos novos: `holderType` (`PF`/`PJ`/nulo), `icon` (**sempre preenchido**: o escolhido ou o padrão do tipo), `bankAccountId` (cartão) e, só para cartão, `bankAccountName` e `holderType` **herdado** da conta vinculada (nulo se sem vínculo). Padrões de ícone: `CHECKING`+`PF` → `bank`, `CHECKING`+`PJ` → `building`, `CASH` → `cash`, `CREDIT_CARD` → `card`.

## Aparelho e navegador (nada vai ao servidor)

### Preferências de interface

| Chave | Onde | Valor |
|---|---|---|
| `gefinc.ui.sidebar-collapsed` | `localStorage` (web), tolerando falha | `"1"` recolhido, ausente = aberto |
| padrões do registro rápido por natureza | `Capacitor Preferences` (mobile) | últimas conta e categoria **por natureza** (`expense`/`income`) |

### Catálogo de ícones (código, não é dado)

`ACCOUNT_ICONS` em `core-models`: `bank`, `building`, `briefcase`, `landmark`, `wallet`, `cash`, `piggy`, `card`, `card-gold`, `card-platinum`, `card-black`, `shield`, `rocket`, `star`, `globe`, `shopping-bag`. Cada chave tem um desenho em `ui-shared`; um teste garante que nenhuma chave fica sem desenho.

### Tolerância da cópia local

Respostas de `/accounts` guardadas antes da atualização não têm `holderType`, `icon` nem `bankAccountId`: o app usa PF, o ícone padrão do tipo e "cartão sem vínculo".

## Estados

- Cartão: `sem vínculo` (legado) → `vinculado` (ao informar a conta bancária). Não há volta para `sem vínculo` por edição.
- Conta bancária: `ativa` ↔ `inativa` (como hoje); inativar não desvincula cartões.

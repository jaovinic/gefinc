# Contratos: alterações na API (feature 003)

Aplicadas em `packages/core-models/openapi/gefinc.openapi.yaml` (e na cópia de
`specs/001-personal-finance-management/contracts/openapi.yaml`) durante a implementação, com os tipos
TypeScript regenerados no mesmo PR.

## Enums novos

```yaml
components:
  schemas:
    HolderType:
      type: string
      enum: [PF, PJ]
    AccountIcon:
      type: string
      enum: [bank, building, briefcase, landmark, wallet, cash, piggy, card, card-gold, card-platinum, card-black, shield, rocket, star, globe, shopping-bag]
```

## `AccountInput` e `AccountUpdate` (campos novos, todos opcionais no esquema)

```yaml
holderType:    { $ref: '#/components/schemas/HolderType' }   # obrigatório se type = CHECKING; proibido nos demais
icon:          { $ref: '#/components/schemas/AccountIcon' }  # opcional; ausente = ícone padrão do tipo
bankAccountId: { type: integer, format: int64 }              # obrigatório se type = CREDIT_CARD ao criar; proibido nos demais
```

Regras documentadas na descrição das operações:

- `POST /accounts` com `type: CREDIT_CARD` sem `bankAccountId`: `422` (campo `bankAccountId`).
- `bankAccountId` de conta de outro usuário: `404`; de conta que não é `CHECKING`: `422`; de conta inativa: `422` (`ACCOUNT_INACTIVE`).
- `PUT /accounts/{id}` de cartão **sem vínculo** sem `bankAccountId`: `422`, exceto quando só `active` muda.
- `DELETE /accounts/{id}` de conta com cartões vinculados: `409` (`ACCOUNT_IN_USE`).

## `Account` (resposta, campos novos)

```yaml
holderType:      { $ref: '#/components/schemas/HolderType', nullable: true }  # em cartão: herdado da conta vinculada
icon:            { $ref: '#/components/schemas/AccountIcon' }                 # sempre presente (escolhido ou padrão)
bankAccountId:   { type: integer, format: int64, nullable: true }
bankAccountName: { type: string, nullable: true }                             # só em cartão vinculado
```

Compatibilidade: todos os campos são aditivos; clientes que não os conhecem continuam funcionando. Nenhum
endpoint novo; o filtro PF/PJ e a lista dos cartões de uma conta são feitos no cliente (as contas do usuário
já vêm todas em `GET /accounts`).

## Saldo, receita por data e saldo inicial (migrações V9 e V10)

- `GET /balances` → `Balances` (`asOf`, `total`, `accounts[]` de `AccountBalance`, `unlinkedCardPayments`).
- `Account`, `AccountInput` e `AccountUpdate` ganham `openingBalance` (`Money`, opcional; ausente vale `0.00` na
  criação e mantém o valor atual na edição; diferente de zero em `CREDIT_CARD`: `422` no campo `openingBalance`).
- `TransactionGroupInput`: **removido** `settled`; `accountId` documenta que receita em `CREDIT_CARD` responde
  `422` com erro no campo `accountId`; `firstDueDate` em receita é a data de entrada na conta.
- `Transaction`: receita com `dueDate` até hoje é `PAID` automático; `overdue` é sempre `false` em receita.
  `pay` só vale em receita futura (antecipação); `unpay` em receita com `dueDate` até hoje responde `409`;
  `PATCH` passa a editar receita já recebida: o status só é reavaliado quando o `dueDate` muda (novo
  `dueDate <= hoje` => `PAID` com `paymentDate = dueDate`; futuro => `PENDING`); editar só o valor não altera
  `status` nem `paymentDate`.
- `Dashboard`: **removido** `balance` (mantidos `totalIncome` e `totalReceived`, que consideram só receita em
  conta que não é cartão; `totalReceived` só `PAID` com `paymentDate <= hoje`).

Mudança incompatível para clientes antigos: eles não devem enviar `settled` (é ignorado) nem ler `Dashboard.balance`.

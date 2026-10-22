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

# Contratos: alterações na API (feature 004)

Aplicadas em `packages/core-models/openapi/gefinc.openapi.yaml` durante a implementação, com `api.ts` regenerado
(`npx nx run core-models:generate`) e os tipos exportados em `packages/core-models/src/lib/models.ts`.

## Caminhos novos (tag `Transfers`)

| Operação | Descrição |
|---|---|
| `GET /transfers?month=YYYY-MM&accountId=&page=&size=` | Transferências do mês (origem **ou** destino quando há `accountId`); `size` 1..200; inválido: `400`. Resposta `TransferPage`. |
| `POST /transfers` | Cria. `201 Transfer`. `422` (validação, cartão, conta inativa `ACCOUNT_INACTIVE`), `404` (conta inexistente/alheia). Aceita `Idempotency-Key`. |
| `GET /transfers/{transferId}` | Consulta. `404` se inexistente ou de outro usuário. |
| `PUT /transfers/{transferId}` | Substituição completa com `version`; `409 STALE_VERSION`. Aceita `Idempotency-Key`. |
| `DELETE /transfers/{transferId}` | Estorna. `204`. Aceita `Idempotency-Key`. |

## Schemas novos

```yaml
Transfer:       { id, fromAccountId, toAccountId, amount: Money, transferDate: date, description?: string(<=120), scheduled: boolean, version }
TransferInput:  { fromAccountId, toAccountId, amount: Money, transferDate: date, description?: string(<=120) }
TransferUpdate: TransferInput + version
TransferPage:   { content: Transfer[], page, size, totalElements }
```

## Alterações aditivas

- `AccountUsage.transferCount` (`integer int64`, **opcional no esquema**; o servidor sempre devolve) e `InUseProblem.transferCount`.
- Descrições de `GET /balances`, `Balances` e `DELETE /accounts/{id}` mencionam transferências.
- `Idempotency-Key`: passa a valer também para `POST /transfers`, `PUT /transfers/{id}` e `DELETE /transfers/{id}`.

Compatibilidade: clientes antigos ignoram `transferCount` e a tag nova; nenhum campo ou caminho existente muda de significado,
exceto o saldo de `GET /balances`, que passa a incluir transferências.

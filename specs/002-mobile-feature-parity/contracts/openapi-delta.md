# Contratos: alterações na API (feature 002)

As alterações abaixo entram em `packages/core-models/openapi/gefinc.openapi.yaml` (e na cópia de
`specs/001-personal-finance-management/contracts/openapi.yaml`) durante a implementação, com os
tipos TypeScript regenerados no mesmo PR.

## 1. Cabeçalho `Idempotency-Key` (opcional)

Aceito em `POST /transaction-groups`, `POST /transactions/{transactionId}/pay` e
`POST /transactions/{transactionId}/unpay`.

```yaml
components:
  parameters:
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: false
      description: |
        UUID gerado pelo cliente. Repetir a mesma chave (mesmo usuário, caminho e corpo) devolve a
        resposta original, com `Idempotent-Replayed: true`, sem repetir o efeito.
      schema: { type: string, format: uuid }
  responses:
    IdempotencyConflict:
      description: Chave em processamento por outra requisição
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
    IdempotencyMismatch:
      description: Chave já usada com outro caminho ou outro corpo
      content:
        application/problem+json:
          schema: { $ref: '#/components/schemas/Problem' }
```

Nas três operações: `parameters` ganha `IdempotencyKey`; `responses` ganha `'409'`
(`IdempotencyConflict`, além dos conflitos já existentes), `'422'` (`IdempotencyMismatch`) e o
cabeçalho `Idempotent-Replayed` (booleano) nas respostas de sucesso. O código de erro do problema é
`IDEMPOTENCY_IN_PROGRESS` (409) ou `IDEMPOTENCY_KEY_REUSED` (422).

## 2. `GET /due-summary`

```yaml
/due-summary:
  get:
    tags: [Dashboard]
    summary: Contagem de vencimentos por dia para os lembretes do aplicativo
    parameters:
      - { name: from, in: query, required: true, schema: { type: string, format: date } }
      - { name: to,   in: query, required: true, schema: { type: string, format: date } }
    responses:
      '200':
        description: Vencimentos do período e atrasados
        content:
          application/json:
            schema: { $ref: '#/components/schemas/DueSummary' }
      '400': { $ref: '#/components/responses/ValidationError' }   # período inválido ou acima de 62 dias
components:
  schemas:
    DueSummary:
      type: object
      required: [days, overdue]
      properties:
        days:
          type: array
          items:
            type: object
            required: [date, items, invoices]
            properties:
              date: { type: string, format: date }
              items: { type: integer, minimum: 0 }      # despesas pendentes fora de cartão
              invoices: { type: integer, minimum: 0 }   # faturas com saldo restante
        overdue:
          type: object
          required: [items, invoices]
          properties:
            items: { type: integer, minimum: 0 }
            invoices: { type: integer, minimum: 0 }
```

Somente dias com pelo menos um vencimento aparecem em `days`, ordenados por data. A resposta nunca
contém valores, descrições ou nomes (a contagem basta aos lembretes e mantém o contrato pequeno).

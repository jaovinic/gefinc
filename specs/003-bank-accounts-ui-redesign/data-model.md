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
- Excluir conta bancária com cartões vinculados: `409 ACCOUNT_IN_USE` (mensagem cita os cartões); inativar é permitido e não toca nos cartões. A regra completa de exclusão está em "Regra de exclusão", abaixo.
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

## Nome de exibição do usuário (migração V8)

`users.name VARCHAR(80)` anulável: o nome que aparece em Minha conta; o usuário altera por `PATCH /auth/me`. O mesmo nome (ou a parte do e-mail antes do @) alimenta o atalho "Minha conta" do cabeçalho; sem mudança de schema ou API.
A troca de senha estando conectado é `POST /auth/password` (exige a senha atual, encerra as demais sessões e
devolve uma sessão nova). O painel ganhou `totalIncome` e `totalReceived` (receitas com vencimento no mês e quanto
já entrou na conta). Seguem a regra de `/balances`: só receita em conta que não é cartão, e `totalReceived` só
conta receita `PAID` com `paymentDate <= hoje`. O saldo das contas não está no painel: vem de `GET /balances` (ver abaixo).

## Receita entra na conta pela data (migrações V9 e V10)

Regra de negócio: **receita só entra em conta** (`CHECKING` ou `CASH`), nunca em `CREDIT_CARD`
(`422` com erro no campo `accountId`; conta de outro usuário segue `404`). Não existe mais "marcar como recebida"
nem `settled` na criação (o campo, se enviado por um cliente antigo, é ignorado).

- Receita com `dueDate` **hoje ou anterior** nasce `PAID` com `paymentDate = dueDate` (avulsa, fixa e parcelada).
- Receita **futura** fica `PENDING` e só entra no caixa quando a data chega. A liquidação é preguiçosa e
  idempotente (`IncomeSettlement.settleDue(userId)`, relógio injetado, data de hoje em `America/Sao_Paulo`):
  roda antes de toda leitura ou alteração de lançamentos, do painel e do saldo, sempre filtrando o usuário.
- Receita futura pode ser antecipada pela ação `pay` (volta a `PENDING` pelo `unpay`). `pay` em receita com
  vencimento até hoje e `unpay` em receita com vencimento até hoje respondem `409`.
- Receita nunca fica atrasada (`overdue` sempre `false`) e nunca entra em `overdueTotal`, `totalToDue` nem em
  `/due-summary`.
- `PATCH` edita também a receita já recebida. O status só é reavaliado quando o `dueDate` **muda**: novo
  `dueDate <= hoje` fica `PAID` (`paymentDate = novo dueDate`); novo `dueDate > hoje` volta a `PENDING`
  (`paymentDate` nulo). Editar só o valor (ou outros campos) não altera `status` nem `paymentDate`, inclusive
  de receita antecipada com `dueDate` futuro.
- Excluir receita avulsa apaga tudo, inclusive a parte recebida; fixa e parcelada mantêm o histórico recebido.
- Receita legada **em cartão** (anterior à regra) fica intacta (inclusive `PENDING`) e fora do saldo.

### `V9__settle_due_income.sql`

`UPDATE transactions` das receitas `PENDING` com `due_date <= hoje (America/Sao_Paulo)` em contas que não são
cartão: `status = 'PAID'`, `payment_date = due_date`, `version = version + 1`. Receitas em cartão e despesas não
são tocadas.

### `V10__account_opening_balance.sql`

`accounts.opening_balance NUMERIC(19,2) NOT NULL DEFAULT 0` e `ck_accounts_opening CHECK (type <> 'CREDIT_CARD' OR
opening_balance = 0)`. `openingBalance` (dinheiro, opcional, pode ser negativo) entra em `AccountInput`,
`AccountUpdate` (ausente mantém o valor atual) e `Account`. Valor diferente de zero em cartão: `422` no campo
`openingBalance`.

### `GET /balances`

`Balances { asOf, total, accounts[], unlinkedCardPayments }`; `AccountBalance { accountId, name, type
(CHECKING|CASH), active, balance, openingBalance }`. `accounts[]` traz cada conta que não é cartão (ativa ou inativa), com o saldo real e a flag `active`:

`balance = openingBalance + receitas PAID (paymentDate <= hoje) − despesas PAID da própria conta − saídas dos cartões vinculados`

As saídas de um cartão vinculado (`bank_account_id` = conta) são as despesas de cartão pagas individualmente
(`settled_by_payment_id` nulo, `paymentDate <= hoje`) mais os pagamentos de fatura (`paid_at <= hoje`). Itens
quitados por pagamento de fatura não entram (o pagamento já os cobre). Saídas de cartão sem vínculo somam em
`unlinkedCardPayments` e não debitam conta. `total` é a soma dos saldos apenas das contas **ativas**: conta
inativa continua em `accounts[]` (a tela de Contas lê o saldo dali), mas não entra no total; reativar volta a somar
(o saldo é derivado a cada chamada, sem estado gravado).

### Removido do contrato

`TransactionGroupInput.settled` e `Dashboard.balance`.

## Interface do saldo e do novo lançamento

- Painel: o seletor de mês é o primeiro elemento do conteúdo (acima do saldo); `gef-balance-panel` (saldo geral em
  destaque, uma linha por conta, toda conta inativa oculta (mesmo com saldo), estado "Nenhuma conta ativa" quando todas estão inativas, aviso de `unlinkedCardPayments`; sem o atalho
  "Gerenciar contas", removido em round 3) é carregado de `GET /balances` em separado do painel do mês, e trocar o
  mês recarrega só o painel do mês; o card "Saldo do mês"
  deixou de existir. Indicadores do mês: A pagar, Pago, Atrasado e A receber (`data-indicator="to-receive"`, sempre
  exibido) e o "Total do mês" como legenda.
- Cadastro de conta: "Saldo inicial (opcional)" só para conta bancária e dinheiro. O campo de valor continua sem
  sinal (só algarismos) e o sentido é escolhido à parte, "Positivo (tenho)" ou "Negativo (devendo)" (round 3); o
  saldo inicial negativo é enviado com sinal em `openingBalance` (string decimal, `-0.00` nunca é enviado) e uma
  conta com saldo inicial negativo abre com o valor absoluto e o sentido Negativo. Em contas existentes só é
  reenviado se o valor ou o sentido forem alterados.
- Tela de Contas: cada conta bancária ou de dinheiro mostra o saldo atual (`GET /balances`, com carga e erro
  independentes da lista; negativo com sinal, ícone e cor); cartão não mostra saldo.
- Receita em formulário: uma só data ("Data do recebimento"; fixo e parcelado: "Primeiro recebimento") que vale como
  `purchaseDate` e `firstDueDate`; cartão não é oferecido e, ao trocar a natureza com um cartão escolhido, a conta é
  trocada com aviso. Receita recebida de data passada ou de hoje mostra só Editar e Excluir; a antecipada (data
  futura) permite Desfazer.
- App: rascunho do novo lançamento em `gefinc:draft:quick-new` (sessionStorage), com a natureza; padrões de conta e
  categoria continuam por natureza e, em receita, ignoram cartões.


## Parcelamento de despesa no cartão (tela rápida e formulário completo)

- Sem mudança de contrato nem de banco: o servidor já gera as parcelas em `POST /transaction-groups` com
  `recurrenceType=INSTALLMENT` e `totalInstallments` (1 a 120). Cada parcela tem `dueDate` pela regra da fatura (compra
  até o dia de fechamento, inclusive, entra na fatura que fecha no mês; depois, na do mês seguinte; as demais parcelas
  vencem a cada mês seguinte) e `referenceMonth` = mês do vencimento; a fatura é a visão derivada por esse mês.
  O resto de centavos fica todo na primeira parcela. O contrato não aceita "valor da parcela".
- A interface recebe o valor da parcela (padrão na tela rápida) ou o total e envia sempre o total: no modo parcela,
  `totalAmount = valor × N` em centavos com `bigint` (`multiplyMoney`, `@gefinc/utils`), sem `firstDueDate` no cartão.
  No formulário completo o padrão continua sendo o total (`amountMode`: `TOTAL` | `INSTALLMENT`).
- Tela rápida (`/novo`): campo "Parcelas" (1x a 24x) só em despesa com cartão; trocar para receita ou conta não-cartão
  volta para 1x. O rascunho `gefinc:draft:quick-new` guarda também `installments` e `amountMode`; rascunho antigo
  abre em 1x e valor da parcela. Parcelamento fora do cartão fica no formulário completo. Sem limite de cartão nem juros.

## Regra de exclusão (contas e categorias)

Nenhuma chave estrangeira de conta ou categoria tem `ON DELETE CASCADE` (todas `NO ACTION`, compostas por
`(id, user_id)`): não há migração e o banco continua sendo a última barreira. A regra é aplicada no serviço, na mesma
transação da exclusão (com a conta travada por `findForUpdate`), e a interface sempre pede confirmação antes de enviar o `DELETE`.

- **Conta** só é excluída com 0 lançamentos, 0 grupos de lançamento, 0 pagamentos de fatura, 0 cartões vinculados e
  `openingBalance = 0`. Senão `409 ACCOUNT_IN_USE` (nunca `422`), com `transactionCount`, `invoicePaymentCount`,
  `linkedCardCount` e `hasOpeningBalance`. A alternativa é inativar (conta ativa). Conta inativa sem uso pode ser excluída.
- **Categoria** só é excluída com 0 lançamentos e 0 grupos. Senão `409 CATEGORY_IN_USE` com `transactionCount` e
  `groupCount`. **Não há mais reatribuição** (`reassignTo` foi removido); não existe categoria inativa nesta versão.
  Categorias iniciais também podem ser excluídas.
- Outro usuário: `404` (consulta por `id` e `user_id`), inclusive na prévia.
- Prévia: `GET /accounts/{id}/usage` (`AccountUsage`: `canDelete`, `transactionCount`, `invoicePaymentCount`,
  `linkedCards[{id,name}]`, `openingBalance`) e `GET /categories/{id}/usage` (`CategoryUsage`: `canDelete`,
  `transactionCount`, `groupCount`). A prévia só informa; o servidor refaz a checagem ao excluir e é a autoridade.
- Corrida: se um lançamento surgir entre a checagem e a exclusão, a violação de chave estrangeira também vira `409`.
- Outras ações destrutivas e a confirmação na interface: excluir lançamento (impacto em `GET /transaction-groups/{id}/impact`
  e `confirm=true`), "Encerrar aqui" (remove pendentes futuras), desfazer pagamento de fatura e descartar operação recusada da
  fila offline também passam por diálogo de confirmação. Desfazer pagamento de um item continua sem diálogo (reversível).
  Exclusões exigem conexão no app móvel: o `DELETE` nunca entra na fila offline.

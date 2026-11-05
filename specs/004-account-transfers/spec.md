# Feature Specification: Transferência de saldo entre contas

**Feature Branch**: `feat/account-transfers`
**Created**: 2026-11-04
**Status**: Implemented (aguardando revisão)
**Input**: "Preciso transferir dinheiro de uma conta para outra (por exemplo, sacar da conta bancária para a carteira de dinheiro) e ver os saldos de cada conta refletirem isso, sem que a transferência vire receita ou despesa."

## Contexto

Hoje o saldo de uma conta só muda por receitas recebidas, despesas pagas e pagamentos de fatura. Mover dinheiro entre as próprias
contas (da conta bancária para o dinheiro em espécie, de uma conta PF para outra, da PJ para a PF) obrigava a lançar uma despesa
numa conta e uma receita na outra, o que **distorce** o painel, os totais do mês, as categorias e o fluxo de caixa.

Esta feature acrescenta a **transferência**: um movimento único que tira o valor da conta de origem e o coloca na conta de destino.
Ela **não é receita nem despesa**: não aparece em lançamentos, categorias, "gasto do mês", fluxo de caixa, faturas nem vencimentos.
Só altera o **saldo por conta** (`GET /balances`).

As regras das features anteriores (parcelas, faturas, painel, offline, contas PF/PJ, cor, conta inativa fora do painel) continuam
valendo e **não mudam**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Transferir saldo entre duas contas (Priority: P1)

A pessoa escolhe a conta de origem, a de destino, o valor e a data (e, se quiser, uma descrição) e registra a transferência. Os
saldos das duas contas passam a refletir o movimento; a soma das duas, e o Saldo Geral entre contas ativas, não mudam.

**Why this priority**: É o valor central da feature; sem ela o usuário continua distorcendo receitas e despesas.

**Independent Test**: Com duas contas ativas, transferir R$ 250,00 da bancária para a carteira e conferir: origem -250, destino +250,
total inalterado, nenhum lançamento novo.

**Acceptance Scenarios**:

1. **Given** duas contas ativas (bancária ou dinheiro), **When** o usuário registra uma transferência de R$ 250,00 de hoje, **Then** o
   saldo da origem cai R$ 250,00, o do destino sobe R$ 250,00 e o Saldo Geral não muda.
2. **Given** o formulário, **When** o usuário escolhe a origem, **Then** o destino não oferece a própria origem; origem e destino nunca
   coincidem.
3. **Given** o formulário, **When** a origem ou o destino é um cartão de crédito, **Then** o cartão não é oferecido (pagar fatura é outro
   fluxo); se o cliente o enviar mesmo assim, o servidor recusa com erro no campo.
4. **Given** uma transferência com data futura, **When** o usuário a registra, **Then** ela aparece como **Agendada** e só entra nos
   saldos a partir da data.
5. **Given** uma transferência que deixaria a origem negativa, **When** o usuário preenche o formulário, **Then** a prévia **avisa**
   (ícone e texto) que o saldo ficará negativo, mas **não bloqueia** (mesma política das despesas).
6. **Given** uma conta inativa na origem ou no destino, **When** o usuário registra ou edita a transferência, **Then** o servidor
   recusa com `422 ACCOUNT_INACTIVE`.

---

### User Story 2 - Consultar, editar e excluir transferências (Priority: P2)

A pessoa abre a tela **Transferências**, vê as do mês (filtrando por conta), edita ou exclui uma delas. Excluir é **estornar**: os
saldos voltam ao que eram.

**Acceptance Scenarios**:

1. **Given** transferências em vários meses, **When** o usuário escolhe o mês e uma conta, **Then** a lista mostra as do mês em que a
   conta é origem ou destino, com "Transferência para X" / "Transferência de X" (ou "X para Y" sem filtro), valor, data e o selo
   Agendada.
2. **Given** uma transferência, **When** o usuário edita valor, contas, data ou descrição, **Then** os saldos refletem a nova
   situação; edição com versão desatualizada responde `409 STALE_VERSION`.
3. **Given** uma transferência de uma conta que depois foi inativada, **When** o usuário a **exclui**, **Then** a exclusão é
   permitida (estorno).
4. **Given** transferência de outro usuário, **When** consultada, editada ou excluída, **Then** a resposta é `404` (e conta de outro
   usuário, `404 "Conta não encontrada."`, igual à inexistente).

---

### User Story 3 - Contas com transferências não são excluídas (Priority: P3)

Uma conta que é origem ou destino de qualquer transferência não pode ser excluída; o app orienta inativá-la.

**Acceptance Scenarios**:

1. **Given** uma conta com 2 transferências, **When** o usuário tenta excluí-la, **Then** recebe `409 ACCOUNT_IN_USE` citando "2
   transferências" e a interface sugere **inativar**.
2. **Given** a tela Contas, **When** há menos de duas contas bancárias/de dinheiro ativas, **Then** o botão **Transferir** fica
   desabilitado com a explicação.

### Edge Cases

- Duas transferências simultâneas em sentidos opostos (A→B e B→A) não travam nem corrompem os saldos (contas travadas em ordem de id).
- Transferência simultânea à exclusão da conta: ou a conta é excluída e a transferência recebe `404`, ou a transferência vence e a
  exclusão recebe `409`; nunca resta linha órfã (chave estrangeira composta).
- Transferir para uma conta que depois foi inativada: a conta inativa mostra o saldo real em `accounts[]`, mas o `total` (só contas
  ativas) cai do valor transferido.
- Reenvio com a mesma `Idempotency-Key` (rede instável) não duplica a transferência.
- Sem conexão no app: criar, editar e excluir exigem conexão (sem fila); a lista do mês segue disponível da cópia local.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST registrar uma transferência como **uma única linha** (`account_transfers`), atômica por construção.
- **FR-002**: Origem e destino MUST ser contas `CHECKING` ou `CASH`, **ativas**, do usuário, e diferentes entre si. Cartão: `422` no
  campo `fromAccountId`/`toAccountId`. Origem = destino: `422` no campo `toAccountId`. Conta inativa: `422 ACCOUNT_INACTIVE`
  (criação e edição). Conta inexistente ou de outro usuário: `404` com a mesma mensagem.
- **FR-003**: O valor MUST ser maior que zero, com até 15 dígitos inteiros e 2 casas (`NUMERIC(19,2)`, `BigDecimal`); a descrição é
  opcional, aparada, vazia vira ausente, máximo de 120 caracteres; a data é obrigatória (passada, hoje ou futura).
- **FR-004**: O saldo por conta (`GET /balances`) MUST considerar as transferências com `transferDate <= hoje` (relógio do servidor):
  origem diminui, destino aumenta. Nada além de `/balances` muda: `/dashboard`, `/cashflow`, `/due-summary`, `/transactions` e as
  faturas permanecem **idênticos**.
- **FR-005**: Saldo insuficiente MUST ser permitido; o formulário mostra a prévia do saldo resultante das duas contas e avisa
  (ícone e texto) quando ficar negativo.
- **FR-006**: A transferência MUST poder ser editada (`PUT` completo com `version`, `409 STALE_VERSION`) e excluída (`DELETE` `204`;
  excluir é estornar, mesmo com conta inativa).
- **FR-007**: A resposta MUST trazer `scheduled` (data futura) e apenas ids de conta (sem junções).
- **FR-008**: Conta com transferência (origem ou destino) MUST NOT ser excluída: `AccountUsage.transferCount`, `canDelete` exige 0 e
  `409 ACCOUNT_IN_USE` cita "N transferência(s)"; a interface sugere inativar.
- **FR-009**: Criar e editar MUST travar as duas contas (`findForUpdate`) em ordem crescente de id.
- **FR-010**: `POST /transfers`, `PUT /transfers/{id}` e `DELETE /transfers/{id}` MUST aceitar `Idempotency-Key`.
- **FR-011**: Todo acesso MUST ser filtrado pelo `user_id` do token (Princípio III); valores e descrições MUST NOT aparecer em logs.
- **FR-012**: A interface MUST oferecer a página **Transferências** (web `/transfers`, app `/transferencias`, no menu "Mais"), o botão
  **Transferir** na tela de Contas e a ação **Transferir** por conta, tratando carregando, vazio e erro, em pt-BR e nos temas
  claro, escuro e vidro.
- **FR-013**: A listagem MUST ser paginada (`size` máximo 200; parâmetro inválido: `400`) sem consulta por linha.

### Key Entities

- **Transferência (`account_transfers`)**: usuário, conta de origem, conta de destino, valor, data, descrição opcional, versão,
  criação. Detalhes em `data-model.md`.
- **Saldo por conta**: derivado (saldo inicial + movimentos até hoje), sem estado gravado.

## Success Criteria *(mandatory)*

- **SC-001**: Após qualquer sequência de transferências, a soma dos saldos das contas ativas envolvidas é igual à de antes.
- **SC-002**: Os relatórios que não são `/balances` ficam **idênticos** (comparados como JSON) antes e depois de transferir.
- **SC-003**: Transferências simultâneas em sentidos opostos concluem sem deadlock, com saldos corretos.
- **SC-004**: O número de comandos SQL da listagem não cresce com a quantidade de transferências.

## Assumptions

- Transferência não é receita nem despesa e não entra em categorias, "gasto do mês", fluxo de caixa, faturas nem vencimentos.
- Sem status nem liquidação preguiçosa: a data decide se a transferência já conta no saldo.
- Offline: exige conexão (MVP); não há fila de operações para transferências.
- Moeda única (BRL); sem taxa, sem câmbio, sem transferência recorrente.
- A tabela nova não é listada no Princípio III da constituição (que cita `accounts`, `categories`, `transaction_groups` e
  `transactions`); a lista deve ser atualizada por emenda separada, decidida pelo mantenedor. O isolamento por `user_id` desta feature
  é testado independentemente (`TransferIsolationIT`).

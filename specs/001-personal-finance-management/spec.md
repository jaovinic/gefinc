# Feature Specification: Gestão Financeira Pessoal (GEFINC)

**Feature Branch**: `001-personal-finance-management`  
**Created**: 2026-10-22  
**Status**: Draft  
**Input**: User description: "@spec-genfic.md — plataforma integrada (web e mobile) para planejamento financeiro pessoal, controle orçamentário e rastreamento de receitas e despesas (fixas, variáveis e parceladas em cartões de crédito)"

## Clarifications

### Session 2026-10-22

- Q: Como o pagamento de cartão de crédito é registrado? → A: Individual e por fatura: o usuário pode marcar itens avulsos como pagos e também pagar a fatura, inclusive com um valor parcial qualquer, que é deduzido do total da fatura.
- Q: O parcelamento é permitido em contas que não são cartão de crédito? → A: Sim, em qualquer conta ou cartão; fora do cartão, as parcelas vencem mensalmente a partir da data de vencimento informada, sem regra de fechamento.
- Q: Em que mês um gasto entra no painel e na projeção? → A: Pelo vencimento: o gasto conta no mês em que vence (visão de caixa), para painel, projeção e saldo residual.
- Q: O usuário pode excluir a própria conta e os dados? → A: Sim, com carência: após confirmar com a senha, a conta e os dados ficam bloqueados por 30 dias e podem ser recuperados com um novo login; depois disso são apagados definitivamente.
- Q: A recuperação de senha por e-mail entra nesta versão? → A: Sim: o usuário pede a redefinição pelo e-mail cadastrado e recebe um link de uso único, com validade curta, para criar nova senha.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Acesso seguro aos meus dados financeiros (Priority: P1)

Uma pessoa cria sua conta no GEFINC com e-mail e senha, entra no sistema pela web ou pelo celular e permanece conectada de forma segura enquanto usa o aplicativo. Todos os dados financeiros que cadastrar são visíveis somente para ela.

**Why this priority**: Todo o produto depende de uma identidade por pessoa. Sem isso não há privacidade nem dados próprios, e nenhuma outra funcionalidade pode ser entregue com segurança.

**Independent Test**: Cadastrar dois usuários distintos, entrar com cada um e confirmar que cada um acessa apenas a si mesmo; encerrar a sessão e confirmar que o acesso aos dados é bloqueado.

**Acceptance Scenarios**:

1. **Given** uma pessoa sem cadastro, **When** informa e-mail válido e senha que atende às regras de segurança, **Then** a conta é criada e ela consegue entrar no sistema.
2. **Given** um usuário cadastrado, **When** informa e-mail e senha corretos, **Then** acessa sua área pessoal; **When** informa credenciais incorretas, **Then** o acesso é negado com mensagem genérica que não revela qual dado estava errado.
3. **Given** um usuário com sessão ativa por longo período, **When** a sessão de acesso expira, **Then** ela é renovada automaticamente sem exigir nova senha, enquanto a renovação for válida.
4. **Given** dois usuários com dados cadastrados, **When** um deles tenta acessar um registro do outro, **Then** o acesso é negado e nenhum dado do outro usuário é exibido.
5. **Given** um usuário no celular, **When** fecha e reabre o aplicativo, **Then** continua conectado sem expor suas credenciais.
6. **Given** um usuário autenticado, **When** solicita a exclusão da conta e confirma com a senha, **Then** a sessão é encerrada, qualquer requisição seguinte feita com as credenciais anteriores é recusada imediatamente, a conta fica bloqueada e o usuário é informado da data limite (30 dias) para desistir.
7. **Given** uma conta com exclusão solicitada há menos de 30 dias, **When** o usuário entra com e-mail e senha corretos, **Then** o sistema oferece cancelar a exclusão e, ao confirmar, todos os dados voltam como estavam.
8. **Given** uma conta com exclusão solicitada há 30 dias ou mais, **When** o prazo termina, **Then** todos os dados do usuário, inclusive o e-mail, são apagados definitivamente e o login deixa de ser possível.
9. **Given** a confirmação de exclusão, **When** o usuário informa a senha incorreta, **Then** a exclusão não é solicitada.
10. **Given** um usuário que esqueceu a senha, **When** informa seu e-mail cadastrado na opção de recuperação, **Then** recebe por e-mail um link de uso único, válido por 60 minutos, para criar nova senha.
11. **Given** um link de recuperação válido, **When** o usuário define uma nova senha que atende às regras de segurança, **Then** a senha é alterada, o link deixa de funcionar e as sessões anteriores são encerradas imediatamente, inclusive credenciais de acesso ainda não expiradas.
12. **Given** um link de recuperação já usado ou expirado, **When** o usuário tenta usá-lo, **Then** o sistema recusa e orienta a solicitar um novo link.
13. **Given** um e-mail que não pertence a nenhuma conta, **When** alguém solicita a recuperação, **Then** o sistema exibe a mesma mensagem de sucesso, sem revelar se o e-mail existe.

---

### User Story 2 - Cadastrar contas bancárias, dinheiro e cartões de crédito (Priority: P2)

O usuário cadastra os meios de pagamento que usa: contas bancárias, dinheiro em espécie e um ou mais cartões de crédito. Para cada cartão informa o dia de fechamento e o dia de vencimento da fatura.

**Why this priority**: Todo lançamento precisa estar associado a uma conta ou cartão. É a base para lançamentos e projeções.

**Independent Test**: Cadastrar uma conta corrente, uma carteira de dinheiro e um cartão com dias de fechamento e vencimento, editar e consultar a lista; entrega valor por si só como inventário dos meios de pagamento.

**Acceptance Scenarios**:

1. **Given** um usuário autenticado, **When** cadastra uma conta bancária ou dinheiro em espécie informando nome e tipo, **Then** o item aparece na sua lista de contas.
2. **Given** um usuário autenticado, **When** cadastra um cartão de crédito sem informar dia de fechamento ou dia de vencimento, **Then** o cadastro é recusado indicando os campos obrigatórios.
3. **Given** um cartão cadastrado, **When** o usuário altera o dia de fechamento ou vencimento, **Then** as novas datas valem para compras registradas dali em diante e para as ocorrências fixas pendentes com vencimento futuro; parcelas e compras avulsas já registradas, itens pagos e faturas com pagamento registrado mantêm suas datas.
4. **Given** uma conta com lançamentos associados, **When** o usuário tenta excluí-la, **Then** o sistema impede a exclusão ou oferece inativá-la, preservando o histórico.
5. **Given** um dia de fechamento ou vencimento fora do intervalo 1 a 31, **When** o usuário tenta salvar, **Then** o sistema recusa o valor.
6. **Given** uma assinatura fixa pendente no cartão, com vencimento futuro e sem pagamento na fatura, **When** o usuário altera o dia de vencimento do cartão, **Then** as próximas ocorrências passam a vencer no novo dia.
7. **Given** uma conta inativa, **When** o usuário tenta registrar um novo lançamento nela, **Then** o sistema recusa e orienta a reativar a conta.
8. **Given** um cartão inativo com uma assinatura fixa e uma fatura pendente, **When** o sistema gera as ocorrências do mês seguinte, **Then** nenhuma nova ocorrência é criada para esse cartão; **When** o usuário paga a fatura pendente, **Then** o pagamento é aceito.

---

### User Story 3 - Registrar receitas e despesas fixas e avulsas, com categorias e status (Priority: P3)

O usuário registra receitas e despesas **fixas** (recorrentes todo mês, como salário, mensalidade e internet) e **variáveis/avulsas** (compras pontuais). Cada lançamento tem descrição ou loja, categoria, conta ou cartão, valor, data da compra, data de vencimento e status (pendente ou pago). Ele pode criar e editar categorias de receita e de despesa e marcar lançamentos como pagos.

**Why this priority**: É o núcleo do controle financeiro: sem lançamentos não há o que projetar nem o que mostrar no painel.

**Independent Test**: Cadastrar um salário fixo, uma despesa fixa e uma compra avulsa, classificá-los em categorias, marcar um como pago e conferir a lista por mês; já entrega o controle básico de receitas e despesas.

**Acceptance Scenarios**:

1. **Given** um usuário com ao menos uma conta, **When** registra uma compra avulsa com descrição, categoria, conta, valor, data da compra e vencimento, **Then** o lançamento aparece no mês do vencimento com status pendente.
2. **Given** um lançamento fixo mensal, **When** o usuário o cria, **Then** ele passa a aparecer em cada mês subsequente, sem precisar ser recadastrado, até o usuário encerrá-lo.
3. **Given** um lançamento pendente, **When** o usuário o marca como pago informando a data de pagamento, **Then** o status muda para pago e ele passa a contar em "Total Pago".
4. **Given** um lançamento pago, **When** o usuário reverte o pagamento, **Then** volta ao status pendente e a data de pagamento é removida.
5. **Given** um lançamento fixo, **When** o usuário altera o valor a partir de determinado mês, **Then** os meses anteriores permanecem inalterados.
6. **Given** uma categoria em uso, **When** o usuário tenta excluí-la, **Then** o sistema exige reatribuir os lançamentos ou impede a exclusão.
7. **Given** o usuário informa valor zero, negativo ou data inválida, **When** tenta salvar, **Then** o sistema recusa com mensagem clara.
8. **Given** um cartão com fechamento no dia 10 e vencimento no dia 17, **When** o usuário registra uma compra avulsa no dia 12, **Then** o vencimento é calculado pelo sistema para o dia 17 do mês seguinte e o usuário não precisa informá-lo.
9. **Given** uma assinatura fixa mensal no mesmo cartão, com data de compra no dia 5, **When** o sistema gera as ocorrências, **Then** cada uma vence no dia 17 do mesmo mês da respectiva competência.

---

### User Story 4 - Registrar compras parceladas com projeção automática (Priority: P4)

O usuário registra uma compra ou obrigação dividida em N parcelas, em um cartão de crédito ou em qualquer outra conta (por exemplo carnê ou financiamento pago pela conta corrente). O sistema gera automaticamente cada parcela, mês a mês, até a quitação; no cartão, respeita o fechamento e o vencimento da fatura; nas demais contas, as parcelas vencem mensalmente a partir da data de vencimento informada.

**Why this priority**: Parcelamento no cartão é a principal fonte de comprometimento futuro de renda e o diferencial do produto. Depende das contas (US2) e dos lançamentos (US3).

**Independent Test**: Registrar uma compra de R$ 1.000,00 em 3 parcelas num cartão e verificar que existem 3 parcelas com datas de vencimento nos meses corretos e soma exata de R$ 1.000,00.

**Acceptance Scenarios**:

1. **Given** um cartão com fechamento no dia 10 e vencimento no dia 17, **When** o usuário registra uma compra de R$ 100,00 em 4 parcelas no dia 5, **Then** são geradas 4 parcelas de R$ 25,00, a primeira na fatura que vence no dia 17 do mesmo mês.
2. **Given** o mesmo cartão, **When** a compra ocorre no dia 12 (após o fechamento), **Then** a primeira parcela vai para a fatura que vence no mês seguinte.
3. **Given** uma compra de R$ 100,00 em 3 parcelas, **When** as parcelas são geradas, **Then** a soma é exatamente R$ 100,00 (por exemplo 33,34 + 33,33 + 33,33), com a diferença de centavos aplicada na primeira parcela.
4. **Given** uma compra parcelada com parcelas já pagas, **When** o usuário marca a parcela 2 como paga, **Then** apenas essa parcela muda de status e as demais permanecem pendentes.
5. **Given** uma compra parcelada, **When** o usuário a exclui, **Then** o sistema pede confirmação e remove as parcelas pendentes, preservando as já pagas ou informando claramente o que será removido.
6. **Given** uma compra com 1 parcela, **When** registrada, **Then** é tratada como uma parcela única sem erro.
7. **Given** uma conta corrente, **When** o usuário registra um carnê de R$ 300,00 em 3 parcelas com primeiro vencimento em 10/11, **Then** são geradas 3 parcelas de R$ 100,00 vencendo em 10/11, 10/12 e 10/01, sem aplicação de regra de fechamento.

---

### User Story 5 - Projetar e pagar faturas e ver o saldo residual (Priority: P5)

O usuário consulta, por cartão e por mês, quanto já está comprometido em faturas futuras, e vê o saldo residual previsto de cada mês (receitas previstas menos despesas previstas). Ele também registra o pagamento de uma fatura, no valor total ou em qualquer valor parcial, que é deduzido do total da fatura.

**Why this priority**: Entrega o planejamento financeiro, objetivo central do produto, e se apoia nos lançamentos e parcelas já existentes.

**Independent Test**: Com um salário fixo, despesas fixas e uma compra parcelada cadastrados, abrir a projeção dos próximos meses e conferir que o total por fatura e o saldo residual correspondem à soma manual dos lançamentos.

**Acceptance Scenarios**:

1. **Given** parcelas distribuídas em vários meses num cartão, **When** o usuário abre a projeção de faturas, **Then** vê o total de cada fatura futura daquele cartão e o total já comprometido.
2. **Given** receitas e despesas previstas num mês, **When** consulta o saldo residual, **Then** o valor exibido é igual ao total de receitas previstas menos o total de despesas previstas do mês.
3. **Given** um mês sem lançamentos, **When** o usuário consulta a projeção, **Then** vê valores zerados em vez de erro.
4. **Given** o usuário altera ou paga um lançamento, **When** reabre a projeção, **Then** os totais refletem a mudança imediatamente.
5. **Given** despesas superiores às receitas previstas, **When** o saldo residual é calculado, **Then** o valor negativo é exibido de forma destacada.
6. **Given** uma fatura de R$ 1.000,00 totalmente pendente, **When** o usuário registra um pagamento de R$ 300,00, **Then** a fatura passa a mostrar R$ 300,00 pagos e R$ 700,00 restantes, e os itens da fatura continuam pendentes.
7. **Given** uma fatura com saldo restante, **When** o usuário escolhe pagar a fatura pelo valor restante total, **Then** todos os itens pendentes da fatura passam para pago e o saldo restante fica zerado.
8. **Given** uma fatura com saldo restante de R$ 700,00, **When** o usuário tenta registrar um pagamento de R$ 800,00, **Then** o sistema recusa e informa o saldo restante.
9. **Given** uma fatura com pagamentos parciais registrados, **When** o usuário desfaz um deles, **Then** o valor volta ao saldo restante da fatura.
10. **Given** uma fatura em que o usuário já marcou um item de R$ 100,00 como pago individualmente, **When** consulta a fatura, **Then** o saldo restante já considera esses R$ 100,00 como pagos.

---

### User Story 6 - Acompanhar a situação do mês em um painel (Priority: P6)

O usuário abre um painel com os indicadores do mês: Total do Mês, Total a Vencer e Total Pago, além de um gráfico de gastos por categoria e da distribuição dos gastos por cartão.

**Why this priority**: Resume visualmente a saúde financeira; é valioso, mas depende de todos os dados anteriores.

**Independent Test**: Com lançamentos pagos e pendentes em várias categorias e cartões, abrir o painel e conferir cada indicador e gráfico contra os dados cadastrados.

**Acceptance Scenarios**:

1. **Given** lançamentos pagos e pendentes no mês, e pagamentos parciais de faturas, **When** o usuário abre o painel, **Then** "Total Pago" soma os itens pagos e os pagamentos parciais de fatura, "Total a Vencer" soma o que ainda resta pendente e não vencido, e "Total do Mês" soma todas as despesas que vencem no mês.
2. **Given** uma compra no cartão feita em 05/11 após o fechamento, com vencimento em 17/12, **When** o usuário abre o painel de novembro e o de dezembro, **Then** a compra aparece somente no painel de dezembro, que é o mês do vencimento.
3. **Given** despesas em várias categorias, **When** o painel é exibido, **Then** o gráfico mostra a participação de cada categoria no total, usando a cor da categoria.
4. **Given** despesas em mais de um cartão, **When** o painel é exibido, **Then** a distribuição por cartão mostra quanto cada cartão representa.
5. **Given** o usuário escolhe outro mês, **When** o painel é atualizado, **Then** todos os indicadores e gráficos correspondem ao mês escolhido.
6. **Given** um mês sem dados, **When** o painel é aberto, **Then** exibe estado vazio com orientação para cadastrar o primeiro lançamento.
7. **Given** uma fatura que vence em dezembro com pagamento parcial de R$ 300,00 registrado em novembro, **When** o usuário abre o painel de novembro e o de dezembro, **Then** os R$ 300,00 aparecem em "Total Pago" somente em dezembro, e itens quitados por pagamentos de fatura não são somados duas vezes.

---

### User Story 7 - Lançar uma despesa rapidamente pelo celular (Priority: P7)

No aplicativo móvel, o usuário registra uma despesa do dia a dia em poucos toques, sem navegar por telas complexas.

**Why this priority**: Melhora a adesão do hábito de registrar; é uma otimização de experiência sobre o fluxo já existente do US3.

**Independent Test**: A partir da tela inicial do aplicativo móvel, concluir o registro de uma despesa e contar os toques necessários.

**Acceptance Scenarios**:

1. **Given** o usuário na tela inicial do aplicativo móvel, **When** registra uma despesa avulsa, **Then** consegue concluir em no máximo 3 toques, usando conta, categoria e data padrão ou últimas utilizadas.
2. **Given** o registro rápido, **When** o usuário precisa mudar categoria, conta ou data, **Then** pode ajustá-los sem sair do fluxo.
3. **Given** dados obrigatórios ausentes, **When** o usuário tenta salvar, **Then** o sistema indica o que falta sem perder o que já foi preenchido.

---

### Edge Cases

- Cartão com dia de fechamento ou vencimento 29, 30 ou 31 em meses mais curtos: o sistema usa o último dia do mês.
- Compra feita exatamente no dia de fechamento: regra definida e consistente (a compra do dia de fechamento entra na fatura corrente, conforme Assumptions).
- Dia de vencimento anterior ao dia de fechamento (ex.: fecha dia 25, vence dia 5): o vencimento ocorre no mês seguinte ao fechamento.
- Parcelas que atravessam a virada de ano: as datas continuam corretas.
- Divisão com resto de centavos: a soma das parcelas é sempre exatamente o valor total; todo o resto fica na primeira parcela.
- Alteração de valor ou exclusão de uma compra parcelada com parcelas já pagas.
- Lançamento fixo que precisa ser encerrado ou ter o valor alterado em determinado mês.
- Lançamento fixo em cartão com data de compra depois do dia de fechamento: a ocorrência vai para a fatura do mês seguinte.
- Cartão com dias alterados no meio do mês: a fatura do mês continua única e exibe o vencimento mais recente entre seus itens; cada item mantém a própria data para efeito de atraso.
- Exclusão de conta, cartão ou categoria que possua lançamentos.
- Usuário tenta acessar ou alterar registro de outro usuário (deve ser negado).
- Sessão expirada ou renovação inválida durante o uso: o usuário é conduzido ao login sem perder dados não enviados.
- Falha de conexão ao salvar um lançamento no celular: o usuário é informado e não perde o que digitou.
- Dois dispositivos do mesmo usuário alterando o mesmo lançamento quase ao mesmo tempo: o segundo a salvar recebe aviso de conflito e vê a versão atual do registro antes de decidir.
- Várias solicitações seguidas de recuperação de senha para o mesmo e-mail: apenas o link mais recente é válido, e excedido o limite de solicitações o sistema pede para aguardar.
- E-mail de recuperação não entregue ou atrasado: o usuário pode solicitar novo link após o intervalo mínimo.
- Novo cadastro com o e-mail de uma conta em período de carência de exclusão: o sistema recusa, informando que o e-mail está em uso, até que a exclusão seja concluída ou cancelada.
- Usuário com exclusão pendente tenta usar o aplicativo móvel já conectado: o acesso é negado e ele é conduzido ao login, que oferece cancelar a exclusão.
- Credencial de acesso emitida antes do pedido de exclusão ou da troca de senha e usada logo em seguida: a requisição é recusada.
- Pagamento parcial registrado e, depois, uma compra adicionada ou removida na mesma fatura: o saldo restante é recalculado, e nunca pode ficar negativo (pagamentos acima do novo total exigem ajuste).
- Pagamento desfeito depois de a fatura ter sido quitada: os itens que foram marcados como pagos pela quitação voltam a ficar pendentes, e os marcados individualmente pelo usuário permanecem pagos.
- Pagamento parcial com valor zero, negativo ou com mais de duas casas decimais: o sistema recusa.
- Valores muito altos, com casas decimais excedentes ou texto em campos numéricos.

## Requirements *(mandatory)*

### Functional Requirements

**Acesso e privacidade**

- **FR-001**: O sistema MUST permitir que uma pessoa crie uma conta com e-mail e senha, recusando e-mails já cadastrados ou inválidos e senhas fora das regras de segurança.
- **FR-002**: O sistema MUST permitir login e logout, mantendo a sessão ativa sem exigir novo login a cada acesso, e MUST renovar a sessão automaticamente enquanto a renovação for válida, além de limitar tentativas de login que falharam (5 por e-mail e 20 por IP em 15 minutos, com resposta `429` e `Retry-After`).
- **FR-003**: O sistema MUST armazenar senhas de forma irreversível e MUST NOT exibir senhas ou credenciais em mensagens, telas ou registros de log.
- **FR-004**: O sistema MUST garantir que cada usuário acesse, liste, altere e exclua somente os próprios dados (contas, categorias, lançamentos).
- **FR-005**: O sistema MUST manter a sessão do aplicativo móvel em armazenamento seguro do dispositivo.
- **FR-006**: Usuários MUST poder recuperar o acesso solicitando a redefinição de senha pelo e-mail cadastrado; o sistema MUST enviar um link de uso único com validade de 60 minutos, invalidar o link após o uso ou a expiração e encerrar imediatamente as sessões anteriores, inclusive as credenciais de acesso ainda não expiradas, quando a senha for alterada.
- **FR-007**: A solicitação de recuperação MUST apresentar a mesma resposta para e-mails cadastrados e não cadastrados, e MUST limitar a quantidade de solicitações por e-mail em um período, para evitar abuso.
- **FR-008**: Usuários MUST poder solicitar a exclusão da própria conta e de todos os seus dados, confirmando com a senha; ao solicitar, o sistema MUST encerrar imediatamente as sessões ativas, inclusive as credenciais de acesso ainda não expiradas, e bloquear o acesso aos dados.
- **FR-009**: Durante 30 dias após a solicitação, o sistema MUST permitir que o usuário cancele a exclusão ao entrar com suas credenciais, restaurando o acesso a todos os dados sem perdas.
- **FR-010**: Decorridos 30 dias sem cancelamento, o sistema MUST apagar definitivamente todos os dados do usuário, inclusive o e-mail, sem possibilidade de recuperação.

**Contas e cartões**

- **FR-011**: Usuários MUST poder cadastrar, editar, listar e inativar contas dos tipos conta bancária, dinheiro em espécie e cartão de crédito; contas inativas MUST NOT receber novos lançamentos nem novas ocorrências de lançamentos fixos (as ocorrências já geradas permanecem), mas suas faturas pendentes continuam podendo ser pagas.
- **FR-012**: Para cartões de crédito, o sistema MUST exigir dia de fechamento e dia de vencimento da fatura, ambos entre 1 e 31.
- **FR-013**: O sistema MUST impedir a exclusão definitiva de conta ou cartão com lançamentos, oferecendo a inativação para preservar o histórico.
- **FR-014**: Ao alterar os dias de fechamento ou vencimento de um cartão, o sistema MUST recalcular o vencimento das ocorrências de lançamentos fixos que estejam pendentes, com vencimento posterior a hoje, desde que o novo vencimento calculado também seja posterior a hoje e a fatura de origem e a de destino não tenham pagamento registrado. As demais ocorrências MUST manter suas datas.

**Categorias**

- **FR-015**: Usuários MUST poder criar, editar e excluir categorias do tipo receita ou despesa, com nome e cor, e o sistema MUST oferecer um conjunto inicial de categorias comuns.
- **FR-016**: O sistema MUST impedir a exclusão de categoria em uso ou exigir a reatribuição dos lançamentos.
  *(Atualizado na feature 003: a categoria em uso é sempre bloqueada (`409 CATEGORY_IN_USE`); a reatribuição em massa foi removida. Ver `specs/003-bank-accounts-ui-redesign/data-model.md`, "Regra de exclusão".)*

**Lançamentos**

- **FR-017**: Usuários MUST poder registrar receitas e despesas dos tipos fixo (recorrência mensal), variável/avulso e parcelado.
- **FR-018**: Cada lançamento MUST registrar descrição ou loja, categoria, conta ou cartão, valor total, quantidade de parcelas, valor da parcela, data da compra, data de vencimento e status (pendente ou pago).
- **FR-019**: O sistema MUST permitir marcar lançamentos individuais como pagos, com data de pagamento, e reverter o pagamento para pendente, inclusive itens de cartão de crédito.
- **FR-020**: Lançamentos fixos MUST se repetir mensalmente sem novo cadastro até o usuário encerrá-los, e alterações de valor MUST valer apenas a partir do mês indicado.
- **FR-021**: Para compras parceladas, o sistema MUST gerar automaticamente todas as parcelas, uma por mês, até a quitação.
- **FR-022**: Para cartões de crédito, o sistema MUST calcular a data de vencimento de cada lançamento (parcela, compra avulsa ou ocorrência de lançamento fixo) a partir do dia de fechamento e do dia de vencimento, sem que o usuário informe o vencimento: compras feitas após o fechamento entram na fatura seguinte, e cada ocorrência fixa é tratada como compra na data de compra do mês correspondente.
- **FR-023**: O sistema MUST permitir parcelamento em qualquer conta ou cartão; fora do cartão de crédito, as parcelas MUST vencer mensalmente a partir da data de vencimento informada, usando o último dia do mês quando o dia não existir.
- **FR-024**: A soma das parcelas MUST ser exatamente igual ao valor total da compra, com o resto de centavos aplicado à primeira parcela.
- **FR-025**: Usuários MUST poder editar e excluir lançamentos; ao alterar ou excluir uma compra parcelada, o sistema MUST informar o efeito sobre as parcelas já pagas e pedir confirmação.
- **FR-026**: O sistema MUST validar os dados dos lançamentos (valor maior que zero, datas válidas, campos obrigatórios) e apresentar mensagens claras em português.
- **FR-027**: Usuários MUST poder listar e filtrar lançamentos por mês, conta/cartão, categoria, tipo e status.

**Projeção e painel**

- **FR-028**: O sistema MUST exibir a projeção de faturas futuras por cartão, com o total comprometido em cada mês futuro.
- **FR-029**: O sistema MUST calcular o saldo residual de cada mês como total de receitas previstas menos total de despesas previstas.
- **FR-030**: O sistema MUST exibir um painel mensal com Total do Mês, Total a Vencer e Total Pago, gráfico de gastos por categoria e distribuição por cartão.
- **FR-031**: Painel, projeção de faturas e saldo residual MUST atribuir cada lançamento ao mês da sua data de vencimento, e não ao mês da data da compra.
- **FR-032**: Projeções, saldos e painel MUST refletir imediatamente qualquer criação, alteração, pagamento ou exclusão de lançamentos.
- **FR-033**: Valores monetários MUST ser exibidos em reais (R$) com duas casas decimais e datas no formato brasileiro.

**Pagamento de faturas de cartão**

- **FR-034**: Usuários MUST poder registrar o pagamento de uma fatura de cartão informando um valor maior que zero, respeitado o limite do saldo restante (FR-038), e a data do pagamento.
- **FR-035**: O sistema MUST deduzir cada pagamento do total da fatura, exibindo para cada fatura o total, o valor pago e o saldo restante; o valor pago considera os pagamentos de fatura somados aos itens marcados individualmente como pagos.
- **FR-036**: Pagamentos parciais MUST NOT alterar o status individual dos itens da fatura; quando o saldo restante chegar a zero, o sistema MUST marcar todos os itens pendentes da fatura como pagos.
- **FR-037**: Usuários MUST poder usar a ação "pagar fatura" pelo saldo restante total e MUST poder desfazer pagamentos de fatura já registrados, restaurando o saldo restante.
- **FR-038**: O sistema MUST recusar pagamentos de fatura acima do saldo restante e MUST manter o saldo restante da fatura sempre maior ou igual a zero.
- **FR-039**: Os pagamentos de fatura MUST ser considerados nos indicadores "Total Pago" e "Total a Vencer" do painel e na projeção de faturas, atribuídos ao mês do vencimento da fatura e sem contar duas vezes os itens quitados por eles.

**Experiência por plataforma**

- **FR-040**: A versão web MUST priorizar a visualização tabular e analítica adequada a telas de desktop.
- **FR-041**: O aplicativo móvel MUST permitir registrar uma despesa avulsa a partir da tela inicial em no máximo 3 toques.
- **FR-042**: A interface MUST estar em português do Brasil e MUST apresentar estados de carregamento, vazio e erro.

### Key Entities *(include if feature involves data)*

- **Usuário**: Pessoa que utiliza o sistema. Possui e-mail, senha protegida, data de criação e, se houver, a data de solicitação de exclusão da conta. É dono de todas as contas, categorias e lançamentos.
- **Conta**: Meio de pagamento do usuário. Possui nome, tipo (conta bancária, dinheiro ou cartão de crédito) e situação (ativa ou inativa). Cartões possuem dia de fechamento e dia de vencimento da fatura.
- **Categoria**: Classificação de receitas ou despesas, com nome, tipo (receita ou despesa) e cor. Pertence a um usuário.
- **Grupo de Lançamento**: Agrupa lançamentos de uma mesma origem. Possui descrição, tipo de recorrência (fixo, variável ou parcelado), quantidade de parcelas e valor total. Uma compra parcelada ou uma despesa fixa é um grupo com vários lançamentos.
- **Lançamento**: Ocorrência individual (uma parcela ou uma competência mensal). Pertence a um grupo, a uma conta e a uma categoria; possui número da parcela, valor, data de vencimento, data de pagamento e status (pendente ou pago).
- **Fatura (projeção)**: Visão derivada: total dos lançamentos de um cartão que vencem em determinado mês, com valor pago e saldo restante. Não é cadastrada pelo usuário.
- **Pagamento de Fatura**: Registro do usuário de um pagamento total ou parcial de uma fatura. Possui cartão, mês da fatura, valor e data do pagamento; pode ser desfeito. Seu valor é deduzido do total da fatura.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um novo usuário consegue criar a conta, cadastrar um cartão e registrar a primeira despesa em menos de 5 minutos.
- **SC-002**: No celular, uma despesa avulsa é registrada em no máximo 3 toques a partir da tela inicial, em 100% dos testes de usabilidade.
- **SC-003**: Em 100% dos casos testados de compras parceladas, a soma das parcelas é exatamente igual ao valor total e cada parcela cai na fatura correta conforme fechamento e vencimento do cartão.
- **SC-004**: Totais da projeção de faturas, do saldo residual e do painel, incluindo o saldo restante de faturas com pagamentos parciais, coincidem em 100% com o cálculo manual dos mesmos lançamentos e pagamentos.
- **SC-005**: Nenhum usuário consegue visualizar ou alterar dados de outro usuário em qualquer teste de acesso indevido.
- **SC-006**: O painel mensal e a projeção são exibidos em até 2 segundos para um usuário com 5 anos de histórico (cerca de 6.000 lançamentos).
- **SC-007**: Pelo menos 90% dos usuários de teste conseguem concluir, na primeira tentativa e sem ajuda, o registro de uma compra parcelada.
- **SC-008**: O sistema suporta ao menos 1.000 usuários utilizando-o simultaneamente sem perda perceptível de desempenho.
- **SC-009**: Em 100% das contas com exclusão solicitada e não cancelada, nenhum dado do usuário permanece acessível após 30 dias.

## Assumptions

- O produto atende a pessoas físicas, cada uma com seus próprios dados; não há compartilhamento de contas entre usuários nem perfis familiares nesta versão.
- A moeda é exclusivamente o real brasileiro (BRL), sem conversão cambial, e o idioma é português do Brasil.
- O cadastro é feito por e-mail e senha, sem login social; a recuperação de senha depende de um serviço de envio de e-mail disponível ao sistema.
- Política de senha: no mínimo 10 caracteres e no máximo 72 bytes (UTF-8). A recuperação de senha aceita no máximo 3 solicitações por hora por e-mail.
- Compras no cartão feitas até o dia de fechamento (inclusive) entram na fatura corrente; compras posteriores entram na fatura seguinte.
- Quando o dia de vencimento é menor ou igual ao de fechamento, a fatura vence no mês seguinte ao fechamento.
- Meses sem o dia configurado (29, 30 ou 31) usam o último dia do mês.
- Lançamentos fixos são projetados para os próximos 12 meses a partir do mês corrente e continuam sendo gerados enquanto não forem encerrados.
- "Total a Vencer" considera o valor ainda pendente (já descontados itens pagos e pagamentos parciais de fatura) com vencimento a partir de hoje no mês; valores pendentes já vencidos são sinalizados como atrasados.
- Pagamentos de fatura não exigem escolha da conta de origem do dinheiro nesta versão; não há controle de saldo bancário das contas.
- O sistema não se integra a bancos nem a operadoras de cartão; todos os dados são informados manualmente pelo usuário.
- Importação e exportação de dados, orçamentos por categoria, metas e notificações ficam fora do escopo desta versão.
- O aplicativo móvel exige conexão com a internet; uso totalmente offline fica fora do escopo.
- Decisões de tecnologia (linguagens, frameworks, banco de dados e organização do repositório) estão registradas na constituição do projeto e no `spec-genfic.md` e serão tratadas na fase de planejamento.

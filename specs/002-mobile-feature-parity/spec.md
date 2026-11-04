# Feature Specification: Paridade de funcionalidades nos aplicativos Android e iOS

**Feature Branch**: `002-mobile-feature-parity`
**Created**: 2026-10-22
**Status**: Draft
**Input**: User description: "Implemente todas as funcionalidades WEB nos APPs Android e iOS."

## Contexto

Hoje o aplicativo móvel oferece apenas entrar, criar conta, o resumo do mês e o lançamento rápido de despesa. Todo o restante do GEFINC (contas e cartões, categorias, lista e cadastro completo de lançamentos, faturas, projeção, fluxo de caixa, painel com gráficos e exclusão de conta) só existe na versão web. Esta feature leva ao celular **todas** as funções da versão web, com uma interface pensada para telas pequenas e toque, no Android e no iOS, e acrescenta o que é próprio do celular: uso sem internet, desbloqueio por biometria e lembretes de vencimento. As regras de negócio não mudam: os requisitos da feature `001-personal-finance-management` continuam valendo e esta feature só define como elas passam a estar disponíveis no celular.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gerenciar contas, cartões e categorias pelo celular (Priority: P1)

A pessoa abre o aplicativo, navega por um menu principal que dá acesso a todas as áreas do sistema e cadastra, edita e inativa suas contas, cartões de crédito e categorias sem precisar do computador.

**Why this priority**: Contas, cartões e categorias são pré-requisito de todo lançamento. Sem eles no celular, quem nunca usou o web não consegue começar a usar o aplicativo, e o menu principal é a porta de entrada para todas as outras áreas.

**Independent Test**: Com um usuário novo e vazio, usando só o aplicativo, criar uma conta bancária, um cartão (com dias de fechamento e vencimento) e uma categoria própria, editar cada um, inativar a conta e conferir que os dados aparecem iguais na versão web.

**Acceptance Scenarios**:

1. **Given** o usuário autenticado no aplicativo, **When** abre o menu principal, **Then** encontra acesso a Painel, Lançamentos, Contas e cartões, Faturas, Fluxo de caixa, Categorias e Minha conta.
2. **Given** a área de contas e cartões, **When** o usuário cria um cartão de crédito informando nome, dia de fechamento e dia de vencimento válidos, **Then** o cartão aparece na lista e pode ser escolhido nos lançamentos.
3. **Given** um cartão com dia de fechamento ou vencimento fora de 1 a 31, **When** o usuário tenta salvar, **Then** o aplicativo indica o campo inválido em português e mantém o que já foi digitado.
4. **Given** uma conta com lançamentos, **When** o usuário tenta excluí-la, **Then** o aplicativo oferece apenas a inativação e explica o motivo.
5. **Given** a área de categorias, **When** o usuário cria, renomeia ou muda a cor de uma categoria, **Then** a mudança aparece nos lançamentos e no painel.
6. **Given** uma categoria em uso, **When** o usuário tenta excluí-la, **Then** o aplicativo impede a exclusão ou exige a reatribuição dos lançamentos, como na versão web.
7. **Given** a mudança dos dias de um cartão, **When** o usuário salva, **Then** o aplicativo informa que apenas ocorrências fixas pendentes e futuras serão recalculadas, igual à versão web.

---

### User Story 2 - Registrar e acompanhar lançamentos completos pelo celular (Priority: P2)

A pessoa lista seus lançamentos do mês, filtra, cria receitas e despesas dos tipos avulso, fixo e parcelado, edita, marca como pago, desfaz o pagamento e exclui, tudo pelo aplicativo. O lançamento rápido de despesa continua disponível com no máximo 3 toques.

**Why this priority**: É o uso diário do sistema. Depende das contas e categorias (P1) e entrega o maior valor depois delas.

**Independent Test**: Com contas e categorias já criadas, cadastrar uma despesa avulsa, uma fixa e uma compra parcelada no cartão, conferir as parcelas e vencimentos, pagar e desfazer um item, alterar o valor de uma fixa a partir de um mês, encerrá-la e excluir um lançamento, comparando o resultado com a versão web.

**Acceptance Scenarios**:

1. **Given** a lista de lançamentos, **When** o usuário escolhe um mês e aplica filtros por conta ou cartão, categoria, tipo e status, **Then** vê apenas os lançamentos correspondentes, com valor em reais e data no formato brasileiro.
2. **Given** o cadastro de lançamento, **When** o usuário escolhe o tipo parcelado informando valor total e quantidade de parcelas, **Then** vê a prévia de todas as parcelas com vencimento e valor (a soma fecha exatamente o total) antes de salvar.
3. **Given** um lançamento fixo, **When** o usuário altera o valor a partir de um mês, **Then** só os meses dali em diante mudam; ao encerrar o lançamento, as ocorrências futuras pendentes deixam de existir.
4. **Given** uma ocorrência pendente, **When** o usuário a marca como paga informando a data, **Then** ela passa a paga, e ao desfazer volta a pendente, inclusive itens de cartão.
5. **Given** uma compra parcelada com parcelas já pagas, **When** o usuário altera ou exclui, **Then** o aplicativo informa o efeito sobre as parcelas pagas e pede confirmação antes de excluir.
6. **Given** a tela inicial do aplicativo, **When** o usuário registra uma despesa avulsa usando conta, categoria e data padrão ou as últimas usadas, **Then** conclui em no máximo 3 toques.
7. **Given** dados obrigatórios ausentes ou valor menor ou igual a zero, **When** o usuário tenta salvar, **Then** o aplicativo indica o que falta sem perder o que foi preenchido.
8. **Given** um lançamento alterado em outro dispositivo, **When** o usuário tenta salvar uma edição sobre a versão antiga, **Then** o aplicativo avisa que o registro mudou e oferece recarregar.

---

### User Story 3 - Acompanhar e pagar faturas de cartão pelo celular (Priority: P3)

A pessoa vê a fatura de cada cartão por mês, registra pagamentos parciais ou totais, desfaz pagamentos e consulta a projeção das faturas futuras.

**Why this priority**: Faturas são o segundo uso mais frequente em quem tem cartão e exigem os lançamentos (P2).

**Independent Test**: Com um cartão com compras no mês, pagar parte da fatura, conferir total, pago e restante, tentar pagar acima do restante, quitar o restante, desfazer um pagamento e abrir a projeção dos próximos meses.

**Acceptance Scenarios**:

1. **Given** um cartão e um mês, **When** o usuário abre a fatura, **Then** vê itens, total, valor pago e saldo restante, com o vencimento.
2. **Given** uma fatura com saldo restante, **When** o usuário registra um pagamento parcial, **Then** o restante diminui e o status individual dos itens não muda.
3. **Given** um valor acima do saldo restante, **When** o usuário tenta pagar, **Then** o aplicativo recusa e informa o limite.
4. **Given** a ação "pagar fatura", **When** o usuário confirma, **Then** o saldo restante é quitado e os itens passam a pagos.
5. **Given** um pagamento de fatura registrado, **When** o usuário o desfaz, **Then** o saldo e os status voltam ao estado anterior.
6. **Given** a projeção, **When** o usuário a abre, **Then** vê por cartão o total comprometido em cada mês futuro.

---

### User Story 4 - Ver o painel e o fluxo de caixa pelo celular (Priority: P4)

A pessoa consulta o painel do mês (Total do Mês, A Vencer, Pago, Atrasado, gastos por categoria e distribuição por cartão) com gráficos legíveis em tela pequena, navega entre meses e consulta o saldo residual de cada mês.

**Why this priority**: Dá a visão consolidada, mas só tem valor depois que há lançamentos e faturas no celular.

**Independent Test**: Com lançamentos de categorias e cartões variados, abrir o painel, comparar cada indicador e gráfico com o da versão web no mesmo mês, trocar de mês e abrir o fluxo de caixa.

**Acceptance Scenarios**:

1. **Given** o painel, **When** o usuário o abre, **Then** vê os quatro indicadores do mês e os gráficos por categoria e por cartão, com os mesmos valores da versão web.
2. **Given** o painel, **When** o usuário troca o mês, **Then** todos os números e gráficos se atualizam para o mês escolhido.
3. **Given** um mês sem lançamentos, **When** o painel é aberto, **Then** mostra um estado vazio com atalho para criar o primeiro lançamento.
4. **Given** o fluxo de caixa, **When** o usuário o abre, **Then** vê, por mês, receitas previstas, despesas previstas e saldo residual.
5. **Given** um lançamento criado, pago ou excluído, **When** o usuário volta ao painel, **Then** os números já refletem a mudança.

---

### User Story 5 - Recuperar o acesso e gerenciar a própria conta pelo celular (Priority: P5)

A pessoa solicita a redefinição de senha, sai do aplicativo, pede a exclusão da conta e dos dados (com carência de 30 dias) e cancela a exclusão se mudar de ideia, tudo sem usar o computador.

**Why this priority**: Fecha a paridade com o web e atende exigências das lojas de aplicativos, que pedem exclusão de conta dentro do próprio aplicativo. É usada com pouca frequência.

**Independent Test**: Pedir a recuperação de senha e conferir a resposta igual para e-mail cadastrado e não cadastrado; solicitar a exclusão da conta confirmando a senha, verificar que as sessões encerram; entrar de novo dentro da carência e cancelar a exclusão.

**Acceptance Scenarios**:

1. **Given** a tela de entrada, **When** o usuário pede a recuperação de senha, **Then** vê a mesma confirmação para e-mails cadastrados ou não e é avisado quando excede o limite de solicitações.
2. **Given** o e-mail de recuperação recebido no celular, **When** o usuário abre o link, **Then** consegue definir a nova senha seguindo as regras de senha e voltar a entrar.
3. **Given** a área Minha conta, **When** o usuário solicita a exclusão confirmando a senha, **Then** o aplicativo informa a data limite para desistir e encerra a sessão.
4. **Given** uma conta com exclusão pendente, **When** o usuário entra com suas credenciais, **Then** o aplicativo informa a data limite e oferece cancelar a exclusão.
5. **Given** o menu, **When** o usuário escolhe sair, **Then** a sessão termina e os dados de acesso são removidos do aparelho.

---

### User Story 6 - Usar o aplicativo com conforto e segurança em qualquer aparelho (Priority: P6)

A pessoa usa todas as telas com conforto em aparelhos de tamanhos e versões diferentes, sem conteúdo coberto pela barra do sistema, pelo recorte da câmera, pelo teclado ou pela barra de gestos, e sem perder o que digitou quando a conexão falha.

**Why this priority**: É qualidade transversal que vale para todas as histórias anteriores; cada uma já deve cumprir os critérios, e esta história consolida a verificação.

**Independent Test**: Percorrer todas as telas em um aparelho Android e em um iPhone, com teclado aberto, em modo claro e escuro do sistema, com a conexão desligada ao salvar, e conferir os critérios de conforto e perda de dados.

**Acceptance Scenarios**:

1. **Given** qualquer tela, **When** exibida em aparelho com recorte, barra de status ou barra de gestos, **Then** nenhum texto ou botão fica coberto por elas.
2. **Given** um formulário, **When** o teclado abre, **Then** o campo em edição e o botão de salvar continuam visíveis ou acessíveis com rolagem.
3. **Given** uma falha de conexão ao salvar, **When** o usuário vê o aviso, **Then** tudo que digitou continua preenchido e ele pode tentar de novo.
4. **Given** o aplicativo em segundo plano por tempo longo, **When** o usuário volta, **Then** continua conectado, ou é levado à tela de entrada sem perder dados já salvos caso a sessão tenha expirado.
5. **Given** uma lista longa, **When** o usuário rola, **Then** a rolagem é fluida e o conteúdo não pula.

---

### User Story 7 - Usar o aplicativo sem internet (Priority: P7)

A pessoa abre o aplicativo sem conexão (metrô, avião, sinal fraco), consulta os últimos dados sincronizados e registra lançamentos e pagamentos que seguem para o servidor automaticamente quando a conexão volta.

**Why this priority**: Registrar a despesa na hora, onde quer que esteja, é o principal ganho do celular; sem isso o hábito falha justamente nos lugares sem sinal.

**Independent Test**: Sincronizar o aplicativo com a conexão ligada, desligar a conexão, consultar painel, lançamentos e faturas, registrar uma despesa e marcar um item como pago, religar a conexão e conferir que tudo aparece uma única vez no web.

**Acceptance Scenarios**:

1. **Given** dados já sincronizados, **When** o usuário abre o aplicativo sem conexão, **Then** vê painel, lançamentos, faturas, contas e categorias da última sincronização, com aviso claro da data e hora desses dados.
2. **Given** o aplicativo sem conexão, **When** o usuário registra um lançamento (avulso, fixo ou parcelado) ou marca/desfaz o pagamento de um item, **Then** a operação é guardada no aparelho e aparece como "pendente de envio" na lista de lançamentos, que já reflete o efeito esperado; painel, faturas e fluxo de caixa mostram o aviso de que não incluem as operações pendentes até o envio.
3. **Given** operações pendentes, **When** a conexão volta, **Then** o aplicativo as envia sozinho, na ordem em que foram feitas, e cada uma é registrada exatamente uma vez, mesmo se o envio for interrompido e repetido.
4. **Given** uma operação pendente que o servidor recusa (por exemplo, o item já foi pago no web, a conta foi inativada ou o valor ficou inválido), **When** o envio ocorre, **Then** o aplicativo avisa qual operação falhou e por quê, mantém o que foi digitado e permite corrigir ou descartar.
5. **Given** o aplicativo sem conexão, **When** o usuário tenta uma ação que exige conexão (contas, categorias, pagar fatura, excluir conta, recuperar senha), **Then** o aplicativo explica que precisa de conexão e não perde nada.
6. **Given** operações pendentes, **When** o usuário sai da conta, **Then** o aplicativo avisa que há operações não enviadas e pede confirmação antes de descartá-las.

---

### User Story 8 - Desbloquear o aplicativo com biometria (Priority: P8)

A pessoa ativa o bloqueio por biometria (digital ou rosto) e passa a entrar no aplicativo só com ela, sem digitar a senha, mantendo os dados protegidos se o aparelho for usado por outra pessoa.

**Why this priority**: Aplicativo financeiro com dados pessoais precisa de uma barreira prática; a biometria dá segurança sem atrito. Depende da sessão segura já existente.

**Independent Test**: Ativar o bloqueio em Minha conta, enviar o aplicativo para segundo plano além do tempo de bloqueio, voltar e desbloquear com a biometria; repetir com biometria recusada e usar a alternativa de senha.

**Acceptance Scenarios**:

1. **Given** um aparelho com biometria cadastrada, **When** o usuário ativa o bloqueio em Minha conta confirmando uma biometria, **Then** o recurso fica ligado e pode ser desligado a qualquer momento.
2. **Given** o bloqueio ativo, **When** o aplicativo é aberto ou volta do segundo plano depois do tempo de bloqueio escolhido, **Then** o conteúdo fica oculto até a biometria ser confirmada.
3. **Given** a biometria recusada várias vezes ou indisponível, **When** o usuário escolhe a alternativa, **Then** pode entrar com e-mail e senha, e a sessão antiga é encerrada.
4. **Given** um aparelho sem biometria cadastrada, **When** o usuário abre Minha conta, **Then** o aplicativo explica que o recurso está indisponível e como habilitá-lo no aparelho.
5. **Given** o bloqueio ativo, **When** o aplicativo aparece na lista de aplicativos recentes do sistema, **Then** o conteúdo financeiro não fica visível na miniatura.
6. **Given** ações sensíveis (excluir a conta, desligar o bloqueio), **When** o usuário as solicita, **Then** a biometria não substitui a senha onde a senha já é exigida.

---

### User Story 9 - Receber lembretes de vencimento (Priority: P9)

A pessoa recebe lembretes no aparelho para contas que vencem em breve ou estão atrasadas, escolhe quais avisos quer e não recebe lembrete de itens que já pagou.

**Why this priority**: Evita atrasos e juros, mas é um complemento ao controle que o usuário já faz.

**Independent Test**: Ativar os lembretes, ter um lançamento vencendo no dia seguinte, receber o aviso no horário configurado, pagar o item e conferir que o aviso deixa de ser enviado; desligar um tipo de aviso e conferir que ele para.

**Acceptance Scenarios**:

1. **Given** os lembretes ativos e a permissão concedida, **When** há itens pendentes vencendo no dia seguinte ou no próprio dia, **Then** o aparelho exibe um aviso no horário escolhido (padrão 9h).
2. **Given** itens pagos, **When** chega a data do aviso, **Then** nada é exibido para eles, mesmo que o aviso já tivesse sido agendado.
3. **Given** itens atrasados, **When** o usuário mantém o aviso de atraso ligado, **Then** recebe no máximo um resumo por dia.
4. **Given** a tela de lembretes em Minha conta, **When** o usuário liga ou desliga cada tipo (vencendo, atrasado) e escolhe o horário, **Then** a escolha vale imediatamente e fica guardada.
5. **Given** permissão de notificação negada no sistema, **When** o usuário abre os lembretes, **Then** o aplicativo explica o que falta e como liberar nas configurações do aparelho.
6. **Given** um aviso exibido, **When** o usuário toca nele, **Then** o aplicativo abre direto na lista dos itens que vencem.
7. **Given** a tela bloqueada, **When** o aviso aparece, **Then** o texto mostra apenas a quantidade e o tipo (por exemplo, "2 contas vencem amanhã"), sem valores nem nomes.

---

### Edge Cases

- Falta de internet na primeira abertura, sem nenhum dado sincronizado: o aplicativo mostra o estado vazio com a opção de tentar de novo, sem tela em branco.
- Operações feitas sem conexão em dois aparelhos ao mesmo tempo, ou alteradas no web antes do envio: cada operação é validada pelo servidor; conflitos são mostrados ao usuário e nunca sobrescrevem dados em silêncio.
- Relógio do aparelho errado ou mudança de fuso: datas e avisos seguem o fuso do Brasil usado pelo sistema.
- Muitos lançamentos pendentes de envio: o envio acontece em lotes e mostra o progresso, sem travar a tela.
- Biometria removida ou indisponível no aparelho depois de ativada (por exemplo, todas as digitais apagadas): o aplicativo desliga o bloqueio, pede e-mail e senha e avisa o motivo.
- Aparelho reiniciado ou aplicativo encerrado pelo sistema: os lembretes continuam agendados e as operações pendentes não se perdem.
- Sessão expirada ou revogada enquanto o usuário usa o aplicativo (por exemplo, após pedir exclusão de conta em outro aparelho): o aplicativo leva à tela de entrada com aviso claro.
- Dados alterados no web enquanto o aplicativo está aberto: ao voltar à tela ou ao puxar para atualizar, os dados mostram o estado atual.
- Lista com milhares de lançamentos: o aplicativo carrega por partes e continua utilizável.
- Valores muito grandes ou com muitas casas: o aplicativo não corta nem quebra o layout e respeita o limite do sistema.
- Telas pequenas (largura de 360 pontos) e tablets: tudo continua acessível, sem rolagem horizontal da página.
- Troca entre modo claro e escuro do sistema: a identidade visual continua legível (o GEFINC é escuro por padrão).
- Pagamento de fatura acima do saldo restante, conta com lançamentos que se tenta excluir, categoria em uso, cartão com dia 29, 30 ou 31 em mês curto: mesmas regras e mensagens da versão web.
- Usuário que toca duas vezes em salvar ou pagar: a operação é registrada uma única vez.

## Requirements *(mandatory)*

### Functional Requirements

**Navegação e acesso**

- **FR-001**: O aplicativo MUST oferecer um menu principal que dê acesso a Painel, Lançamentos, Contas e cartões, Faturas, Fluxo de caixa, Categorias e Minha conta, com a tela inicial mostrando o painel do mês.
- **FR-002**: O aplicativo MUST permitir criar conta, entrar, recuperar a senha e sair, com as mesmas regras de senha e as mesmas respostas da versão web (FR-001, FR-002, FR-006 e FR-007 da feature 001).
- **FR-003**: O aplicativo MUST permitir solicitar a exclusão da conta confirmando a senha, informar a data limite da carência e permitir cancelar a exclusão ao entrar dentro do prazo (FR-008 a FR-010 da feature 001).
- **FR-004**: O aplicativo MUST manter a sessão ativa entre aberturas e MUST guardar as credenciais de sessão em armazenamento seguro do aparelho, sem exibi-las em telas, mensagens ou registros.

**Contas, cartões e categorias**

- **FR-005**: O aplicativo MUST permitir cadastrar, editar, listar e inativar contas dos tipos conta bancária, dinheiro em espécie e cartão de crédito, exigindo dia de fechamento e de vencimento (1 a 31) para cartões, e impedir a exclusão definitiva de contas com lançamentos.
- **FR-006**: O aplicativo MUST informar, ao mudar os dias de um cartão, a regra de recálculo das ocorrências fixas futuras pendentes.
- **FR-007**: O aplicativo MUST permitir criar, editar e excluir categorias de receita ou despesa com nome e cor, mostrar o conjunto inicial de categorias e impedir a exclusão de categoria em uso ou exigir reatribuição.

**Lançamentos**

- **FR-008**: O aplicativo MUST permitir registrar receitas e despesas dos tipos avulso, fixo e parcelado, com todos os campos do cadastro web: descrição ou loja, categoria, conta ou cartão, valor, quantidade de parcelas, data da compra e vencimento.
- **FR-009**: O aplicativo MUST mostrar, antes de salvar uma compra parcelada, a prévia de todas as parcelas com vencimento e valor, e a soma das parcelas MUST ser igual ao total, com o resto de centavos na última parcela.
- **FR-010**: O aplicativo MUST listar e filtrar lançamentos por mês, conta ou cartão, categoria, tipo e status.
- **FR-011**: O aplicativo MUST permitir editar e excluir lançamentos, informando o efeito sobre parcelas já pagas e pedindo confirmação antes de excluir.
- **FR-012**: O aplicativo MUST permitir marcar ocorrências como pagas com data de pagamento e desfazer o pagamento, inclusive itens de cartão, respeitando as regras de itens quitados por pagamento de fatura.
- **FR-013**: O aplicativo MUST permitir, em lançamentos fixos, alterar o valor a partir de um mês e encerrar o lançamento, com as mesmas regras de ocorrências já pagas da versão web.
- **FR-014**: O aplicativo MUST manter o lançamento rápido de despesa avulsa em no máximo 3 toques a partir da tela inicial, usando conta, categoria e data padrão ou as últimas usadas, com possibilidade de ajustar sem sair do fluxo.
- **FR-015**: O aplicativo MUST calcular e exibir vencimentos de lançamentos em cartão exatamente como a versão web, sem permitir editar manualmente o vencimento de itens de cartão.

**Faturas, projeção, painel e fluxo de caixa**

- **FR-016**: O aplicativo MUST exibir a fatura de cada cartão por mês com itens, total, valor pago, saldo restante e vencimento.
- **FR-017**: O aplicativo MUST permitir registrar pagamentos parciais, pagar o saldo restante e desfazer pagamentos, recusando valores acima do saldo restante e mantendo o saldo nunca negativo.
- **FR-018**: O aplicativo MUST exibir a projeção das faturas futuras por cartão, com o total comprometido em cada mês.
- **FR-019**: O aplicativo MUST exibir o painel mensal com Total do Mês, A Vencer, Pago e Atrasado, o gráfico de gastos por categoria e a distribuição por cartão, com navegação entre meses.
- **FR-020**: O aplicativo MUST exibir o fluxo de caixa com receitas previstas, despesas previstas e saldo residual por mês.
- **FR-021**: Painel, projeção, fluxo de caixa e faturas MUST refletir imediatamente qualquer criação, alteração, pagamento ou exclusão feita no aplicativo ou na versão web, mostrando dados atuais ao abrir ou atualizar a tela.

**Qualidade da experiência**

- **FR-022**: O aplicativo MUST estar em português do Brasil, exibir valores em reais com duas casas decimais e datas no formato brasileiro, e apresentar estados de carregamento, vazio e erro em todas as telas.
- **FR-023**: O aplicativo MUST adaptar todas as telas às áreas ocupadas pelo sistema (barra de status, recorte da câmera, barra de gestos e teclado), sem cobrir texto nem botões.
- **FR-024**: O aplicativo MUST preservar o que o usuário digitou quando uma operação falhar por problema de conexão ou validação, e MUST registrar uma única vez operações acionadas por toques repetidos.
- **FR-025**: O aplicativo MUST oferecer áreas de toque confortáveis, rótulos acessíveis para leitores de tela e contraste suficiente em todas as telas.
- **FR-026**: O aplicativo MUST oferecer o mesmo conjunto de funções e as mesmas regras de negócio no Android e no iOS.
- **FR-027**: O aplicativo MUST usar os mesmos dados e regras da versão web: o que for criado no aplicativo aparece no web e vice-versa, sem diferença de cálculo.

**Uso sem internet**

- **FR-028**: O aplicativo MUST guardar no aparelho, de forma protegida, os dados da última sincronização (painel, lançamentos do período consultado, faturas, projeção, fluxo de caixa, contas, cartões e categorias) e MUST exibi-los sem conexão com a indicação da data e hora da última atualização.
- **FR-029**: Sem conexão, o aplicativo MUST permitir registrar lançamentos (avulso, fixo e parcelado), marcar ou desfazer o pagamento de itens e, para lançamentos que já existem no servidor, editar valor e vencimento e excluir, guardando cada operação em uma fila no aparelho, visível como pendente de envio (o item alterado aparece marcado; o excluído sai da lista). Editar ou excluir um lançamento criado sem conexão e ainda não enviado fica para depois do envio.
- **FR-030**: Ao recuperar a conexão, o aplicativo MUST enviar as operações pendentes na ordem em que foram feitas, e cada operação MUST ser registrada exatamente uma vez, mesmo com envios repetidos ou interrompidos.
- **FR-031**: Quando o servidor recusar uma operação pendente, o aplicativo MUST informar qual foi, o motivo, preservar os dados digitados e permitir corrigir ou descartar; o aplicativo MUST NOT sobrescrever dados do servidor em silêncio.
- **FR-032**: Ações que não estão na fila offline (gerenciar contas e categorias, pagar fatura, alterar valor a partir de um mês e encerrar lançamento fixo, exclusão de conta e recuperação de senha) MUST informar que exigem conexão sem perder o que o usuário digitou.
- **FR-033**: Ao sair da conta ou excluí-la, os dados guardados no aparelho e a fila de operações MUST ser removidos, depois de avisar sobre operações ainda não enviadas. Se a sessão se perder sem o usuário sair (expirada ou revogada), a cópia local dos dados MUST ser removida, mas as operações ainda não enviadas MUST ser mantidas para o mesmo usuário continuar ao entrar de novo, para não perder o que ele registrou. Os dados locais MUST NOT ser acessíveis a outros usuários do aparelho nem legíveis fora do aplicativo.

**Biometria**

- **FR-034**: O aplicativo MUST oferecer o bloqueio por biometria do aparelho como opção desligada por padrão, ativada e desativada em Minha conta, com tempo de bloqueio escolhido (imediato, 1 minuto ou 5 minutos em segundo plano).
- **FR-035**: Com o bloqueio ativo, o aplicativo MUST ocultar todo o conteúdo financeiro, inclusive na visão de aplicativos recentes do sistema, até a biometria ser confirmada.
  > **Revogado em parte (TASK-UI-LIQUID-GLASS-PENDENCIAS):** a exigência de ocultar o conteúdo na visão de aplicativos recentes (e de bloquear capturas de tela) foi retirada por decisão do usuário; o plugin de privacidade de tela foi removido. A tela de bloqueio por biometria continua valendo.
- **FR-036**: O aplicativo MUST oferecer a entrada por e-mail e senha como alternativa quando a biometria falhar, for recusada ou ficar indisponível no aparelho, e nesse caso MUST encerrar a sessão anterior.
- **FR-037**: A biometria MUST NOT substituir a senha em ações que já a exigem (exclusão de conta) e MUST NOT ser armazenada nem enviada ao servidor.

**Lembretes**

- **FR-038**: O aplicativo MUST oferecer lembretes no aparelho para itens pendentes que vencem no dia seguinte, que vencem no próprio dia e que estão atrasados, desligados por padrão, com a permissão do sistema pedida só quando o usuário os ativar.
- **FR-039**: O usuário MUST poder ligar ou desligar cada tipo de lembrete e escolher o horário (padrão 9h), valendo imediatamente.
- **FR-040**: Os lembretes MUST deixar de ser exibidos para itens pagos, excluídos ou reagendados, e MUST ser atualizados quando os dados mudarem no aplicativo ou na sincronização, enviando no máximo um aviso de atraso por dia.
- **FR-041**: O texto dos lembretes MUST mostrar apenas quantidade e tipo de itens, sem valores, nomes de contas ou descrições; ao tocar, o aplicativo MUST abrir a lista dos itens correspondentes.

### Key Entities

Esta feature não cria entidades novas; ela expõe no celular as entidades da feature 001:

- **Usuário e sessão**: pessoa autenticada; a sessão fica guardada de forma segura no aparelho.
- **Conta ou cartão**: conta bancária, dinheiro em espécie ou cartão de crédito (com dias de fechamento e vencimento); pode ser inativada.
- **Categoria**: classificação de receita ou despesa, com nome e cor.
- **Lançamento e ocorrência**: receita ou despesa avulsa, fixa ou parcelada; cada parcela ou ocorrência mensal tem valor, vencimento e status.
- **Fatura e pagamento de fatura**: visão mensal de um cartão e os pagamentos parciais ou totais registrados sobre ela.
- **Painel e fluxo de caixa**: indicadores e projeções calculados a partir dos lançamentos por mês de vencimento.
- **Operação pendente**: lançamento ou pagamento feito sem conexão, guardado no aparelho com sua ordem, estado (pendente, enviado, recusada) e identificador que garante registro único.
- **Cópia local dos dados**: último retrato sincronizado dos dados do usuário no aparelho, com data e hora da sincronização.
- **Preferências do aparelho**: bloqueio por biometria (ligado ou não, tempo de bloqueio) e lembretes (tipos ligados, horário), guardadas por usuário e por aparelho.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das funções de usuário da versão web (cadastro, entrada, recuperação de senha, exclusão de conta, contas e cartões, categorias, lançamentos de todos os tipos, faturas, projeção, fluxo de caixa e painel) podem ser concluídas inteiramente pelo aplicativo, sem abrir o navegador, exceto a abertura do link do e-mail de recuperação.
- **SC-002**: Para o mesmo conjunto de dados, 100% dos valores de painel, fatura, projeção, fluxo de caixa e parcelas mostrados no aplicativo são idênticos aos da versão web.
- **SC-003**: O registro de uma despesa avulsa continua exigindo no máximo 3 toques a partir da tela inicial em 100% dos testes de usabilidade.
- **SC-004**: Um usuário novo, só com o aplicativo, cria conta, cadastra uma conta bancária, uma categoria e a primeira despesa em até 5 minutos.
- **SC-005**: As telas de painel, lista de lançamentos e faturas exibem dados em até 2 segundos em conexão móvel comum, com até 6.000 lançamentos na conta.
- **SC-006**: Em 100% das telas, nenhum texto ou botão fica coberto pela barra de status, recorte da câmera, barra de gestos ou teclado, verificado em pelo menos um aparelho Android e um iPhone.
- **SC-007**: Em 100% dos testes de falha de conexão ao salvar, o usuário não perde o que digitou.
- **SC-008**: 90% dos testadores concluem na primeira tentativa, sem ajuda, as tarefas de pagar parte de uma fatura e de cadastrar uma compra parcelada.
- **SC-009**: Nenhuma credencial, e-mail ou valor financeiro aparece nos registros do aplicativo em uso normal, e a sessão permanece ativa após fechar e reabrir o aplicativo em 100% dos testes.
- **SC-010**: Em 100% dos testes, operações registradas sem conexão aparecem exatamente uma vez no servidor depois que a conexão volta, inclusive quando o envio é interrompido e repetido, e 100% das recusas são mostradas ao usuário com o motivo.
- **SC-011**: Sem conexão, painel, lançamentos e faturas da última sincronização abrem em até 2 segundos.
- **SC-012**: Com o bloqueio ativo, o usuário desbloqueia o aplicativo em até 3 segundos com a biometria, e em nenhum teste o conteúdo financeiro fica visível antes do desbloqueio, inclusive na visão de aplicativos recentes.
  > **Revogado em parte (TASK-UI-LIQUID-GLASS-PENDENCIAS):** a cláusula "inclusive na visão de aplicativos recentes" deixa de valer, por decisão do usuário; a visão de apps recentes deixa de ser ocultada.
- **SC-013**: Em pelo menos 95% dos testes, o lembrete aparece no horário escolhido (margem de 15 minutos, por limitação dos alarmes do sistema operacional), e em 100% dos testes não aparece lembrete de item já pago.

## Assumptions

- A API e as regras de negócio já existentes são reaproveitadas; esta feature não muda o cálculo de parcelas, faturas, painel nem as regras de segurança. Ajustes de API só ocorrem se alguma função do web não estiver disponível para o celular.
- O público são pessoas com Android 7 ou superior e iOS 15 ou superior, em celulares; tablets devem funcionar, mas não têm layout dedicado nesta versão.
- O uso sem internet cobre consulta aos dados já sincronizados, o registro de lançamentos, pagamentos, a edição de valor e vencimento e a exclusão de lançamentos já enviados; as demais ações exigem conexão (FR-032). Não há resolução automática de conflitos: o servidor valida cada operação e o usuário decide o que fazer com as recusadas.
- Os lembretes são locais, agendados no próprio aparelho a partir dos dados sincronizados. Notificações enviadas pelo servidor (push remoto) dependem de contas externas (Firebase e Apple) que o projeto ainda não tem e ficam fora desta versão; por isso, um lembrete só é atualizado quando o aplicativo sincroniza.
- A biometria usa o que o aparelho oferece (digital ou rosto); o aplicativo nunca vê nem guarda a biometria. Aparelhos sem biometria cadastrada continuam usando só e-mail e senha.
- Widgets e publicação nas lojas de aplicativos ficam fora do escopo.
- O link de redefinição de senha enviado por e-mail abre a página de redefinição no navegador; fazê-lo abrir direto no aplicativo depende de um domínio público do GEFINC e fica como evolução. O restante do fluxo (pedir a recuperação e entrar com a nova senha) acontece no aplicativo.
- A exclusão de conta dentro do aplicativo atende também às exigências das lojas de aplicativos.
- A verificação em iPhone exige um computador Mac com as ferramentas da Apple; sem ele, a paridade no iOS só pode ser confirmada por testes automatizados da interface compartilhada, e a verificação em aparelho fica pendente de acesso a um Mac.
- A identidade visual do documento `docs/gefinc_identidade_visual_design_system.md` (escura por padrão) continua válida para o aplicativo.
- A versão web continua sendo a referência para tabelas e análises extensas; no celular as mesmas informações são apresentadas em listas, cartões e gráficos adaptados à tela pequena, sem perder dados.
- A reutilização de interface e lógica entre web e mobile segue o que a constituição do projeto determina.

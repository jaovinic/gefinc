# Feature Specification: Contas PF/PJ, cartões vinculados com ícone, receita no app e nova identidade visual

**Feature Branch**: `003-bank-accounts-ui-redesign`
**Created**: 2026-10-22
**Status**: Draft
**Input**: User description: "deve ser possivel cadastrar Conta Bancaria PJ e PF, os cartoes de credito devem ser vinculados a uma conta Bancaria, e devem ter icone identificador, assim como o nome no lancamento de despesa, nao encontrei o lancamento de Receita no APP Android, os menus da versao WEB devem ser na lateral esquerda com icones, melhore a UI/UX de todos os Fronts, Mobile e WEB, usa essa identidade visual para UI, Logo, Icones e tudo: https://share.gemini.google/CYmYD64A63JD"

## Contexto

Ao usar o GEFINC no dia a dia surgiram cinco necessidades:

1. Quem tem **conta de pessoa física e de pessoa jurídica** precisa distingui-las ao cadastrar e ao consultar.
2. **Cartões de crédito** pertencem a uma conta bancária e precisam ser reconhecidos de relance, por **ícone e nome**, principalmente na hora de lançar uma despesa.
3. O **lançamento de receita não é encontrado no aplicativo Android**: o app destaca só "Nova despesa".
4. No web, o **menu deve ficar na lateral esquerda, com ícones**.
5. Toda a interface (web e app) deve ser **melhorada e seguir a identidade visual "Aurora FinTech"** do GEFINC (logo, ícones, favicons, paleta, tipografia), descrita no manual `docs/gefinc_identidade_visual_design_system.md` e na imagem do manual compartilhada pelo usuário (símbolo em hexágono com seta de crescimento e barras, gradiente verde-esmeralda para ciano, fundo escuro, fonte Plus Jakarta Sans).

As regras de negócio das features anteriores (parcelas, faturas, painel, offline, biometria, lembretes) continuam valendo; esta feature muda como contas e cartões são cadastrados, como são mostrados e como a interface se apresenta.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cadastrar contas bancárias de pessoa física e jurídica (Priority: P1)

A pessoa cadastra suas contas bancárias informando se a titularidade é de **pessoa física (PF)** ou **pessoa jurídica (PJ)**, escolhe um ícone que identifica o banco ou a conta, e passa a ver e filtrar suas contas por PF e PJ.

**Why this priority**: As contas bancárias são a base dos cartões e dos lançamentos; sem a distinção PF/PJ, quem mistura finanças pessoais e da empresa não consegue organizar o que é de cada um.

**Independent Test**: Cadastrar uma conta bancária PF e uma PJ, conferir o selo PF/PJ e o ícone na lista, filtrar por PF e por PJ, editar o tipo de titular e inativar uma delas.

**Acceptance Scenarios**:

1. **Given** a tela de contas, **When** o usuário cadastra uma conta bancária informando nome, tipo de titular (PF ou PJ) e ícone, **Then** a conta aparece na lista com o selo PF ou PJ e o ícone escolhido.
2. **Given** contas PF e PJ cadastradas, **When** o usuário filtra por PF, por PJ ou por todas, **Then** a lista mostra apenas as do filtro escolhido.
3. **Given** o cadastro de conta bancária, **When** o usuário deixa o tipo de titular em branco, **Then** o sistema pede a escolha entre PF e PJ e mantém o que já foi digitado.
4. **Given** uma conta existente criada antes desta versão, **When** o usuário abre a tela de contas, **Then** a conta aparece como pessoa física e pode ser alterada para PJ.
5. **Given** uma conta bancária com lançamentos, **When** o usuário tenta excluí-la, **Then** o sistema oferece apenas inativar, como antes.
6. **Given** o dinheiro em espécie, **When** o usuário o cadastra, **Then** ele continua disponível como conta sem tipo de titular.

---

### User Story 2 - Cartões de crédito vinculados a uma conta bancária, com ícone e nome (Priority: P2)

A pessoa cadastra cada cartão de crédito **vinculado a uma conta bancária**, escolhendo um **ícone identificador** e um nome (por exemplo, "Nubank Roxinho"). Na hora de lançar uma despesa, o cartão aparece pelo **ícone e pelo nome**, e a conta bancária à qual pertence fica visível.

**Why this priority**: O vínculo com a conta organiza fatura, titularidade (PF ou PJ) e pagamento; o ícone e o nome evitam lançar no cartão errado.

**Independent Test**: Com uma conta PJ e outra PF, cadastrar um cartão em cada uma, lançar uma despesa em cada cartão e conferir que o lançamento, a lista e a fatura mostram ícone, nome do cartão e a conta vinculada.

**Acceptance Scenarios**:

1. **Given** o cadastro de cartão, **When** o usuário informa nome, ícone, dias de fechamento e de vencimento e escolhe a conta bancária, **Then** o cartão é criado vinculado a essa conta.
2. **Given** o cadastro de cartão sem conta bancária escolhida, **When** o usuário tenta salvar, **Then** o sistema pede a escolha de uma conta bancária e mantém o que foi digitado.
3. **Given** que o usuário não tem conta bancária, **When** tenta cadastrar um cartão, **Then** o sistema explica que é preciso cadastrar uma conta bancária antes e oferece o atalho para isso.
4. **Given** o lançamento de uma despesa, **When** o usuário abre a escolha de conta ou cartão, **Then** cada opção mostra ícone e nome e, para cartões, também a conta bancária vinculada e o selo PF/PJ.
5. **Given** um lançamento já feito em um cartão, **When** o usuário o vê na lista, no painel, na fatura ou no fluxo de caixa, **Then** aparecem o ícone e o nome do cartão.
6. **Given** um cartão cadastrado antes desta versão sem conta vinculada, **When** o usuário abre a tela de contas, **Then** o cartão aparece com o aviso "vincule a uma conta bancária" e continua funcionando; ao vincular, o aviso some.
7. **Given** uma conta bancária com cartões vinculados, **When** o usuário a inativa, **Then** o sistema avisa quais cartões estão ligados a ela e o que acontece com eles, e não perde o histórico.
8. **Given** um cartão, **When** o usuário troca a conta bancária vinculada, **Then** lançamentos e faturas existentes não mudam de valor nem de vencimento.

---

### User Story 3 - Lançar receitas pelo aplicativo Android e iOS (Priority: P3)

A pessoa encontra, na tela inicial do aplicativo, uma ação clara para **registrar uma receita**, ao lado da ação de despesa, com o mesmo fluxo rápido de poucos toques.

**Why this priority**: Receitas são metade do controle financeiro e hoje o usuário não as acha no app; é uma lacuna de descoberta que impede o uso diário.

**Independent Test**: Na tela inicial do app, registrar uma receita contando os toques, conferir que ela entra no painel e no fluxo de caixa e que aparece com o selo de receita na lista de lançamentos.

**Acceptance Scenarios**:

1. **Given** a tela inicial do aplicativo, **When** o usuário olha as ações principais, **Then** vê claramente "Nova despesa" e "Nova receita".
2. **Given** a ação "Nova receita", **When** o usuário registra uma receita usando conta, categoria e data padrão ou as últimas usadas, **Then** conclui em no máximo 3 toques.
3. **Given** o registro rápido de receita, **When** o usuário precisa mudar conta, categoria ou data, **Then** ajusta sem sair do fluxo; as categorias oferecidas são só as de receita.
4. **Given** a lista de lançamentos, **When** o usuário quer lançar algo completo (fixo, parcelado ou receita recorrente), **Then** a ação "Novo lançamento" deixa clara a escolha entre receita e despesa antes de preencher o resto.
5. **Given** uma receita registrada sem conexão, **When** o aplicativo volta a ter conexão, **Then** ela é enviada uma única vez, como as despesas.
6. **Given** uma receita em conta ou cartão, **When** ela é exibida em qualquer tela, **Then** vem com sinal e cor de receita, diferentes dos da despesa.

---

### User Story 4 - Navegação lateral com ícones no web (Priority: P4)

Na versão web, o menu fica **na lateral esquerda**, com ícone e nome de cada área, destacando onde o usuário está, e pode ser recolhido para só ícones.

**Why this priority**: É o padrão esperado em sistemas de gestão; melhora a descoberta das áreas e libera espaço útil para as tabelas.

**Independent Test**: Abrir o web em tela larga e em tela estreita, conferir o menu lateral com ícones e a área atual destacada, recolhê-lo, navegar por todas as áreas só pelo teclado.

**Acceptance Scenarios**:

1. **Given** o web em tela larga, **When** o usuário entra no sistema, **Then** vê um menu lateral à esquerda com logo, ícone e nome de Painel, Lançamentos, Faturas, Fluxo de caixa, Contas e cartões, Categorias e Minha conta.
2. **Given** o menu lateral, **When** o usuário navega para uma área, **Then** o item da área atual fica destacado e identificável também por quem não distingue cores.
3. **Given** o menu lateral, **When** o usuário o recolhe, **Then** ficam só os ícones, com o nome visível ao passar o mouse ou focar com o teclado, e a escolha é lembrada na próxima visita.
4. **Given** uma tela estreita (tablet ou janela pequena), **When** o usuário abre o web, **Then** o menu vira uma gaveta lateral aberta por um botão, sem cobrir o conteúdo o tempo todo.
5. **Given** o teclado, **When** o usuário percorre o menu, **Then** consegue chegar a todos os itens e ativá-los, com foco visível.
6. **Given** o menu, **When** o usuário vê o rodapé dele, **Then** encontra o acesso a Minha conta e a ação de sair.

---

### User Story 5 - Identidade visual Aurora FinTech e experiência melhorada no web e no app (Priority: P5)

Toda a interface, no web e nos aplicativos, passa a seguir a identidade visual do GEFINC: **logo e símbolo, favicons, ícone do aplicativo, paleta, tipografia e ícones** próprios, com telas mais claras, consistentes e agradáveis de usar.

**Why this priority**: Dá cara de produto ao sistema e reduz esforço de uso, mas depende das mudanças de estrutura das histórias anteriores para ser aplicada de ponta a ponta.

**Independent Test**: Percorrer todas as telas do web e do app e conferir, com uma lista objetiva, o uso do logo, da paleta, da fonte e dos ícones; medir o tempo e os toques das tarefas principais antes e depois.

**Acceptance Scenarios**:

1. **Given** qualquer tela, **When** o usuário a vê, **Then** as cores, a fonte e os ícones seguem o manual de identidade (fundo escuro, acento verde-esmeralda e ciano, violeta para planejamento, fonte única).
2. **Given** a aba do navegador e os atalhos do aparelho, **When** o usuário os vê, **Then** aparecem o favicon e o ícone do aplicativo do GEFINC, nítidos em todos os tamanhos usados.
3. **Given** as telas de entrada, cadastro e recuperação de senha, **When** o usuário as abre, **Then** mostram o logo do GEFINC e a identidade visual, em web e app.
4. **Given** as listas e tabelas, **When** o usuário as consulta, **Then** valores, status e tipos têm hierarquia visual clara (receita e despesa, pago, pendente e atrasado), com ícones de apoio e sem depender só da cor.
5. **Given** uma tela carregando, vazia ou com erro, **When** o usuário a vê, **Then** o estado tem ilustração ou ícone, mensagem clara e ação sugerida.
6. **Given** uma ação concluída (salvar, pagar, enviar), **When** ela termina, **Then** o usuário recebe confirmação visível e discreta.
7. **Given** o aplicativo no celular, **When** o usuário o usa com uma mão, **Then** as ações principais ficam ao alcance do polegar e a navegação inferior mantém ícones e nomes.
8. **Given** o usuário com preferência por menos movimento no sistema, **When** usa o web ou o app, **Then** animações são reduzidas ou removidas.

---

### Edge Cases

- Conta bancária inativada com cartões vinculados: o sistema avisa os cartões afetados; cartões e lançamentos antigos continuam consultáveis, e novos lançamentos nesses cartões seguem a regra de contas inativas.
- Exclusão de conta bancária que tem cartões vinculados: só inativar, nunca excluir (como já ocorre com contas com lançamentos).
- Dois cartões ou contas com o mesmo nome: o sistema recusa nomes repetidos entre contas ativas do mesmo usuário e, quando o nome for parecido, o ícone e a conta vinculada ajudam a diferenciar.
- Ícone não escolhido: o sistema atribui um ícone padrão do tipo (conta, cartão, dinheiro) para que nada fique sem ícone.
- Nomes muito longos de conta ou cartão: aparecem cortados com reticências no menu e em listas, e completos ao focar ou abrir o item.
- Telas muito estreitas (360 pontos) e tablets: tudo continua acessível e sem rolagem horizontal da página.
- Pessoa que só tem conta PF ou só PJ: o filtro PF/PJ não aparece ou fica com uma opção só, sem poluir a tela.
- Dados antigos sem tipo de titular ou sem conta vinculada: nada é apagado nem bloqueado; o usuário é orientado a completar.
- Modo recolhido do menu com nomes longos: o nome só aparece em dica ao passar o mouse ou focar.
- Tema do sistema claro: o GEFINC é escuro por padrão; as cores e contrastes continuam legíveis se o sistema pedir tema claro.
- Daltonismo: receita/despesa e pago/pendente/atrasado nunca dependem só da cor.
- Receita sem conexão e conflitos: mesmas regras das despesas (fila, envio único, recusa com motivo).

## Requirements *(mandatory)*

### Functional Requirements

**Contas bancárias PF e PJ**

- **FR-001**: O sistema MUST permitir cadastrar contas bancárias informando o **tipo de titular**, pessoa física (PF) ou pessoa jurídica (PJ), obrigatório para contas bancárias.
- **FR-002**: O sistema MUST permitir escolher um **ícone identificador** para cada conta bancária a partir de um conjunto oferecido (por exemplo, bancos e tipos genéricos), e MUST atribuir um ícone padrão quando nenhum for escolhido.
- **FR-003**: O sistema MUST mostrar o tipo de titular (selo PF ou PJ) e o ícone em todas as telas que listam ou escolhem contas.
- **FR-004**: O sistema MUST permitir filtrar a lista de contas por PF, PJ ou todas, e MUST esconder o filtro quando só houver um tipo.
- **FR-005**: O sistema MUST tratar contas bancárias existentes antes desta versão como pessoa física, permitindo alterar o tipo de titular.
- **FR-006**: O dinheiro em espécie MUST continuar existindo como conta sem tipo de titular, com ícone próprio.
- **FR-007**: O sistema MUST manter as regras atuais de contas: inativar em vez de excluir quando há lançamentos, nome único entre contas ativas e versão para edição concorrente.

**Cartões vinculados a uma conta bancária**

- **FR-008**: O sistema MUST exigir que todo cartão de crédito novo seja **vinculado a uma conta bancária** do próprio usuário, e MUST recusar o cadastro sem o vínculo.
- **FR-009**: O sistema MUST permitir escolher um **ícone identificador** e um **nome** para o cartão (padrão sugerido a partir do banco vinculado), mantendo dias de fechamento e vencimento como hoje.
- **FR-010**: O sistema MUST permitir trocar a conta bancária vinculada a um cartão sem alterar valores, vencimentos ou status de lançamentos e faturas já existentes.
- **FR-011**: O sistema MUST orientar quem não tem conta bancária a cadastrar uma antes de criar um cartão.
- **FR-012**: O sistema MUST tratar cartões existentes antes desta versão sem conta vinculada como válidos e funcionando, marcando-os com o aviso "vincule a uma conta bancária" até o usuário completar.
- **FR-013**: O sistema MUST informar, ao inativar uma conta bancária, quais cartões estão vinculados a ela e o efeito disso.
- **FR-014**: O sistema MUST mostrar em cada cartão a conta bancária vinculada e o selo PF/PJ dessa conta.

**Identificação nos lançamentos**

- **FR-015**: Na escolha de conta ou cartão em qualquer lançamento, o sistema MUST exibir ícone e nome de cada opção e, para cartões, a conta bancária vinculada e o selo PF/PJ.
- **FR-016**: Lançamentos, faturas, projeção, painel e fluxo de caixa MUST exibir o ícone e o nome da conta ou do cartão de cada item, no web e no aplicativo.
- **FR-017**: O sistema MUST manter as regras de vencimento e fatura de cartões da feature anterior sem alteração.

**Receita no aplicativo**

- **FR-018**: A tela inicial do aplicativo MUST oferecer, lado a lado e com igual destaque, as ações "Nova despesa" e "Nova receita".
- **FR-019**: O registro rápido de receita MUST ser concluído em no máximo 3 toques a partir da tela inicial, usando conta, categoria e data padrão ou as últimas usadas, e MUST oferecer apenas categorias de receita.
- **FR-020**: O cadastro completo de lançamento no aplicativo MUST pedir, logo no início, a escolha entre receita e despesa, de forma visível, antes dos demais campos (valor, tipo fixo/avulso/parcelado, conta, categoria e datas).
- **FR-021**: Receitas MUST funcionar sem conexão e ser enviadas uma única vez, como as despesas, e MUST ser distinguíveis de despesas por sinal, cor e ícone em todas as telas.

**Menu lateral no web**

- **FR-022**: O web MUST apresentar o menu principal em uma barra lateral à esquerda, com o logo no topo, ícone e nome de cada área, e acesso a Minha conta e sair no rodapé.
- **FR-023**: O menu lateral MUST destacar a área atual de forma perceptível sem depender só de cor.
- **FR-024**: O menu lateral MUST poder ser recolhido para mostrar só ícones, com o nome acessível por dica e por foco, e MUST lembrar a escolha do usuário.
- **FR-025**: Em telas estreitas, o menu lateral MUST virar uma gaveta aberta por botão e fechada ao escolher uma área ou ao tocar fora.
- **FR-026**: O menu lateral MUST ser totalmente operável por teclado e leitor de tela, com foco visível e nomes acessíveis.

**Identidade visual e experiência**

- **FR-027**: Web e aplicativo MUST seguir o manual de identidade visual do GEFINC: paleta (fundo `#090D16`, superfície `#131B2E`, borda `#1E293B`, verde-esmeralda `#00E599`, ciano `#00B4D8`, violeta `#7C3AED`), gradiente de marca verde-esmeralda para ciano, tipografia Plus Jakarta Sans e raios de borda do sistema.
- **FR-028**: O sistema MUST usar um **conjunto único de ícones** consistente em menus, ações, estados, tipos de conta, cartões, categorias e status, no web e no app.
- **FR-029**: O sistema MUST entregar o **logo** (símbolo e versão com o nome), os **favicons** e o **ícone do aplicativo** (Android e iOS) nos formatos e tamanhos necessários, derivados do manual de identidade, em formato vetorial e PNG.
- **FR-030**: As telas de entrada, cadastro, recuperação e redefinição de senha MUST exibir o logo e a identidade visual, no web e no app.
- **FR-031**: Valores monetários, status (pago, pendente, atrasado) e naturezas (receita, despesa) MUST ter hierarquia visual clara e MUST NOT depender apenas de cor para serem entendidos.
- **FR-032**: Todas as telas MUST apresentar estados de carregamento, vazio e erro com ícone ou ilustração, mensagem em português e ação sugerida.
- **FR-033**: Ações concluídas (salvar, pagar, enviar, apagar) MUST dar confirmação visível e discreta, com opção de desfazer quando fizer sentido.
- **FR-034**: O sistema MUST respeitar a preferência de movimento reduzido do sistema e MUST manter contraste mínimo de leitura (WCAG AA) em todas as combinações de cores usadas.
- **FR-035**: A navegação do aplicativo MUST manter as ações principais ao alcance do polegar e a barra inferior com ícones e nomes.
- **FR-036**: As telas existentes MUST ser revistas para consistência (títulos, espaçamentos, botões, formulários, tabelas, cartões e listas), sem remover nenhuma função já disponível.

### Key Entities

- **Conta bancária**: conta com tipo de titular (PF ou PJ), nome, ícone identificador e situação (ativa ou inativa); pode ter cartões vinculados.
- **Dinheiro em espécie**: conta sem tipo de titular, com ícone próprio.
- **Cartão de crédito**: cartão com nome, ícone identificador, dias de fechamento e vencimento e **conta bancária vinculada** (obrigatória para cartões novos; pendente de preenchimento nos antigos).
- **Ícone identificador**: figura escolhida entre um conjunto oferecido, usada para reconhecer conta ou cartão de relance.
- **Tipo de titular**: PF ou PJ, informado em cada conta bancária e herdado, na exibição, pelos cartões vinculados.
- **Lançamento**: receita ou despesa associada a uma conta ou cartão, exibida sempre com o ícone e o nome da origem.
- **Preferência de interface**: menu recolhido ou aberto, lembrada por usuário e aparelho.
- **Identidade visual**: conjunto de logo, favicons, ícone do aplicativo, paleta, tipografia e ícones do GEFINC.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário cadastra uma conta bancária PF, uma PJ e um cartão vinculado a cada uma, com ícone, em até 5 minutos, sem ajuda, em 90% das tentativas.
- **SC-002**: Em 100% das telas que mostram conta ou cartão (lista de contas, lançamentos, escolha no formulário, faturas, painel, fluxo de caixa e projeção), o ícone e o nome aparecem e, para cartões, também a conta vinculada.
- **SC-003**: Registrar uma receita pelo aplicativo, a partir da tela inicial, leva no máximo 3 toques em 100% dos testes de usabilidade, e a ação "Nova receita" é encontrada em até 5 segundos por 95% dos testadores na primeira vez.
- **SC-004**: Nenhum cartão novo é criado sem conta bancária vinculada (0 exceções em testes), e 100% dos cartões antigos continuam funcionando sem perder dados.
- **SC-005**: Em 100% das áreas do web, o menu lateral esquerdo com ícones está presente e a área atual fica destacada; o menu é operável só pelo teclado em 100% dos itens.
- **SC-006**: Uma lista de verificação da identidade visual (paleta, fonte, logo, favicons, ícone do app, ícones, estados) é cumprida em 100% das telas do web e do app.
- **SC-007**: Todas as combinações de cor de texto e fundo usadas atendem contraste AA, e nenhuma informação de receita/despesa ou de status depende só da cor (auditoria automática sem violações).
- **SC-008**: As tarefas principais (lançar despesa, lançar receita, pagar fatura, consultar o painel) não levam mais toques ou cliques do que levavam antes desta feature, e 85% dos testadores avaliam a interface como "clara" ou "muito clara".
- **SC-009**: As telas de painel, lançamentos e faturas continuam abrindo em até 2 segundos com 6.000 lançamentos, com e sem conexão.
- **SC-010**: Os favicons e o ícone do aplicativo aparecem nítidos nos tamanhos usados pelos navegadores e pelos sistemas Android e iOS, verificados em pelo menos um navegador, um aparelho Android e as pré-visualizações do iOS.

## Assumptions

- A diferença entre PF e PJ é uma **classificação** das contas bancárias (selo e filtro): o usuário continua com um único login, e painel, faturas e fluxo de caixa seguem consolidados, podendo ser filtrados por PF ou PJ onde já existe filtro de conta. Não há separação de dados, de relatórios fiscais nem número de documento (CPF ou CNPJ) nesta versão.
- O **ícone identificador** é escolhido em um conjunto oferecido pelo sistema (símbolos de banco, cartão e dinheiro, em cores da identidade); não há envio de imagens do usuário nem uso de marcas registradas de bancos como arquivo oficial. Se o usuário quiser reconhecer o banco, usa nome e ícone genérico colorido.
- Cartões antigos sem conta vinculada continuam funcionando; o vínculo passa a ser obrigatório apenas para cartões novos e quando o usuário editar um cartão antigo.
- A conta bancária de um cartão só pode ser uma conta do mesmo usuário; a conta vinculada pode ser PF ou PJ e define o selo exibido no cartão.
- O manual de identidade `docs/gefinc_identidade_visual_design_system.md` e a imagem compartilhada pelo usuário são a referência visual. O pedido do usuário à ferramenta de design de entregar logo, ícones e favicons em PNG não gerou arquivos acessíveis; por isso o logo, os ícones e os favicons são **produzidos nesta feature a partir do manual** (símbolo em hexágono com casa, seta de crescimento e barras, nas cores Aurora FinTech), em vetorial e PNG, e o usuário pode substituí-los depois por versões finais sem mudar as telas.
- A interface continua **escura por padrão** (dark-first), conforme o manual; um tema claro completo fica fora do escopo, mas os contrastes devem se manter legíveis.
- Melhorar a UI/UX significa consistência, hierarquia, estados, confirmações, navegação e acessibilidade; **não** inclui novas funções de negócio além das listadas (contas PF/PJ, vínculo de cartões, ícones, receita no app, menu lateral).
- O aplicativo móvel mantém os recursos já entregues (offline, biometria, lembretes) e a navegação por abas inferior; a receita rápida segue as mesmas regras de offline e envio único.
- Os requisitos de verificação em iPhone continuam dependendo de acesso a um Mac, como na feature anterior.

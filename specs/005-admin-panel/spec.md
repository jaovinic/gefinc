# Feature Specification: Painel administrativo

**Feature Branch**: `005-admin-panel`
**Created**: 2026-11-14
**Status**: Draft
**Input**: "Um painel administrativo onde o administrador possa gerir o sistema, os usuários e demais questões administrativas."

## Contexto

Hoje o Gefinc não tem nenhuma figura administrativa: todos os usuários são iguais, e qualquer problema operacional (alguém que não
consegue entrar, um e-mail de redefinição de senha que não chegou, uma conta que precisa ser suspensa, uma dúvida sobre se o sistema
está saudável) só se resolve mexendo diretamente no banco ou nos servidores. Isso é lento, arriscado e não deixa rastro de quem fez o quê.

Esta feature cria o **Painel Administrativo**: uma área separada, acessível só a quem tem o perfil **administrador**, para (1) gerir
usuários, (2) acompanhar a saúde e o uso do sistema, e (3) cuidar de questões administrativas como auditoria, envio de e-mails, sessões
e manutenção.

Duas regras atravessam a feature inteira e não são negociáveis:

- **O administrador administra contas, não finanças.** O isolamento de dados por usuário (Princípio III da constituição) continua
  valendo: o painel **nunca** mostra lançamentos, saldos, valores, contas bancárias, cartões, categorias nem transferências de nenhum
  usuário. Ele enxerga a *conta de acesso* (e-mail, nome, situação, sessões), não o que há dentro dela.
- **Toda ação administrativa deixa rastro.** Quem fez, o quê, em quem e quando, sem possibilidade de apagar ou editar o registro pela
  própria interface.

A superfície principal é a **web (desktop)**, com a identidade visual Aurora FinTech e a barra lateral já existentes. O painel
administrativo em si não é entregue no aplicativo móvel. A única parte desta feature que o usuário comum enxerga, o **aviso de
exclusão de conta**, aparece tanto na web quanto no aplicativo móvel (história 12). As regras das features anteriores (lançamentos, parcelas, faturas, painel do usuário, contas, transferências,
offline) continuam valendo e **não mudam**.

## Clarifications

### Sessão 2026-11-14

Decisões do usuário do produto (itens 1 a 8: rodada 4; item 9: rodada 5), tomadas sobre a versão anterior da spec. Cada uma foi propagada para requisitos,
histórias, casos de borda, entidades, critérios de sucesso e premissas.

- **Q: A troca de e-mail feita pelo administrador vale na hora? → R:** Não. O administrador informa o novo e-mail e o sistema envia
  um **código de 6 dígitos para o NOVO endereço**; quem controla esse endereço repassa o código ao administrador, que o digita na
  própria tela do painel (mesma sessão). Só após confirmar o código a troca vale; até lá o e-mail antigo continua válido. O código
  tem validade de 15 minutos e uso único, um novo pedido invalida o anterior, um limite de tentativas erradas (5 como referência)
  o invalida, nunca é exibido ao administrador nem gravado em auditoria/log, e o administrador pode cancelar a troca pendente. As
  sessões do usuário encerram na confirmação; solicitação, confirmação, falha e cancelamento são auditados (sem o código). O usuário
  não reverte a troca já confirmada. **Racional**: provar a posse do novo endereço por quem está em contato com o administrador; um
  e-mail digitado errado não vira posse por terceiro que clique num link. (FR-014, FR-047, FR-052; US9.6 a 9.11; SC-018)
- **Q: Como nasce o primeiro administrador e quem pode alterá-lo? → R:** O mecanismo de e-mail configurado no ambiente foi
  **removido**. O dono da implantação cria o primeiro administrador **diretamente no banco**, marcando uma conta já cadastrada
  normalmente; a spec exige um **roteiro documentado** para isso (procedimento de operação). Esse administrador é **constante/raiz**:
  nenhum outro administrador pode, pelo painel, rebaixá-lo, suspendê-lo, excluí-lo, trocar o e-mail dele ou encerrar as sessões
  dele; só o dono da implantação, pelo banco. Os demais administradores podem ser promovidos e rebaixados por qualquer
  administrador, pelo painel. A recuperação de acesso é sempre feita pelo dono da implantação, pelo banco. Isso elimina a disputa
  de cadastro por e-mail. (FR-003, FR-004, FR-005, FR-051; US1.4, 1.8, 1.9; SC-008, SC-020)
- **Q: Ao cancelar uma exclusão antecipada pelo administrador, para onde volta a conta? → R:** A conta **volta ao agendamento
  original do usuário** (data original, origem "usuário"), que ele volta a poder cancelar; o aviso diz que a exclusão administrativa
  foi cancelada e que a solicitação dele continua para dd/mm. A solicitação guarda a exclusão anterior. O cancelamento restaura
  **exatamente o estado anterior à solicitação** (se a conta estava suspensa, continua suspensa), o que resolve a contradição entre
  "volta ao estado anterior" (US10.2) e "ativa e sem pendência" (FR-049). Como a antecipação só encurta, a data original está no
  futuro. (FR-040, FR-042, FR-049; US10.2, 10.16 a 10.18; US12.3, 12.9; SC-014)
- **Q: Como tratar o volume da auditoria de tentativas negadas? → R:** Registrar a tentativa **uma vez por janela de 15 minutos**
  para o mesmo autor/IP, decisão alvo e tipo de tentativa; as repetições na janela aparecem só como contador/métrica fora da
  auditoria. Vale também para acessos negados de visitantes não autenticados, identificados por **IP**, que é gravado e tratado como
  dado pessoal. O IP real vem do cabeçalho do Cloudflare (CF-Connecting-IP), confiável só quando a requisição vem do túnel. O limite
  de tentativas de login existente continua e as ações do painel também têm limite de taxa. (FR-002, FR-019, FR-050, FR-053, FR-054,
  FR-055; SC-001, SC-017)
- **Q: A exclusão deve esperar o aviso por e-mail? (muda decisão anterior) → R:** Não. A exclusão, com prazo ou imediata,
  **sempre prossegue**, com o aviso enviado ou não. Se o envio falhar, vira uma **comunicação pendente** e a nova tentativa fica a
  cargo do administrador; o painel exibe um **alerta permanente** em todas as telas até que seja entregue ou descartada (descarte
  auditado). Foram removidos o estado "aguardando aviso", a decisão "prosseguir sem aviso" e a confirmação reforçada associada. Para
  o aviso pendente de uma exclusão já executada, o endereço de e-mail fica retido **somente no registro do envio pendente** e é
  apagado ao ser entregue, ao ser descartado ou após 30 dias, o que ocorrer primeiro; o restante dos dados é removido normalmente e
  a auditoria mostra o e-mail anonimizado. (FR-015, FR-037, FR-038, FR-040, FR-056, FR-057; US10.9 a 10.12, 10.20, 10.21; US7.8;
  SC-012, SC-016)
- **Q: O que muda no modo de manutenção? → R:** Usuários comuns ficam sem acesso (login, API e sincronização recebem resposta de
  manutenção; quem já está logado é barrado na próxima requisição); as **alterações offline do aplicativo móvel ficam guardadas no
  aparelho** e sincronizam depois, sem perda; as **tarefas automáticas continuam** (exclusões com prazo vencido, e-mails de aviso);
  o **aceite de convite fica bloqueado**; a **redefinição de senha continua funcionando**; administradores operam normalmente. Com
  cadastro fechado (fora da manutenção), o aceite de convite é permitido. (FR-013, FR-029, FR-058; US8.1, 8.2, 8.7 a 8.10; US9.13;
  SC-019)
- **Q: Por quanto tempo guardar o histórico de envios e como tratar dados pessoais de terceiros? → R:** O histórico de e-mails
  enviados tem retenção própria de **90 dias** e depois é apagado; a auditoria segue indefinida e imutável (o "histórico recente"
  passa a significar 90 dias). Dados pessoais de **convidados sem conta, e-mails antigos (troca de e-mail) e nomes antigos
  (alteração de nome)** passam a ser gravados já anonimizados, convertidos em identificador estável e não reversível; o FR-039 cobre
  as quatro fontes (usuário excluído, convidados, e-mails antigos, nomes antigos), além de IP/dispositivo. O endereço retido para
  aviso pendente (até 30 dias) é a exceção documentada. (FR-022, FR-027, FR-039, FR-059; US7.3, 7.7; SC-011)
- **Q: O que o administrador vê de dados pessoais e como isso é tratado? → R:** A lista de sessões mostra data de início, último
  uso, **IP e tipo de dispositivo/navegador**. A **abertura do detalhe de um usuário** é auditada (não buscas nem listas). **Sem
  exportação de dados nesta versão**, declarado explicitamente. IP e dispositivo são dado pessoal: anonimizados junto com e-mail e
  nome quando o usuário é excluído, e a política de privacidade/aviso ao usuário deve informar a coleta. (FR-008, FR-011, FR-018,
  FR-039, FR-060, FR-061; US2.4, 2.8, 2.9; US3.10; US5.6; SC-020)
- **Q: Por quanto tempo o IP de visitantes sem conta fica na auditoria? (rodada 5) → R:** O IP de **visitantes não autenticados**
  (acessos negados ao painel, FR-002, FR-053, FR-054) é **anonimizado após 90 dias**: a linha da tentativa (tipo, momento,
  resultado, alvo) **não é apagada**; só o IP é convertido em identificador anônimo, **estável e não reversível**, de modo que
  tentativas do mesmo IP continuem correlacionáveis ao longo do tempo sem expor o IP. Isso fecha a lacuna em que esses IPs ficariam
  indefinidamente, já que não há titular com conta para disparar a anonimização do FR-039. A anonimização por prazo é a **única
  exceção adicional à imutabilidade** da auditoria (junto à do FR-039), feita **pelo sistema, nunca por administrador**. O aviso de
  privacidade informa os dois prazos (visitantes: 90 dias; usuários: na exclusão da conta). (FR-020, FR-039, FR-061, FR-062;
  SC-021)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Acesso restrito ao administrador (Priority: P1)

Apenas quem tem o perfil administrador vê e usa o painel. Usuários comuns não veem o item de menu, e mesmo que tentem abrir o endereço
do painel ou chamar suas funções diretamente, são barrados. O primeiro administrador (raiz) é criado pelo dono da implantação
diretamente no banco, marcando uma conta já cadastrada normalmente; a partir daí, qualquer administrador pode conceder e retirar o
perfil dos demais pelo painel, mas ninguém, pelo painel, altera o administrador raiz.

**Why this priority**: É a fundação de segurança da feature. Sem uma barreira confiável, todas as demais histórias seriam um risco.

**Independent Test**: Com um usuário comum e um administrador, conferir que só o segundo vê a área administrativa e consegue usar suas
funções; que o primeiro recebe "acesso negado" tanto pela tela quanto por chamada direta.

**Acceptance Scenarios**:

1. **Given** um usuário comum autenticado, **When** ele navega pelo sistema, **Then** não existe item de menu, link ou atalho para o painel.
2. **Given** um usuário comum autenticado, **When** ele tenta abrir o endereço do painel ou invocar qualquer função administrativa
   diretamente, **Then** o acesso é negado, nada administrativo é revelado, e a tentativa é registrada na auditoria (uma vez por
   janela de 15 minutos, com o IP, FR-053).
3. **Given** um visitante não autenticado, **When** ele tenta acessar o painel, **Then** é direcionado ao login e, depois de entrar como
   usuário comum, continua sem acesso; o acesso negado do visitante é registrado na auditoria, identificado pelo IP (FR-053, FR-054).
4. **Given** um sistema recém-implantado sem nenhum administrador e uma conta já cadastrada normalmente, **When** o dono da
   implantação segue o roteiro documentado e a marca diretamente no banco como administradora raiz, **Then** essa conta passa a
   ver o painel na requisição seguinte; nenhuma interface do sistema, e-mail de ambiente ou cadastro permite criar o primeiro
   administrador (FR-003).
5. **Given** um administrador, **When** ele concede o perfil a outro usuário ativo, **Then** esse usuário passa a ver o painel; e, ao
   retirar o perfil (de qualquer administrador que não seja o raiz), o acesso some na requisição seguinte.
6. **Given** um único administrador no sistema, **When** ele tenta retirar o próprio perfil ou ser suspenso/excluído, **Then** a operação
   é recusada com explicação: o sistema nunca fica sem administrador.
7. **Given** um administrador, **When** ele usa o painel, **Then** em nenhuma tela aparecem lançamentos, saldos, valores, contas, cartões,
   categorias ou transferências de outros usuários (seus próprios dados financeiros continuam disponíveis na área comum do sistema).
8. **Given** o administrador raiz, **When** outro administrador tenta rebaixá-lo, suspendê-lo, excluí-lo, trocar o e-mail dele,
   forçar a redefinição de senha ou encerrar as sessões dele, **Then** todas as operações são recusadas com explicação, nada é
   alterado e as recusas constam na auditoria; só o dono da implantação, pelo banco, altera ou recupera essa conta (FR-051).
9. **Given** que todas as contas administradoras ficaram sem acesso, **When** o dono da implantação segue o roteiro documentado de
   recuperação, **Then** o acesso administrativo é restaurado diretamente no banco, sem depender do painel (FR-003).

---

### User Story 2 - Encontrar e consultar usuários (Priority: P1)

O administrador abre a lista de usuários, busca por e-mail ou nome, filtra por situação (ativo, suspenso, aguardando exclusão, perfil
administrador) e abre o detalhe de um usuário para entender sua situação: quando criou a conta, quando entrou pela última vez, se está
bloqueado por tentativas de login, quantas sessões estão abertas e o histórico administrativo daquela conta.

**Why this priority**: Todo atendimento começa por localizar a conta certa. É o ponto de partida das demais gestões de usuário.

**Independent Test**: Com dezenas de usuários cadastrados, localizar um deles por parte do e-mail, filtrar por "suspensos" e abrir o
detalhe, conferindo que nenhum dado financeiro aparece.

**Acceptance Scenarios**:

1. **Given** vários usuários, **When** o administrador abre a lista, **Then** vê uma lista paginada (e-mail, nome, situação, data de
   criação, último acesso), ordenável por criação e último acesso.
2. **Given** a lista, **When** ele digita parte do e-mail ou do nome, **Then** a lista se reduz aos usuários correspondentes, ignorando
   maiúsculas, minúsculas e acentos.
3. **Given** a lista, **When** ele aplica um filtro de situação, **Then** só aparecem usuários naquela situação, e a contagem refletida
   é mostrada.
4. **Given** um usuário na lista, **When** o administrador abre o detalhe, **Then** vê e-mail, nome de exibição, data de criação,
   situação, último acesso, número de sessões abertas, se há bloqueio por tentativas de login (e até quando), pendência de exclusão,
   troca de e-mail pendente, o histórico de ações administrativas sobre aquela conta e a lista de sessões abertas, com data de
   início, último uso, IP e tipo de dispositivo/navegador de cada uma (FR-008).
5. **Given** o detalhe de um usuário, **When** o administrador o inspeciona, **Then** não há nenhum número, valor, lista ou contagem
   referente a contas, cartões, lançamentos, categorias ou transferências do usuário.
6. **Given** uma busca sem resultados, **When** ela termina, **Then** aparece um estado vazio claro com sugestão de limpar os filtros.
7. **Given** a abertura da lista ou do detalhe, **When** o carregamento demora ou falha, **Then** a tela mostra estados de carregamento
   e de erro com opção de tentar novamente.
8. **Given** o detalhe de um usuário, **When** o administrador o abre, **Then** a abertura é registrada na auditoria (autor, alvo,
   momento); a busca e a lista, por si, não geram registro (FR-060).
9. **Given** as telas de usuários, **When** o administrador procura uma função de exportar dados (lista, sessões, auditoria), **Then**
   ela não existe: esta versão não oferece exportação de dados (FR-018).

---

### User Story 3 - Suspender, reativar, desbloquear e encerrar sessões (Priority: P1)

Diante de uma conta comprometida, abusiva ou com problemas de acesso, o administrador pode **suspender** o usuário (impedindo qualquer
acesso e derrubando suas sessões), **reativá-lo**, **retirar o bloqueio temporário por tentativas de login** (para quem errou a senha
várias vezes e está travado) e **encerrar sessões** abertas (uma ou todas), vendo de cada sessão a data de início, o último uso, o IP
e o tipo de dispositivo/navegador. A suspensão e o encerramento de sessões não geram aviso ao usuário.

**Why this priority**: É a resposta imediata a incidentes de segurança e o atendimento mais comum de quem "não consegue entrar".

**Independent Test**: Suspender um usuário com sessão aberta e conferir que a sessão deixa de funcionar e que o login é recusado;
reativar e conferir que ele volta a entrar; travar um e-mail com tentativas erradas, desbloquear e conferir o login.

**Acceptance Scenarios**:

1. **Given** um usuário ativo com sessões abertas, **When** o administrador o suspende informando o motivo, **Then** todas as suas
   sessões deixam de valer na requisição seguinte e o login é recusado com mensagem orientando a procurar o suporte.
2. **Given** um usuário suspenso, **When** o administrador o reativa, **Then** ele volta a poder entrar normalmente, com todos os seus
   dados intactos.
3. **Given** um usuário travado por excesso de tentativas de login, **When** o administrador retira o bloqueio, **Then** o usuário
   consegue tentar entrar de novo imediatamente.
4. **Given** um usuário com várias sessões, **When** o administrador encerra uma sessão específica, **Then** só aquela deixa de valer;
   ao encerrar todas, ele precisa entrar de novo em todos os dispositivos.
5. **Given** qualquer uma dessas ações, **When** o administrador a confirma, **Then** antes dela é exibida confirmação explícita com o
   efeito esperado, o motivo é obrigatório para suspensão, e a ação é registrada na auditoria.
6. **Given** o próprio administrador, **When** ele tenta se suspender, **Then** a operação é recusada.
7. **Given** outro administrador, **When** um administrador tenta suspendê-lo, **Then** a operação é permitida apenas se restar ao
   menos um administrador ativo; caso contrário, é recusada. Se o alvo for o administrador raiz, a operação é sempre recusada
   (FR-051).
8. **Given** um usuário suspenso, **When** ele tenta desfazer a suspensão por conta própria (entrar com credenciais corretas, usar
   uma sessão antiga ou o token de renovação, usar o fluxo normal de redefinição de senha ou chamar qualquer função diretamente),
   **Then** continua sem acesso, vê apenas a orientação de procurar o suporte (sem opção de reativar a conta) e a tentativa é
   registrada na auditoria como tentativa de reverter decisão administrativa, uma vez por janela de 15 minutos, com o IP
   (FR-047, FR-050, FR-053).
9. **Given** o administrador raiz, **When** outro administrador tenta encerrar uma ou todas as sessões dele, **Then** a operação é
   recusada com explicação e consta na auditoria (FR-051).
10. **Given** a lista de sessões de um usuário, **When** o administrador a consulta, **Then** vê data de início, último uso, IP e
    tipo de dispositivo/navegador de cada sessão (dados pessoais, FR-008, FR-061); ao suspender ou encerrar sessões, o usuário
    não recebe aviso (só a orientação de procurar o suporte ao tentar entrar).

---

### User Story 4 - Forçar redefinição de senha e reenviar e-mail (Priority: P2)

Quando um usuário esqueceu a senha e o e-mail de redefinição não chegou, ou quando há suspeita de que a senha vazou, o administrador
dispara um novo e-mail de redefinição de senha ou **força** a redefinição (a senha atual deixa de valer, as sessões são encerradas e o
usuário recebe o e-mail para criar outra). O administrador **nunca** vê nem define a senha, nem o link ou token de redefinição.

**Why this priority**: Resolve a maior causa de suporte, mas depende de localizar a conta (histórias 1 e 2) e do envio de e-mails.

**Independent Test**: Reenviar o e-mail de redefinição a um usuário e conferir que o link chega só a ele; forçar a redefinição e
conferir que a senha antiga deixa de funcionar.

**Acceptance Scenarios**:

1. **Given** um usuário ativo, **When** o administrador pede o reenvio do e-mail de redefinição, **Then** o usuário recebe o e-mail
   com um novo link válido, e links anteriores deixam de valer.
2. **Given** um usuário ativo, **When** o administrador força a redefinição de senha, **Then** a senha atual e as sessões abertas
   deixam de valer, e o usuário só volta a entrar depois de criar uma nova senha pelo link recebido.
3. **Given** qualquer uma dessas ações, **When** executada, **Then** em nenhum momento o administrador visualiza a senha, o link ou o
   token, e a ação consta na auditoria sem esses valores.
4. **Given** o envio de e-mail indisponível, **When** o administrador tenta a ação, **Then** ele vê uma mensagem clara de falha de envio
   (sem detalhes sensíveis) e a ação não é dada como concluída para o usuário.
5. **Given** repetidos pedidos de reenvio em sequência, **When** ultrapassam o limite de envios por usuário, **Then** o painel avisa
   que é preciso aguardar, protegendo a caixa do usuário contra excesso de mensagens.
6. **Given** um usuário cuja redefinição de senha foi forçada pelo administrador, **When** ele tenta entrar com a senha antiga ou
   usar uma sessão anterior, **Then** é recusado e a tentativa é registrada na auditoria (FR-050); o único caminho previsto é criar
   a nova senha pelo link recebido (FR-047, item b).

---

### User Story 5 - Consultar o registro de auditoria (Priority: P2)

O administrador consulta o histórico de ações administrativas: quem fez (qual administrador), o quê (tipo de ação), em quem ou em
quê (usuário-alvo ou parâmetro), quando e com qual resultado (sucesso, recusada, falha). Pode filtrar por período, administrador, tipo
de ação e usuário-alvo.

**Why this priority**: É o que dá confiança ao poder administrativo; porém, o registro em si (FR-019) vale desde a primeira ação,
independentemente desta tela existir.

**Independent Test**: Executar três ações administrativas (suspender, reativar, reenviar e-mail) e conferir que as três aparecem, na
ordem, com autor, alvo, momento e resultado corretos, e que nenhuma tela permite alterá-las ou apagá-las.

**Acceptance Scenarios**:

1. **Given** ações administrativas já realizadas, **When** o administrador abre a auditoria, **Then** vê uma lista paginada, da mais
   recente para a mais antiga, com data/hora, administrador, ação, alvo e resultado.
2. **Given** a lista, **When** ele filtra por período, administrador, tipo de ação ou usuário-alvo, **Then** só aparecem os registros
   correspondentes.
3. **Given** uma ação recusada (por exemplo, acesso negado a um usuário comum, ou tentativa de suspender o último administrador),
   **When** o administrador consulta a auditoria, **Then** o registro aparece com resultado "recusada" e o motivo da recusa.
4. **Given** qualquer registro, **When** o administrador o abre, **Then** vê o motivo informado (quando houver) e os dados alterados
   de forma resumida (por exemplo, "situação: ativo para suspenso"), nunca senhas, tokens, links ou valores financeiros.
5. **Given** a tela de auditoria, **When** o administrador procura por editar ou excluir um registro, **Then** não existe tal função,
   em nenhuma parte do painel.
6. **Given** um administrador que abre o detalhe de um usuário, **When** a tela é aberta, **Then** a abertura consta na auditoria
   (autor, alvo, momento); buscas e listas de usuários não geram registro (FR-060).
7. **Given** um usuário comum ou visitante que tenta repetidamente acessar o painel, **When** o administrador consulta a auditoria,
   **Then** vê uma única tentativa (com o IP e o autor, ou apenas o IP no caso de visitante) por janela de 15 minutos para a mesma
   combinação de autor/IP, alvo e tipo de tentativa; as repetições dentro da janela não aparecem como registros, apenas como
   contador/métrica fora da auditoria (FR-053).

---

### User Story 6 - Saúde e uso do sistema (Priority: P2)

O administrador abre a visão geral do sistema e vê, de relance: se a aplicação e o banco de dados estão funcionando, a versão em
execução, há quanto tempo o sistema está no ar e **estatísticas agregadas de uso** (usuários cadastrados, ativos nos últimos 7 e 30
dias, novos cadastros por período, quantidade de lançamentos criados por dia), sem expor dado financeiro de ninguém.

**Why this priority**: Dá visibilidade operacional e orienta decisões, mas o sistema pode ser administrado sem ela.

**Independent Test**: Abrir a visão geral e conferir os indicadores de saúde; criar usuários e lançamentos de teste e conferir que os
contadores agregados sobem, sem nenhum valor monetário ou dado individual aparecer.

**Acceptance Scenarios**:

1. **Given** o sistema saudável, **When** o administrador abre a visão geral, **Then** vê "Operacional" para aplicação e banco de dados,
   a versão em execução e o tempo no ar.
2. **Given** o banco de dados fora do ar, **When** o administrador abre a visão geral, **Then** a tela indica o componente com falha
   (ícone e texto, não apenas cor), sem expor endereços, credenciais ou mensagens técnicas internas.
3. **Given** usuários cadastrados, **When** a visão geral carrega, **Then** mostra totais de usuários por situação, ativos em 7 e 30
   dias, novos cadastros dos últimos 30 dias e quantidade de lançamentos criados por dia no período escolhido.
4. **Given** qualquer indicador de uso, **When** exibido, **Then** é sempre uma contagem agregada de todo o sistema: nunca um valor em
   reais, nunca um dado de um usuário específico, e nenhum filtro permite "abrir" um indicador até um usuário.
5. **Given** a visão geral, **When** ela é aberta, **Then** a atualização manual está disponível e a hora da última leitura é exibida.

---

### User Story 7 - Configuração e diagnóstico do envio de e-mails (Priority: P2)

O envio de e-mails (redefinição de senha, convites, avisos de exclusão, códigos de confirmação) é crítico: se falha, o usuário fica sem
acesso ou sem aviso. O administrador vê como o envio está configurado (servidor, porta, remetente; **nunca** a senha), pode disparar
um **e-mail de teste** para o próprio endereço e consulta o histórico de envios dos **últimos 90 dias** (a retenção do histórico é
de 90 dias, depois é apagado), com seus sucessos e falhas, para entender por que "o e-mail não chegou". Os avisos de exclusão e de
cancelamento que falharam aparecem também como comunicações pendentes, sinalizadas por um alerta permanente em todo o painel.

**Why this priority**: Falhas de e-mail geram a maioria dos chamados de acesso; hoje não há como diagnosticá-las sem acessar servidores.

**Independent Test**: Enviar o e-mail de teste e conferir que ele chega e aparece no histórico; simular indisponibilidade do servidor
de e-mail e conferir que a falha aparece no histórico com uma causa legível.

**Acceptance Scenarios**:

1. **Given** o painel de e-mail, **When** aberto, **Then** mostra servidor, porta, endereço remetente e se a configuração está
   completa, com a credencial sempre oculta.
2. **Given** o painel de e-mail, **When** o administrador aciona o teste, **Then** um e-mail de teste é enviado ao endereço do próprio
   administrador e o resultado (sucesso ou falha com causa resumida) é exibido na hora.
3. **Given** envios feitos pelo sistema ou por ações administrativas nos últimos 90 dias, **When** o administrador abre o histórico,
   **Then** vê, do mais recente para o mais antigo, tipo (redefinição, convite, teste, aviso de exclusão, aviso de cancelamento da
   exclusão, código de confirmação de troca de e-mail), destinatário, momento e situação (enviado, falhou), com causa resumida e
   legível nas falhas.
4. **Given** o histórico, **When** o administrador filtra por situação ou tipo, **Then** só aparecem os envios correspondentes.
5. **Given** um envio de redefinição que falhou, **When** o administrador o seleciona, **Then** pode reenviá-lo (história 4) a partir do
   próprio histórico.
6. **Given** o histórico, **When** exibido, **Then** nunca contém o conteúdo da mensagem, links, tokens, senhas ou o código de
   confirmação de troca de e-mail.
7. **Given** envios com mais de 90 dias, **When** o administrador abre o histórico, **Then** eles já foram apagados pelo sistema
   (a retenção do histórico é de 90 dias); a auditoria, ao contrário, segue indefinida (FR-059, FR-022).
8. **Given** avisos de exclusão ou de cancelamento cujo envio falhou, **When** o administrador abre qualquer tela do painel, **Then**
   vê um alerta permanente de comunicações com envio pendente, com acesso à lista das pendentes, em que pode reenviar cada uma ou
   descartá-la (o descarte é auditado); o alerta some quando não houver mais pendentes (FR-056).
9. **Given** o histórico de envios, **When** o administrador o consulta, **Then** o e-mail de um usuário excluído aparece apenas como
   identificador anônimo, e o endereço retido numa comunicação pendente de conta já removida não é exibido (FR-039, FR-057).

---

### User Story 8 - Parâmetros globais e manutenção (Priority: P3)

O administrador ajusta poucos parâmetros globais do sistema e executa ações de manutenção: **abrir ou fechar novos cadastros**
(para impedir criação de contas durante abuso ou convidar só quem se quer), **ativar o modo de manutenção** (usuários comuns veem um
aviso e ficam sem acesso até a janela terminar, mas administradores continuam entrando; as alterações offline do aplicativo móvel
ficam guardadas no aparelho e sincronizam depois, as tarefas automáticas continuam, o aceite de convite fica bloqueado e a
redefinição de senha segue funcionando) e **encerrar todas as sessões** do sistema em caso de incidente. Os demais parâmetros
relevantes (tempo de validade das sessões, limites de tentativas de login) são exibidos em modo somente leitura, para consulta.

**Why this priority**: Úteis em incidentes e janelas de manutenção, mas raros; o sistema opera sem eles.

**Independent Test**: Fechar novos cadastros e conferir que o cadastro é recusado; ativar a manutenção e conferir que um usuário comum
vê o aviso enquanto o administrador segue operando; reabrir tudo e conferir a volta ao normal.

**Acceptance Scenarios**:

1. **Given** cadastros abertos, **When** o administrador os fecha, **Then** novas tentativas de cadastro são recusadas com mensagem
   amigável, usuários já existentes não são afetados e convites pendentes continuam podendo ser aceitos.
2. **Given** o modo de manutenção ativado com uma mensagem, **When** um usuário comum acessa o sistema, **Then** vê o aviso com a
   mensagem e não consegue usar o sistema (login, API e sincronização recebem resposta de manutenção); e um administrador continua
   entrando e usando o painel normalmente.
3. **Given** o modo de manutenção, **When** é desativado, **Then** o sistema volta ao normal sem que os usuários precisem fazer nada
   além de recarregar.
4. **Given** uma emergência, **When** o administrador aciona "encerrar todas as sessões" e confirma digitando uma palavra de
   confirmação, **Then** todos os usuários (exceto a sessão do próprio administrador e as do administrador raiz) precisam entrar
   novamente.
5. **Given** a tela de parâmetros, **When** aberta, **Then** os parâmetros editáveis mostram seu valor atual e quem os alterou por
   último e quando; os somente leitura são claramente identificados como tais.
6. **Given** qualquer alteração de parâmetro ou ação de manutenção, **When** feita, **Then** consta na auditoria com valor anterior e
   novo.
7. **Given** o modo de manutenção ativo, **When** um usuário comum que já estava logado faz a próxima requisição (ou tenta entrar,
   usar a API ou sincronizar), **Then** recebe a resposta de manutenção com a mensagem e é barrado (FR-058).
8. **Given** um usuário do aplicativo móvel com alterações feitas offline, **When** o modo de manutenção está ativo, **Then** o
   aplicativo mostra o aviso, as alterações continuam guardadas no aparelho (sem descarte e sem tratar a resposta como erro de
   sessão) e sincronizam depois que a manutenção termina, sem perda.
9. **Given** o modo de manutenção ativo, **When** há exclusões com prazo vencido ou e-mails de aviso a enviar, **Then** as tarefas
   automáticas continuam sendo executadas normalmente.
10. **Given** o modo de manutenção ativo, **When** alguém tenta aceitar um convite, **Then** o aceite é recusado; **When** alguém
    redefine a senha por um link válido, **Then** a redefinição funciona normalmente (FR-058).
11. **Given** o administrador raiz com sessões abertas, **When** outro administrador aciona "encerrar todas as sessões" do
    sistema, **Then** as sessões do raiz (e a do administrador que acionou) permanecem (FR-030, FR-051).

---

### User Story 9 - Convidar e editar usuários (Priority: P3)

O administrador pode **convidar** uma pessoa informando seu e-mail: ela recebe um link para definir a própria senha e ativar a conta
(o administrador nunca define senhas). Pode também **corrigir dados cadastrais** de um usuário: o nome de exibição (efeito
imediato) e o e-mail, por exemplo, quando alguém digitou o e-mail errado. A troca de e-mail **não é imediata**: o sistema envia um
código de 6 dígitos ao novo endereço, quem controla esse endereço o repassa ao administrador, que o digita na própria tela, e só
então a troca vale (até lá o e-mail antigo continua válido). O racional é provar a posse do novo endereço por quem está em contato
com o administrador, de modo que um e-mail digitado errado não vire posse por terceiro que clique num link.

**Why this priority**: Cadastro e correção de dados já existem como autoatendimento do usuário; a intervenção do administrador é
conveniência, não necessidade.

**Independent Test**: Convidar um e-mail novo, abrir o link recebido, definir a senha e entrar; corrigir o nome de um usuário e conferir
que ele vê o novo nome.

**Acceptance Scenarios**:

1. **Given** um e-mail ainda não cadastrado, **When** o administrador o convida, **Then** a pessoa recebe um convite com link de validade
   limitada, que permite definir a senha e entrar; antes de aceitar, o convite aparece como "pendente".
2. **Given** um e-mail já cadastrado, **When** o administrador tenta convidá-lo, **Then** a operação é recusada com a informação de que
   o e-mail já tem conta.
3. **Given** um convite pendente, **When** o administrador o reenvia ou cancela, **Then** o link anterior deixa de valer.
4. **Given** um convite expirado, **When** a pessoa tenta usá-lo, **Then** vê mensagem de expiração e que deve pedir um novo convite.
5. **Given** o detalhe de um usuário, **When** o administrador altera o nome de exibição, **Then** a mudança vale imediatamente e consta
   na auditoria.
6. **Given** o detalhe de um usuário, **When** o administrador informa um novo e-mail, **Then** a troca **não vale na hora**: o novo
   e-mail não pode pertencer a outra conta, o sistema envia um **código de 6 dígitos ao NOVO endereço**, o detalhe mostra a troca
   como pendente e o e-mail antigo continua válido para entrar e receber mensagens (FR-014, FR-052).
7. **Given** uma troca de e-mail pendente, **When** quem controla o novo endereço repassa o código ao administrador e ele o digita
   na própria tela do painel dentro de 15 minutos, **Then** a troca vale, as sessões do usuário são encerradas, o e-mail anterior e
   o novo são notificados, e solicitação e confirmação constam na auditoria, sem o código (que nunca é exibido pelo sistema).
8. **Given** uma troca de e-mail pendente, **When** o código está expirado, já foi usado, foi invalidado por um novo pedido ou foi
   digitado errado além do limite de tentativas (5 como referência), **Then** a confirmação é recusada, o código deixa de valer, o
   e-mail antigo segue válido e a falha consta na auditoria; o administrador pode pedir uma nova troca.
9. **Given** uma troca de e-mail pendente, **When** o administrador a cancela, **Then** o código deixa de valer, o e-mail antigo
   segue válido e o cancelamento consta na auditoria.
10. **Given** uma troca de e-mail confirmada, **When** o usuário afetado tenta revertê-la ou cancelar uma troca pendente por conta
    própria, **Then** é recusado e auditado (FR-047, FR-050); só um administrador pode revertê-la, por uma nova troca.
11. **Given** o administrador raiz, **When** outro administrador tenta trocar o e-mail dele, **Then** a operação é recusada e a
    recusa consta na auditoria (FR-051).
12. **Given** um convite pendente para um e-mail que depois se cadastra por conta própria, **When** o cadastro é concluído, **Then**
    o convite é consumido (marcado "aceito"); **Given** um convite criado por outro administrador, **When** qualquer administrador o
    reenvia ou cancela, **Then** a ação é permitida e consta na auditoria (FR-013).
13. **Given** o modo de manutenção ativo, **When** uma pessoa tenta aceitar um convite, **Then** o aceite é recusado com o aviso de
    manutenção; **Given** cadastros fechados fora da manutenção, **When** ela aceita um convite pendente válido, **Then** o aceite é
    permitido (FR-058).

---

### User Story 10 - Excluir usuário com salvaguardas (Priority: P3)

Para atender a pedidos de exclusão de dados (LGPD) ou remover contas abusivas, o administrador pode iniciar a **exclusão** de um
usuário, informando obrigatoriamente um **motivo** (um dos motivos ativos cadastrados, mais uma justificativa em texto livre) e
escolhendo o **prazo**: **imediato** ou **em N dias** (N escolhido por ele, de 1 a 30). A exclusão remove os dados pessoais e
financeiros da pessoa de forma irreversível ao fim do prazo escolhido. O administrador também pode **antecipar** uma exclusão que o
próprio usuário já tenha agendado pelo autoatendimento, nunca adiá-la. Por ser a ação mais grave do painel, exige confirmação
reforçada (digitar o e-mail do usuário e reautenticar com a senha do administrador), e o formulário **orienta o administrador a não
escrever dados pessoais do usuário na justificativa**. O administrador raiz não pode ser excluído pelo painel.

**O usuário afetado é sempre avisado**, com o prazo e a **mensagem genérica** do motivo escolhido; o texto livre da justificativa
nunca é enviado ao usuário nem exibido a ele. **A exclusão, com prazo ou imediata, sempre prossegue, com o e-mail de aviso enviado
ou não.** O aviso por e-mail é disparado na solicitação (nas exclusões imediatas, a tentativa de envio antecede a remoção). Se o
envio falhar, o aviso vira uma **comunicação pendente**: a nova tentativa fica a cargo do administrador, e o painel mostra, em
todas as telas, um **alerta permanente** de que existem comunicações com envio pendente, até que sejam entregues ou descartadas pelo
administrador (o descarte é auditado). Quando a conta já foi removida, o endereço de e-mail fica retido **somente no registro da
comunicação pendente** e é apagado ao ser entregue, ao ser descartado ou 30 dias depois da remoção, o que ocorrer primeiro; o
restante dos dados do usuário é removido normalmente.

Enquanto houver prazo em curso, o administrador pode **cancelar** a solicitação (o usuário é avisado por e-mail, com texto genérico,
e dentro do aplicativo, história 12). O cancelamento restaura **exatamente o estado anterior à solicitação**: se a conta estava
suspensa, continua suspensa; se a exclusão era uma antecipação de uma exclusão que o próprio usuário agendara, a conta volta ao
agendamento original dele (data original, origem "usuário"), que ele volta a poder cancelar. Uma exclusão imediata, depois de
executada, não pode ser cancelada nem desfeita. Quando o usuário é efetivamente excluído, a auditoria e o histórico de envios
preservam que a exclusão ocorreu, quem a executou e a justificativa do administrador, mas o e-mail e o nome do usuário passam a
constar apenas como um identificador anônimo.

**Why this priority**: Importante para conformidade e higiene, porém infrequente e já coberta, para o próprio usuário, pelo fluxo atual.

**Independent Test**: Iniciar a exclusão de um usuário de teste com prazo de alguns dias, conferir a situação "aguardando exclusão",
a notificação recebida (prazo e mensagem genérica, sem o texto do administrador) e a possibilidade de cancelar; repetir com prazo
imediato, inclusive com o envio de e-mail indisponível (a exclusão prossegue e surge o alerta permanente de comunicação pendente);
concluir a exclusão e conferir que os dados somem e que, na auditoria, e-mail e nome estão anonimizados e a justificativa foi mantida.

**Acceptance Scenarios**:

1. **Given** um usuário ativo, **When** o administrador inicia a exclusão informando o motivo (um motivo ativo e a justificativa),
   escolhendo o prazo e confirmando digitando o e-mail do usuário e reautenticando com a própria senha, **Then** a conta passa a
   "aguardando exclusão", fica sem acesso e a data final aparece no detalhe.
2. **Given** um usuário aguardando exclusão com prazo em curso, **When** o administrador cancela a solicitação, **Then** a conta
   volta **exatamente ao estado anterior à solicitação** (ativa, ou suspensa se estava suspensa; ou, se a exclusão era uma
   antecipação, ao agendamento original do usuário, cenário 17), com todos os dados, o usuário recebe um e-mail de cancelamento com
   texto genérico e o aviso de cancelamento no aplicativo (história 12), e a ação consta na auditoria.
3. **Given** o fim do prazo, **When** a exclusão é executada, **Then** dados pessoais e financeiros do usuário são removidos de
   forma irreversível, e o e-mail e o nome deixam de aparecer em qualquer lugar do painel (inclusive no histórico de envios e na
   auditoria, onde passa a constar um identificador anônimo), enquanto a justificativa do administrador permanece na auditoria.
4. **Given** o último administrador ativo, **When** alguém tenta excluí-lo, **Then** a operação é recusada.
5. **Given** o próprio administrador, **When** ele tenta excluir a si mesmo pelo painel, **Then** a operação é recusada; ele deve
   usar o fluxo normal de exclusão de conta do usuário (que também respeita a salvaguarda do último administrador).
6. **Given** a exclusão, **When** o administrador a inicia, **Then** deve informar o motivo, escolher o prazo (imediato ou de 1 a 30
   dias) e a tela deixa claro, antes da confirmação, que a ação apaga permanentemente os dados financeiros do usuário ao fim do prazo
   escolhido (ou na hora, se imediato) e que não poderá ser desfeita depois disso.
7. **Given** o formulário de exclusão, **When** o administrador chega ao campo da justificativa, **Then** vê um aviso claro orientando a
   NÃO escrever dados pessoais do usuário (nome, e-mail, documentos, telefone etc.) e lembrando que o texto fica registrado na
   auditoria e não é enviado ao usuário.
8. **Given** uma solicitação de exclusão com prazo (1 a 30 dias) registrada, **When** ela é concluída pelo administrador, **Then** o
   usuário recebe um e-mail informando o prazo e a mensagem genérica do motivo escolhido; o texto livre da justificativa não aparece
   no e-mail.
9. **Given** uma exclusão com prazo cujo e-mail de aviso falhou, **When** a solicitação é registrada, **Then** a exclusão segue
   normalmente, o administrador vê um aviso claro da falha, a falha consta no histórico de envios e na auditoria, o aviso vira uma
   comunicação pendente e o administrador pode reenviá-lo ou descartá-lo (FR-038, FR-056).
10. **Given** um prazo "imediato", **When** o administrador confirma, **Then** o sistema tenta enviar o aviso por e-mail primeiro,
    informando que a exclusão foi realizada sem prazo de espera, e em seguida a remoção é executada **independentemente do
    resultado do envio**; como não há janela para reagir, o administrador é avisado na confirmação de que a ação não poderá ser
    cancelada depois de executada.
11. **Given** uma exclusão imediata cujo e-mail de aviso falhou, **When** o sistema detecta a falha, **Then** a remoção **prossegue
    mesmo assim**, o aviso vira uma **comunicação pendente** (o endereço fica retido somente nesse registro, não exibido, e é
    apagado ao ser entregue, descartado ou 30 dias após a remoção), o administrador é avisado, a falha consta na auditoria e o
    painel passa a exibir o alerta permanente de comunicações pendentes; não há decisão de "prosseguir sem aviso" nem confirmação
    reforçada associada (FR-038, FR-056, FR-057).
12. **Given** uma comunicação pendente de aviso (de exclusão executada ou de cancelamento), **When** o administrador a **descarta**,
    **Then** a comunicação deixa de contar no alerta, o endereço retido é apagado, e o descarte consta na auditoria; se ele a
    reenvia com sucesso, a comunicação passa a "entregue" e o endereço retido também é apagado (FR-056, FR-057).
13. **Given** um usuário que já agendou a própria exclusão pelo autoatendimento, **When** o administrador antecipa a exclusão
    escolhendo um prazo anterior ao já agendado (ou imediato), **Then** o novo prazo substitui o anterior, o usuário é avisado
    do novo prazo (e-mail e aplicativo) e a ação consta na auditoria; prazos posteriores ao já agendado são recusados.
14. **Given** o administrador tentando concluir a solicitação, **When** ele não informa o motivo, não escolhe o prazo, escolhe um prazo
    fora do intervalo permitido, escolhe um motivo desativado ou erra a senha na reautenticação, **Then** a exclusão não é iniciada e
    a tentativa recusada consta na auditoria.
15. **Given** uma exclusão pedida por administrador (com prazo) em curso, **When** o usuário afetado tenta cancelá-la por conta
    própria (tela de entrada com credenciais corretas, tela Minha conta ou chamada direta ao servidor), **Then** a tentativa é
    recusada, a exclusão permanece como está e a tentativa é registrada na auditoria como tentativa de reverter decisão
    administrativa (FR-047, FR-050); só um administrador pode cancelá-la.
16. **Given** uma exclusão que o usuário agendou pelo autoatendimento e que o administrador antecipou, **When** o usuário tenta
    cancelá-la, **Then** é recusado, pois a exclusão passou a ser de origem administrativa (FR-049); enquanto ninguém a antecipar,
    ele continua podendo cancelar a sua própria exclusão.
17. **Given** uma exclusão que o administrador antecipou (o usuário a havia agendado para dd/mm), **When** o administrador cancela
    a exclusão administrativa, **Then** a conta **volta ao agendamento original do usuário** (data original dd/mm, origem
    "usuário"), que ele volta a poder cancelar; o usuário recebe o e-mail e o aviso dizendo que a exclusão administrativa foi
    cancelada e que a solicitação dele continua para dd/mm; a solicitação guardava a exclusão anterior; a ação consta na
    auditoria (FR-049, FR-040, FR-042).
18. **Given** uma conta que estava suspensa quando o administrador solicitou a exclusão, **When** o administrador cancela a
    solicitação, **Then** a conta volta exatamente ao estado anterior: continua suspensa, sem ser reativada (FR-049).
19. **Given** o administrador raiz, **When** outro administrador tenta excluí-lo ou antecipar sua exclusão pelo painel, **Then** a
    operação é recusada com explicação e consta na auditoria como recusada (FR-051).
20. **Given** uma exclusão executada cujo aviso por e-mail falhou, **When** o administrador consulta o painel, **Then** em todas as
    telas há um alerta permanente de que existem comunicações com envio pendente, com acesso à lista das pendentes, até que cada
    uma seja entregue (nova tentativa) ou descartada pelo administrador (FR-056).
21. **Given** uma comunicação pendente de exclusão já executada, **When** 30 dias se passam desde a remoção da conta sem entrega nem
    descarte, **Then** o endereço de e-mail retido é apagado, a comunicação passa a "expirada" e deixa de contar no alerta (FR-057).

---

### User Story 11 - Gerenciar os motivos de exclusão (Priority: P3)

O administrador mantém a lista de **motivos de exclusão** usados nos avisos ao usuário. Existem quatro motivos iniciais (solicitação do
titular dos dados; violação dos termos de uso; determinação legal ou de autoridade; outros motivos administrativos), e o
administrador pode **cadastrar novos motivos**, cada um com uma **mensagem genérica** que será mostrada ao usuário nos avisos.
Pode também **editar** um motivo e **desativá-lo** (e reativá-lo) quando deixar de ser adequado. Os quatro motivos iniciais não
podem ser apagados, apenas desativados.

**Why this priority**: Amplia a flexibilidade do aviso, mas o fluxo de exclusão já funciona com os quatro motivos iniciais.

**Independent Test**: Criar um motivo novo com sua mensagem, usá-lo numa exclusão com prazo e conferir que o usuário vê aquela mensagem;
editar a mensagem e conferir que a exclusão em andamento mantém a mensagem original; desativar o motivo e conferir que ele não aparece
mais no formulário; conferir que tudo consta na auditoria.

**Acceptance Scenarios**:

1. **Given** a tela de motivos, **When** aberta, **Then** lista os motivos (iniciais e cadastrados) com nome, mensagem genérica e
   situação (ativo ou inativo), identificando os quatro iniciais.
2. **Given** a tela de motivos, **When** o administrador cria um motivo informando nome e mensagem genérica, **Then** o motivo fica
   ativo e disponível no formulário de exclusão, e a criação consta na auditoria.
3. **Given** um motivo, **When** o administrador edita o nome ou a mensagem, **Then** as novas exclusões passam a usar o texto
   atualizado, e a edição consta na auditoria com o valor anterior e o novo.
4. **Given** uma exclusão em andamento que usa um motivo, **When** o motivo é editado ou desativado depois, **Then** a mensagem já
   enviada ao usuário, a que ele vê no aplicativo e a de eventuais reenvios permanecem as mesmas da solicitação original.
5. **Given** um motivo ativo, **When** o administrador o desativa, **Then** ele deixa de ser oferecido em novas exclusões, mas continua
   visível nos registros antigos; um motivo desativado pode ser reativado; a ação consta na auditoria.
6. **Given** um dos quatro motivos iniciais, **When** o administrador procura apagá-lo, **Then** não existe tal função (apenas
   desativar); o mesmo vale para os motivos cadastrados, que também só podem ser desativados, preservando o histórico.
7. **Given** o último motivo ativo, **When** o administrador tenta desativá-lo, **Then** a operação é recusada com explicação, pois
   sem motivo ativo não seria possível solicitar exclusões.
8. **Given** o cadastro ou edição de uma mensagem genérica, **When** ela contém dados de um usuário específico (e-mail, nome, número
   de documento, telefone) ou campos que seriam preenchidos com dados do usuário ou com a justificativa livre, **Then** é recusada
   com explicação de que a mensagem deve ser genérica.
9. **Given** o cadastro de um motivo sem nome, sem mensagem, com nome repetido ou com mensagem acima do tamanho permitido, **Then**
   é recusado com mensagem clara, e a tentativa recusada consta na auditoria.

---

### User Story 12 - Aviso de exclusão dentro do aplicativo (Priority: P3)

Além do e-mail, o usuário que teve a exclusão **com prazo** solicitada por um administrador vê, **na web e no aplicativo móvel**, um
aviso visível, em linguagem clara e acessível, com o **prazo** (data final) e o **motivo genérico**, nunca a justificativa livre.
Se o administrador cancela a exclusão, o usuário vê, uma única vez e de forma dispensável, um aviso de que a exclusão administrativa
foi cancelada: a conta segue ativa ou, se a exclusão era uma antecipação de uma exclusão que o próprio usuário agendara, o aviso
diz que a solicitação dele continua para a data original. Para exclusão imediata não existe janela de aviso no aplicativo (a conta
é removida logo após a tentativa de aviso por e-mail).

**Why this priority**: O e-mail pode não chegar ou ser ignorado; o aviso na própria porta de entrada do aplicativo reduz o risco de o
usuário ser surpreendido, mas é complementar ao e-mail.

**Independent Test**: Solicitar como administrador uma exclusão com prazo para um usuário de teste; abrir a web e o aplicativo móvel
como esse usuário e conferir o aviso com prazo e motivo genérico, sem a justificativa; cancelar a exclusão como administrador e conferir
que o aviso de cancelamento aparece uma vez e some ao ser dispensado.

**Acceptance Scenarios**:

1. **Given** uma exclusão com prazo solicitada por administrador, **When** o usuário afetado abre a web ou o aplicativo móvel (ou tenta
   entrar), **Then** vê um aviso visível com a data final da exclusão e a mensagem genérica do motivo, em linguagem simples, e que, se
   tiver dúvidas, deve procurar o suporte.
2. **Given** esse aviso, **When** exibido, **Then** nunca contém a justificativa livre do administrador nem dados de outros usuários, e
   não depende apenas de cor para ser entendido (ícone e texto), sendo anunciado corretamente por leitores de tela.
3. **Given** uma exclusão com prazo cancelada pelo administrador, **When** o usuário volta a abrir ou a entrar na web ou no aplicativo
   móvel, **Then** vê, uma única vez, um aviso dispensável informando que a exclusão administrativa foi cancelada e que a conta
   segue ativa (ou, se a conta estava suspensa antes da solicitação, que continua sem acesso, com a orientação de procurar o
   suporte); depois de dispensado (ou exibido uma vez), não reaparece.
4. **Given** uma exclusão imediata, **When** executada, **Then** não há janela de aviso no aplicativo: o único aviso é a tentativa
   de e-mail feita antes da remoção (história 10); se o envio falhar, a exclusão prossegue e o aviso vira comunicação pendente.
5. **Given** uma exclusão que o administrador antecipou, **When** o usuário abre o aplicativo, **Then** o aviso mostra o novo prazo, e
   não o anterior.
6. **Given** o usuário com exclusão agendada pelo administrador, **When** ele tenta entrar ou abre o aviso, **Then** a tela de
   entrada mostra o prazo, a mensagem genérica do motivo e a orientação de procurar o suporte, e não lhe é oferecida a opção de
   cancelar a exclusão por conta própria (só o administrador pode cancelar uma exclusão solicitada por ele, FR-047); a exclusão
   agendada pelo próprio usuário continua podendo ser cancelada por ele, como hoje.
7. **Given** uma exclusão solicitada pelo próprio usuário (autoatendimento), **When** ele abre o aplicativo, **Then** continua vendo o
   aviso atual de exclusão agendada, sem motivo genérico de administrador, e com a opção de cancelá-la com as credenciais.
8. **Given** o aviso de uma exclusão pedida por administrador, **When** o usuário tenta contornar a ausência da opção de cancelar
   (por exemplo, repetindo o pedido de cancelamento por outro canal), **Then** todas as tentativas são recusadas e auditadas
   (FR-050), uma vez por janela de deduplicação (FR-053).
9. **Given** uma exclusão com prazo que o administrador antecipou e depois cancelou, **When** o usuário abre a web ou o aplicativo
   móvel (ou tenta entrar), **Then** vê, uma única vez, o aviso de que a exclusão administrativa foi cancelada e que a solicitação
   dele continua para a data original (dd/mm), e a tela de entrada volta a oferecer a opção de cancelar a exclusão que ele mesmo
   agendou (FR-049).

---

### Edge Cases

- **Dois administradores agindo ao mesmo tempo no mesmo usuário** (um suspende, outro reenvia e-mail): a última ação prevalece
  segundo a ordem de recebimento, nenhuma se perde da auditoria, e a tela mostra a situação atual ao ser recarregada.
- **Dois administradores removendo-se ao mesmo tempo** (cada um retira o perfil do outro, ou suspende/exclui o outro): no máximo uma
  das operações tem efeito; a outra é recusada, de modo que o sistema nunca fica sem administrador ativo (FR-005, SC-008). O
  administrador raiz, quando existe, permanece intocável.
- **Retirar o perfil de administrador de alguém que está com o painel aberto**: a próxima ação dessa pessoa é negada e a tela a leva
  de volta à área comum, sem perder o acesso como usuário comum.
- **Sistema recém-implantado sem nenhum administrador**: o sistema opera normalmente sem painel até o dono da implantação marcar,
  diretamente no banco e conforme o roteiro documentado, uma conta já cadastrada como administradora raiz (FR-003). Não existe e-mail
  de administrador configurado no ambiente, portanto não há disputa de cadastro: quem se cadastrar com qualquer e-mail não ganha
  perfil administrador.
- **Tentativa de outro administrador contra o administrador raiz** (rebaixar, suspender, excluir, trocar o e-mail, forçar a
  redefinição de senha ou encerrar sessões): recusada com explicação, nada é alterado e a recusa consta na auditoria (FR-051).
- **Usuário suspenso tenta redefinir senha pelo fluxo normal**: o acesso continua recusado; redefinir a senha não reativa a conta.
- **Reenvio de e-mail de redefinição para conta aguardando exclusão ou suspensa**: a ação é recusada com explicação, pois a conta não
  pode ser usada.
- **Servidor de e-mail lento**: o painel mostra o resultado quando houver, sem travar; o envio fica registrado como "falhou" se
  esgotar o tempo limite.
- **Lista de usuários muito grande (milhares)**: continua paginada e a busca continua rápida; nenhuma tela carrega todos os usuários
  de uma vez.
- **Busca por e-mail com caracteres especiais ou muito longa**: tratada como texto literal (a busca tem tamanho máximo, definido no
  plano); nunca causa erro nem revela dados.
- **Sistema em modo de manutenção com todos os administradores sem acesso** (conta suspensa por engano): o acesso administrativo
  sempre pode ser restaurado pelo dono da implantação, diretamente no banco, seguindo o roteiro documentado (FR-003), sem depender do
  painel. O administrador raiz não pode ser suspenso por outro administrador, o que reduz esse risco.
- **Modo de manutenção ativo**: usuários comuns recebem resposta de manutenção em login, API e sincronização; quem já estava logado é
  barrado na próxima requisição; as alterações offline do aplicativo móvel ficam no aparelho e sincronizam depois, sem perda; as
  tarefas automáticas (exclusões vencidas e e-mails de aviso) continuam; o aceite de convite é bloqueado, mas a redefinição de senha
  segue funcionando; administradores operam normalmente (FR-058).
- **Cadastros fechados (fora da manutenção)**: novos cadastros por conta própria são recusados, mas convites pendentes continuam
  podendo ser aceitos.
- **Muitas tentativas de acesso negado ao painel** por um usuário comum ou visitante: a tentativa é registrada na auditoria **uma vez
  por janela de 15 minutos** para o mesmo autor/IP, alvo e tipo, com o IP; as repetições na janela viram apenas contador/métrica fora
  da auditoria, e as tentativas ficam sujeitas ao limite de tentativas já existente (FR-053, FR-055). Isso vale também para visitantes
  não autenticados, identificados por IP.
- **Excesso de ações do painel por um administrador**: a ação excedente é recusada com orientação de aguardar (limite de taxa,
  FR-055); falhas repetidas de reautenticação contam no limite de login e, após N falhas, a sessão do administrador é revogada.
- **Requisição ao painel fora do túnel do Cloudflare com cabeçalho de IP forjado**: o cabeçalho não é aceito; o IP registrado é o da
  conexão real (FR-054).
- **Auditoria muito grande**: como os registros são guardados indefinidamente, a consulta continua paginada e filtrável e permanece
  rápida com o passar dos anos; nenhum registro de auditoria é descartado por idade (o histórico de envios de e-mail, esse sim, é
  apagado após 90 dias, FR-059; já o IP de visitantes sem conta é anonimizado após 90 dias, mas a linha permanece, FR-062). A deduplicação das tentativas (FR-053) evita que repetições inundem o registro.
- **Troca de e-mail pendente**: enquanto o código não é confirmado, o e-mail antigo continua válido. Código expirado (15 minutos),
  já usado, invalidado por um novo pedido ou invalidado pelo limite de tentativas erradas: a troca é recusada, o administrador pode
  pedir outra e a falha é auditada. O administrador pode cancelar a troca pendente. Se o novo e-mail passar a pertencer a outra
  conta antes da confirmação, a confirmação é recusada. O código nunca aparece ao administrador, na auditoria, no histórico de
  envios nem em log (FR-052).
- **Exclusão imediata de usuário**: não há janela para o usuário reagir nem como cancelar depois de executada. O sistema tenta
  enviar o aviso por e-mail ANTES da remoção, mas a remoção ocorre mesmo que o envio falhe; o resultado fica registrado e, depois, o
  e-mail e o nome são anonimizados nos registros (exceto o endereço retido só no envio pendente, FR-057).
- **Falha no envio do aviso de exclusão** (e-mail indisponível, endereço inválido, tempo esgotado), com prazo ou imediata: a exclusão
  segue (para não bloquear, por exemplo, uma ordem legal); a falha é registrada no histórico de envios e na auditoria, o
  administrador é avisado na hora, e o aviso vira uma **comunicação pendente**. Um alerta permanente, visível em todo o painel,
  informa que existem comunicações com envio pendente até que sejam entregues ou descartadas pelo administrador (descarte auditado).
  Para uma exclusão já executada, o endereço fica retido só no registro da comunicação pendente e é apagado ao ser entregue,
  descartado ou 30 dias após a remoção da conta, o que ocorrer primeiro (FR-056, FR-057). O aviso dentro do aplicativo, nas exclusões
  com prazo, continua valendo.
- **Exclusão já agendada pelo próprio usuário**: o administrador pode antecipá-la (prazo menor ou imediato), nunca adiá-la; o
  usuário é avisado do novo prazo, por e-mail e dentro do aplicativo. A solicitação guarda a exclusão anterior (data original e
  origem "usuário").
- **Administrador tenta excluir a si mesmo, o último administrador ou o administrador raiz**: recusado, com explicação e registro na
  auditoria (FR-005, FR-017 e FR-051).
- **Cancelamento da exclusão pelo administrador**: possível enquanto houver prazo em curso; uma exclusão imediata, depois de
  executada, não pode ser cancelada nem desfeita. O cancelamento restaura exatamente o estado anterior à solicitação: se a conta
  estava suspensa, continua suspensa; se a exclusão cancelada era uma antecipação, a conta volta ao agendamento original do usuário
  (data original, origem "usuário"), que ele volta a poder cancelar, e o aviso diz que a exclusão administrativa foi cancelada e que
  a solicitação dele continua para dd/mm. O cancelamento notifica o usuário por e-mail (texto genérico) e pelo aviso dentro do
  aplicativo (FR-049).
- **Cancelamento e fim do prazo ao mesmo tempo**: prevalece o que for registrado primeiro; se a exclusão já foi executada, o
  cancelamento é recusado com explicação e consta na auditoria.
- **Texto livre da justificativa com dados pessoais**: a justificativa é mantida na auditoria mesmo depois da exclusão do usuário
  (só os dados pessoais previstos no FR-039 são anonimizados), então pode acabar guardando dados pessoais que o administrador
  digitou. Mitigação: o formulário exibe aviso orientando a não escrever dados pessoais (FR-048); a justificativa nunca é enviada nem
  mostrada ao usuário. O risco residual foi aceito (ver Premissas).
- **Dados pessoais de terceiros sem conta ou antigos na auditoria**: e-mails de convidados sem conta, e-mails antigos (troca de
  e-mail) e nomes antigos (alteração de nome) são gravados já anonimizados; o IP de visitantes não autenticados é gravado nas
  tentativas auditadas, tratado como dado pessoal e **anonimizado após 90 dias** (a linha da tentativa permanece, só o IP vira um
  identificador anônimo e estável, FR-039, FR-054, FR-061, FR-062).
- **IP de visitante sem conta com mais de 90 dias**: o sistema converte o IP em identificador anônimo estável e não reversível; a
  tentativa continua consultável na auditoria (tipo, momento, resultado, alvo) e tentativas do mesmo IP seguem correlacionáveis
  entre si. Nenhum administrador pode antecipar, adiar ou desfazer essa anonimização, e ela não altera o registro de usuários
  autenticados (cujo IP é anonimizado na exclusão da conta, FR-039). Se o processamento ficar parado (indisponibilidade), os
  registros vencidos são anonimizados assim que ele voltar (FR-062).
- **Motivo editado ou desativado com exclusão em andamento**: a mensagem já enviada, a exibida no aplicativo e a de reenvios são as
  da solicitação original; a mudança só vale para novas exclusões.
- **Último motivo ativo**: não pode ser desativado, para que sempre seja possível solicitar uma exclusão.
- **Mensagem genérica com dados pessoais ou texto livre**: recusada no cadastro ou edição do motivo; a mensagem nunca é preenchida
  com dados do usuário nem com a justificativa.
- **Aviso no aplicativo para usuário sem sessão**: como a conta em exclusão fica sem acesso, o aviso aparece na tela de entrada
  (ao abrir o aplicativo ou ao tentar entrar), e o aviso de cancelamento aparece na primeira abertura ou entrada depois do
  cancelamento.
- **Aviso de cancelamento nunca visto**: o aviso fica pendente até ser exibido uma vez ou dispensado; não reaparece depois.
- **Administrador (autor das ações) excluído ou removido**: seu e-mail, nome, IP e dispositivo nos registros também são anonimizados,
  mantendo-se o registro da ação com um identificador anônimo e consistente.
- **Dados financeiros acidentalmente solicitados por tela ou chamada administrativa** (por exemplo, "ver saldo do usuário X"): não
  existe tal função; qualquer tentativa de acessar dados financeiros de terceiros por qualquer caminho continua resultando em
  "não encontrado/negado", mesmo para administradores. Também não existe exportação de dados pelo painel (FR-018).
- **Usuário tenta reverter uma decisão administrativa por qualquer canal** (tela de entrada, tela Minha conta, aplicativo móvel
  ou chamada direta ao servidor, com ou sem credenciais corretas): a tentativa é recusada sem alterar a conta, com mensagem que
  orienta a procurar o suporte, e fica na auditoria como tentativa de reverter decisão administrativa (FR-047, FR-050), uma vez por
  janela de 15 minutos para o mesmo autor/IP, decisão alvo e tipo de tentativa (FR-053). Pedir a exclusão da própria conta,
  redefinir a senha pelo fluxo normal ou trocar de dispositivo não desfaz a decisão: uma conta suspensa continua suspensa e uma
  exclusão administrativa mantém o prazo. Requisições repetidas com sessão já invalidada são recusadas (SC-003) e, dentro da janela,
  não geram novo registro de auditoria (apenas a contagem fora da auditoria); contam como tentativa auditada as ações explícitas de
  reverter e a entrada com credenciais corretas numa conta suspensa ou em exclusão administrativa.
- **Falha parcial** (a sessão foi encerrada, mas o registro de auditoria falhou): a ação inteira é desfeita, pois nenhuma ação
  administrativa pode ocorrer sem auditoria.

## Requirements *(mandatory)*

### Functional Requirements

**Acesso e perfil de administrador**

- **FR-001**: O sistema MUST ter um perfil **administrador**, distinto do usuário comum, e só quem o possui MUST ver ou usar o
  painel e suas funções. A verificação MUST ocorrer em cada função administrativa no servidor, e não apenas ocultando itens de menu.
- **FR-002**: Usuários comuns e visitantes que tentarem acessar o painel ou suas funções MUST receber negativa de acesso sem que
  nada administrativo seja revelado, e a tentativa MUST ser registrada na auditoria, uma vez por janela de deduplicação (FR-053),
  identificada pelo usuário ou, no caso de visitantes não autenticados, pelo IP (FR-054).
- **FR-003**: O primeiro administrador MUST ser criado pelo dono da implantação **diretamente no banco de dados**, marcando como
  administradora (raiz, FR-051) uma conta já cadastrada normalmente; essa marcação MUST NOT ser possível por nenhuma interface do
  sistema, por e-mail configurado no ambiente nem por cadastro. O produto MUST incluir um **roteiro documentado** (procedimento de
  operação, sem detalhar a instrução de banco aqui) para criar o primeiro administrador e para **recuperar o acesso
  administrativo** (por exemplo, quando todas as contas administradoras ficarem inacessíveis); a recuperação é sempre feita pelo
  dono da implantação, pelo banco, nunca pelo painel.
- **FR-004**: Administradores MUST poder conceder e retirar o perfil administrador de outros usuários ativos pelo painel, exceto do
  administrador raiz (FR-051); a mudança vale na requisição seguinte da pessoa afetada, mesmo com o painel aberto e a sessão ainda
  válida.
- **FR-005**: O sistema MUST impedir qualquer operação que deixe o sistema sem nenhum administrador ativo (retirar o perfil,
  suspender ou excluir o último administrador), inclusive sob concorrência: se dois administradores executarem ao mesmo tempo
  operações que, somadas, deixariam o sistema sem administrador ativo, no máximo uma MUST ter efeito e a outra MUST ser recusada com
  explicação. A existência do administrador raiz, intocável pelo painel (FR-051), reforça essa garantia.
- **FR-006**: O painel MUST ter menu próprio na barra lateral esquerda, com ícone e nome de cada área, visível só para administradores,
  e MUST seguir a identidade visual Aurora FinTech e os padrões de acessibilidade já existentes.

**Gestão de usuários**

- **FR-007**: O painel MUST listar usuários de forma paginada, com busca por e-mail e nome (sem diferenciar maiúsculas, minúsculas e
  acentos), filtro por situação (ativo, suspenso, aguardando exclusão, administrador) e ordenação por criação e último acesso.
- **FR-008**: O painel MUST exibir o detalhe do usuário com e-mail, nome de exibição, data de criação, situação, último acesso, número
  de sessões abertas, bloqueio por tentativas de login (e até quando), pendência de exclusão, troca de e-mail pendente e histórico de
  ações administrativas sobre a conta. A lista de sessões abertas MUST mostrar, para cada sessão, data de início, último uso, **IP** e
  **tipo de dispositivo/navegador**; IP e dispositivo são dados pessoais (FR-039, FR-061).
- **FR-009**: O administrador MUST poder **suspender** e **reativar** um usuário; a suspensão MUST exigir motivo, impedir novos
  logins e invalidar as sessões existentes na requisição seguinte; a reativação MUST restaurar o acesso sem alterar nenhum dado. A
  suspensão não gera aviso ao usuário (ele só vê a orientação de procurar o suporte ao tentar entrar).
- **FR-010**: O administrador MUST poder **retirar o bloqueio temporário por tentativas de login** de um e-mail, permitindo nova
  tentativa imediata.
- **FR-011**: O administrador MUST poder **encerrar uma ou todas as sessões** de um usuário, a partir da lista de sessões (FR-008),
  sem aviso ao usuário.
- **FR-012**: O administrador MUST poder **reenviar o e-mail de redefinição de senha** e **forçar a redefinição de senha** de um
  usuário; em ambos os casos, o administrador MUST NOT ver, definir ou receber a senha, o link ou o token.
- **FR-013**: O administrador MUST poder **convidar** um novo usuário por e-mail (link de validade limitada para definir a própria
  senha), listar, reenviar e cancelar convites pendentes; e-mails já cadastrados MUST ser recusados. Qualquer administrador MUST
  poder reenviar ou cancelar convites criados por outro, com auditoria. Se a pessoa convidada se cadastrar por conta própria antes de
  aceitar, o cadastro MUST consumir o convite (marcado "aceito"). O aceite de convite MUST ficar bloqueado em modo de manutenção
  (FR-058) e MUST continuar permitido com os cadastros fechados.
- **FR-014**: O administrador MUST poder alterar o nome de exibição de um usuário (efeito imediato, auditado) e **solicitar a troca
  do e-mail** dele. A troca de e-mail NÃO vale na hora: só se efetiva depois da confirmação por código enviado ao novo endereço
  (FR-052); até lá, o e-mail antigo continua válido. A unicidade do novo e-mail MUST ser verificada na solicitação e de novo na
  confirmação; ao confirmar, as sessões do usuário MUST ser encerradas e o e-mail anterior e o novo MUST ser notificados. O
  administrador MUST NOT poder alterar a senha diretamente. O e-mail do administrador raiz MUST NOT ser trocado pelo painel
  (FR-051).
- **FR-015**: O administrador MUST poder iniciar a **exclusão** de um usuário, e cancelá-la enquanto houver prazo em curso, com
  motivo obrigatório (FR-036), prazo escolhido por ele (FR-036), confirmação digitando o e-mail do usuário e reautenticação por senha
  (FR-035); a exclusão concluída MUST remover irreversivelmente os dados pessoais e financeiros do usuário. A solicitação de exclusão
  imediata, depois de executada, MUST NOT poder ser cancelada. O administrador MUST poder **antecipar** uma exclusão já agendada pelo
  próprio usuário, nunca adiá-la; a partir da antecipação, a exclusão passa a ser de origem administrativa (FR-049). O administrador
  raiz MUST NOT ser excluído (nem ter a exclusão antecipada) pelo painel (FR-051).
- **FR-016**: Toda ação destrutiva ou de efeito sobre o acesso de terceiros (suspender, encerrar sessões, forçar redefinição,
  solicitar a troca de e-mail, excluir, encerrar todas as sessões do sistema) MUST pedir confirmação explícita informando o efeito.
- **FR-017**: O administrador MUST NOT poder agir contra a própria conta em operações que a prejudiquem (suspender, retirar o próprio
  perfil, excluir pelo painel); essas operações MUST ser recusadas com explicação.

**Isolamento de dados**

- **FR-018**: O painel e todas as suas funções MUST NOT expor, em nenhuma tela, lista, resposta, registro de auditoria ou mensagem de
  erro, lançamentos, saldos, valores, contas, cartões, categorias, transferências ou qualquer dado financeiro de usuários; o
  administrador MUST NOT adquirir, por ser administrador, acesso a recursos financeiros de terceiros por qualquer outro caminho do
  sistema (Princípio III da constituição). Esta versão MUST NOT oferecer **nenhuma exportação de dados** pelo painel (listas de
  usuários, sessões, auditoria, histórico de envios ou qualquer outra); a ausência de exportação é decisão explícita desta versão.

**Auditoria**

- **FR-019**: Toda ação administrativa (inclusive tentativas recusadas e falhas, acessos negados ao painel e a abertura do detalhe de
  um usuário, FR-060) MUST gerar um registro de auditoria com administrador (ou autor da tentativa), tipo de ação, alvo, momento,
  resultado e motivo informado. Nenhuma ação administrativa MAY ser concluída sem o registro correspondente. Para acessos negados e
  tentativas de reverter decisões administrativas, o registro segue a regra de deduplicação do FR-053.
- **FR-020**: Os registros de auditoria MUST ser imutáveis para os administradores: nenhuma função do painel MAY editá-los ou
  excluí-los, e MUST NOT conter senhas, tokens, links, códigos de confirmação, conteúdo de e-mails ou valores financeiros. As únicas
  alterações admitidas são a anonimização automática prevista no FR-039 e a anonimização por prazo do IP de visitantes sem conta
  prevista no FR-062, ambas executadas pelo sistema, nunca por administrador.
- **FR-021**: O painel MUST permitir consultar a auditoria de forma paginada, da mais recente para a mais antiga, filtrando por
  período, administrador, tipo de ação e usuário-alvo, e exibir o resumo do que mudou em cada registro.
- **FR-022**: O registro de auditoria MUST ser mantido **indefinidamente**, sem descarte por idade (diferentemente do histórico de
  envios de e-mail, FR-059). Quando um usuário for excluído, os registros que o mencionam MUST ser anonimizados conforme o FR-039; o IP de visitantes sem conta
  MUST ser anonimizado após 90 dias conforme o FR-062 (a linha da tentativa nunca é descartada).

**Sistema, saúde e estatísticas**

- **FR-023**: O painel MUST exibir o estado de saúde da aplicação e do banco de dados, a versão em execução e o tempo no ar; falhas
  MUST ser indicadas por ícone e texto, sem expor endereços, credenciais ou detalhes técnicos internos.
- **FR-024**: O painel MUST exibir estatísticas agregadas de uso: totais de usuários por situação, usuários ativos em 7 e 30 dias,
  novos cadastros e quantidade de lançamentos criados por dia no período. Os indicadores MUST ser contagens do sistema inteiro,
  nunca valores monetários nem dados atribuíveis a um usuário individual.
- **FR-025**: O painel MUST exibir a hora da última leitura dos indicadores e permitir atualizá-los manualmente.

**E-mail**

- **FR-026**: O painel MUST exibir a configuração de envio de e-mail (servidor, porta, remetente e se está completa), sempre com
  credenciais ocultas, e permitir o envio de um e-mail de teste ao endereço do próprio administrador, mostrando o resultado.
- **FR-027**: O sistema MUST registrar cada envio de e-mail (tipo, destinatário, momento, situação e causa resumida da falha),
  incluindo os avisos de exclusão e de cancelamento (FR-037, FR-040) e os códigos de troca de e-mail (FR-052), sem o conteúdo da
  mensagem, links, tokens ou o código; o painel MUST permitir consultar e filtrar esse histórico por situação e tipo. O histórico
  tem retenção própria de 90 dias (FR-059).
- **FR-028**: A partir do histórico, o administrador MUST poder reenviar um e-mail de redefinição de senha que falhou; os reenvios
  MUST respeitar um limite por usuário para evitar excesso de mensagens.

**Parâmetros e manutenção**

- **FR-029**: O painel MUST permitir abrir e fechar novos cadastros e ativar e desativar o modo de manutenção com mensagem
  personalizada; em manutenção, usuários comuns MUST ver o aviso e ficar sem acesso, enquanto administradores seguem operando. O
  comportamento detalhado da manutenção está no FR-058.
- **FR-030**: O painel MUST permitir encerrar todas as sessões do sistema, exceto a do próprio administrador e as do(s)
  administrador(es) raiz (FR-051), exigindo confirmação reforçada.
- **FR-031**: O painel MUST exibir, somente para consulta, os demais parâmetros relevantes (validade das sessões, limites de
  tentativas de login, prazo de carência de exclusão), identificando-os como não editáveis.
- **FR-032**: Cada parâmetro editável MUST mostrar valor atual, quem o alterou por último e quando; toda alteração MUST constar na
  auditoria com valor anterior e novo.

**Qualidade da experiência**

- **FR-033**: Todas as telas do painel MUST estar em português (pt-BR) e MUST tratar estados de carregamento, vazio e erro; ações
  que alteram dados MUST informar sucesso ou falha de forma explícita e acessível (por teclado e leitor de tela, sem depender só de cor).
- **FR-034**: Listas longas (usuários, auditoria, envios de e-mail) MUST ser paginadas e permanecer utilizáveis com milhares de
  registros.
- **FR-035**: Acesso administrativo MUST ser exigido novamente por reautenticação (confirmação da senha do administrador) antes das
  ações de maior risco: excluir usuário (inclusive antecipar a exclusão), encerrar todas as sessões do sistema, conceder ou retirar o
  perfil de administrador. Senha incorreta MUST impedir a ação e a tentativa MUST constar na auditoria; as falhas contam no limite de
  tentativas de login (FR-055). Esta versão MUST NOT exigir segundo fator de autenticação (2FA); a reautenticação por senha é o único
  reforço (2FA fica como evolução futura, ver Premissas).

**Exclusão de usuário pelo administrador**

- **FR-036**: Ao solicitar a exclusão, o administrador MUST informar um **motivo** obrigatório, composto por um dos motivos **ativos**
  cadastrados (FR-043) e uma justificativa em texto livre, e MUST escolher o **prazo**: imediato ou em N dias, com N inteiro de 1 a
  30. Sem motivo, com motivo desativado, sem prazo ou com prazo fora desse intervalo, a solicitação MUST ser recusada. O prazo
  escolhido MUST ser igual ou mais curto que a carência do autoatendimento (30 dias); numa exclusão já agendada pelo usuário, só
  pode ser antecipada.
- **FR-037**: Assim que a exclusão for solicitada, o sistema MUST tentar avisar o usuário afetado por e-mail, informando o prazo (ou
  que a exclusão foi imediata) e a **mensagem genérica** do motivo escolhido. O texto livre da justificativa MUST NOT ser enviado ao
  usuário nem aparecer no aviso; ele MUST ficar apenas no registro de auditoria. Na exclusão imediata, a tentativa de envio MUST
  preceder a remoção dos dados, mas a remoção MUST ocorrer em qualquer caso (FR-038).
- **FR-038**: **A exclusão, com prazo ou imediata, MUST sempre prosseguir, com o e-mail de aviso enviado ou não.** A falha no envio
  do aviso MUST NOT passar em silêncio: MUST ser registrada no histórico de envios e na auditoria da exclusão, MUST virar uma
  **comunicação pendente** (FR-056) e o administrador MUST ser avisado na hora. A nova tentativa de envio fica a cargo do
  administrador, que MUST poder reenviar o aviso (mesmo depois de a conta ter sido removida) ou descartá-lo (FR-056). Não existe
  estado "aguardando aviso", nem decisão de "prosseguir sem aviso", nem confirmação reforçada associada.
- **FR-039**: O sistema MUST anonimizar dados pessoais nos registros de auditoria e de envio de e-mail, substituindo-os por um
  identificador anônimo, **estável e não reversível**, de modo que registros da mesma pessoa continuem relacionáveis entre si. A
  regra cobre **quatro fontes**: (1) **usuário excluído**: seu e-mail, nome, **IP e dispositivo** são anonimizados em todos os
  registros quando a exclusão é concluída; (2) **convidados sem conta**: o e-mail é gravado já anonimizado na auditoria; (3)
  **e-mails antigos** (troca de e-mail): gravados já anonimizados; (4) **nomes antigos** (alteração de nome): gravados já
  anonimizados. A **justificativa em texto livre do administrador MUST ser mantida** nos registros. O histórico da ação (tipo,
  momento, resultado, motivo) e a identificação do administrador autor MUST ser mantidos, exceto se o próprio administrador também
  tiver sido excluído, caso em que seu e-mail, nome, IP e dispositivo também são anonimizados. **Única exceção documentada**: o
  endereço retido, sem exibição, no registro de uma comunicação pendente (FR-057), por no máximo 30 dias. O **IP de visitantes não
  autenticados**, que não têm conta para disparar esta anonimização, segue a regra própria de prazo do FR-062.

**Cancelamento, aviso no aplicativo e motivos de exclusão**

- **FR-040**: Ao cancelar uma solicitação de exclusão, o sistema MUST notificar o usuário por e-mail com texto genérico (sem
  justificativa nem dados de outros usuários), registrando o envio como nos demais avisos (FR-027); se o envio falhar, vira
  comunicação pendente (FR-056). Se a exclusão cancelada era uma antecipação de exclusão agendada pelo usuário, o texto MUST dizer que
  a exclusão administrativa foi cancelada e que a solicitação do usuário continua para a data original. O cancelamento MUST ser
  aceito apenas enquanto houver prazo em curso e MUST ser recusado depois de executada a exclusão.
- **FR-041**: Durante o prazo de uma exclusão **com prazo** solicitada por administrador, o sistema MUST exibir ao usuário, na web e
  no aplicativo móvel, um aviso visível com o prazo (data final) e a mensagem genérica do motivo, em linguagem clara e acessível
  (texto e ícone, compatível com leitores de tela). O aviso MUST NOT conter a justificativa livre. Em exclusão imediata, não há
  aviso no aplicativo (apenas a tentativa de e-mail). O aviso MUST refletir o prazo mais recente em caso de antecipação. O aviso MUST
  orientar a procurar o suporte em caso de dúvida e MUST NOT oferecer ao usuário a opção de cancelar a exclusão (FR-047).
- **FR-042**: Quando o administrador cancelar uma exclusão com prazo, o sistema MUST exibir ao usuário, na web e no aplicativo
  móvel, um aviso de que a exclusão administrativa foi cancelada, exibido uma única vez e dispensável. Se a conta voltou a uma
  exclusão agendada pelo próprio usuário (cancelamento de uma antecipação), o aviso MUST dizer que a solicitação dele continua para a
  data original (dd/mm); caso contrário, MUST dizer que a conta segue ativa (ou, se estava suspensa, que continua sem acesso, com a
  orientação de procurar o suporte).
- **FR-043**: O administrador MUST poder gerenciar os **motivos de exclusão**: criar, editar (nome e mensagem genérica), desativar e
  reativar. Os quatro motivos iniciais (solicitação do titular dos dados; violação dos termos de uso; determinação legal ou de
  autoridade; outros motivos administrativos) MUST existir desde a implantação e MUST NOT poder ser apagados, apenas desativados.
  Nenhum motivo MUST ser apagado pela interface, para preservar o histórico, e o sistema MUST manter ao menos um motivo ativo.
- **FR-044**: Cada motivo MUST ter uma mensagem genérica, que é o único texto de motivo mostrado ao usuário (e-mail e aplicativo). A
  mensagem MUST NOT conter dados de um usuário específico nem campos preenchidos com dados do usuário ou com a justificativa livre;
  nome e mensagem MUST ser obrigatórios, o nome MUST ser único e a mensagem MUST ter tamanho máximo definido.
- **FR-045**: Toda criação, edição, desativação e reativação de motivo (inclusive tentativas recusadas) MUST constar na auditoria,
  com o valor anterior e o novo nas edições.
- **FR-046**: A mensagem genérica de uma exclusão MUST ser fixada no momento da solicitação: editar ou desativar o motivo depois MUST
  NOT alterar a mensagem já enviada, a exibida no aplicativo nem a de reenvios daquela exclusão.
- **FR-047**: **Nenhuma decisão administrativa MUST poder ser revertida, cancelada ou contornada pelo próprio usuário afetado.**
  São decisões administrativas: a exclusão (com prazo ou imediata, inclusive a antecipação de uma exclusão agendada pelo usuário),
  a suspensão, o encerramento de sessões, a redefinição forçada de senha e a troca de e-mail feita pelo administrador (depois de
  confirmada, FR-052). Uma decisão administrativa MUST ser revertida somente por um administrador, pela interface do painel e com
  registro na auditoria (FR-019). A regra vale para todos os canais (tela de entrada, tela Minha conta, aplicativo móvel e chamada
  direta ao servidor) e as credenciais corretas do usuário MUST NOT bastar para desfazer a decisão. O usuário MUST NOT poder
  reverter uma troca de e-mail já confirmada, nem cancelar uma troca pendente. Não são reversão nem contorno: (a) entrar de novo
  com credenciais válidas depois de um encerramento de sessões, desde que não haja outra decisão em vigor; (b) criar a nova senha
  pelo link recebido depois de uma redefinição forçada, que é o caminho previsto; (c) o bloqueio temporário por tentativas de login,
  que é automático e não uma decisão administrativa. **Exemplo (exclusão pedida por administrador):** o fluxo de entrada que hoje
  permite a um usuário com exclusão agendada cancelá-la informando as credenciais MUST NOT oferecer essa opção quando a exclusão
  foi pedida por administrador, e o equivalente por chamada direta ao servidor MUST ser recusado; o usuário vê o prazo, a mensagem
  genérica do motivo (FR-044) e a orientação de procurar o suporte. A exclusão pedida pelo próprio usuário (autoatendimento)
  continua cancelável por ele, como hoje, salvo se um administrador a tiver antecipado (FR-049). Exemplo (suspensão): o usuário
  suspenso recebe apenas a orientação de procurar o suporte, sem opção de reativar a conta, desbloquear ou reabrir sessões.
- **FR-048**: O formulário de exclusão MUST exibir, junto ao campo da justificativa, um aviso orientando o administrador a NÃO
  escrever dados pessoais do usuário, informando que o texto é mantido na auditoria e não é enviado ao usuário.
- **FR-049**: Toda solicitação de exclusão MUST registrar sua **origem** (pedida pelo próprio usuário ou pedida por administrador), de
  forma que o sistema distinga as duas em todo fluxo que depende disso (entrada, aviso no aplicativo, cancelamento). A origem MUST
  ser definida na solicitação e MUST passar a ser administrativa quando um administrador antecipa uma exclusão agendada pelo
  usuário; a origem MUST NOT ser alterável pelo usuário. Quando a solicitação antecipa uma exclusão agendada pelo usuário, ela MUST
  **guardar a exclusão anterior** (data original e origem "usuário"). O **cancelamento pelo administrador MUST restaurar exatamente
  o estado anterior à solicitação**: se a solicitação era uma antecipação, a conta **volta ao agendamento original do usuário**
  (data original, origem "usuário"), que ele volta a poder cancelar, e o aviso diz que a exclusão administrativa foi cancelada e que
  a solicitação dele continua para dd/mm; se a conta estava suspensa antes da solicitação, continua suspensa; se estava ativa e sem
  exclusão, volta ativa e sem pendência. Como a antecipação só encurta o prazo, a data original está sempre no futuro quando o
  cancelamento ocorre.
- **FR-050**: Toda tentativa do usuário afetado de reverter ou contornar uma decisão administrativa, por qualquer canal (FR-047),
  MUST ser recusada sem alterar nenhum estado da conta e MUST gerar registro de auditoria (autor: o usuário que tentou; tipo:
  tentativa de reverter decisão administrativa; resultado: recusada; decisão alvo; IP), sem senhas, tokens ou dados financeiros, uma
  vez por janela de deduplicação (FR-053). A recusa MUST usar mensagem clara e orientar a procurar o suporte, sem revelar a
  justificativa livre do administrador nem dados de outros usuários. As tentativas MUST seguir sujeitas ao limite de tentativas já
  existente no sistema (FR-055).

**Administrador raiz, troca de e-mail, volume da auditoria, privacidade e manutenção (rodada 4)**

- **FR-051**: O **administrador raiz** (FR-003) MUST ser constante: nenhum outro administrador MUST poder, pelo painel, **rebaixá-lo,
  suspendê-lo, excluí-lo (nem antecipar a exclusão), trocar o e-mail dele ou encerrar as sessões dele** (individualmente, em
  conjunto ou pelo encerramento global do FR-030); forçar a redefinição de senha do raiz, que derrubaria as sessões, também MUST ser
  recusado. Essas tentativas MUST ser recusadas com explicação e constar na auditoria como recusadas. O raiz também MUST NOT poder ser
  excluído pelo autoatendimento do próprio usuário. Só o dono da implantação, pelo banco, altera ou recupera o raiz. Os demais
  administradores MUST poder ser promovidos e rebaixados por qualquer administrador, pelo painel. Reenviar o e-mail de redefinição
  de senha ao raiz continua permitido.
- **FR-052**: A **troca de e-mail pedida pelo administrador** MUST seguir este comportamento: (a) o administrador informa o novo
  e-mail; (b) o sistema envia um **código de 6 dígitos para o NOVO endereço**; (c) quem controla esse endereço repassa o código ao
  administrador, que o digita **na própria tela** do painel, na mesma sessão; (d) só após a confirmação a troca vale, e até lá o
  e-mail antigo continua válido para entrar e para receber mensagens. O código MUST ter validade de 15 minutos e ser de uso único;
  um novo pedido MUST invalidar o anterior; um limite de tentativas erradas (5 como valor de referência) MUST invalidar o código; o
  código MUST NOT ser exibido ao administrador pelo sistema e MUST NOT ser gravado em auditoria, histórico de envios ou log; o
  administrador MUST poder **cancelar** a troca pendente; na confirmação, as sessões do usuário MUST ser encerradas. A solicitação,
  a confirmação, a falha (código errado, expirado ou invalidado) e o cancelamento MUST ser auditados, sem o código. A troca MUST
  respeitar o limite de pedidos de envio por usuário (FR-055). **Racional**: provar a posse do novo endereço por quem está em contato
  com o administrador, de modo que um e-mail digitado errado não vire posse por terceiro que apenas clique num link recebido.
- **FR-053**: A auditoria de **acessos negados ao painel** e de **tentativas de reverter decisão administrativa** MUST registrar a
  tentativa **uma única vez por janela de 15 minutos** para o mesmo autor (usuário autenticado ou, na falta, o IP do visitante), o
  mesmo IP, a mesma decisão ou função alvo e o mesmo tipo de tentativa. As repetições dentro da janela MUST aparecer apenas como
  **contador/métrica operacional fora da auditoria**. A regra vale também para acessos negados de visitantes não autenticados,
  identificados por IP. Ações administrativas efetivas e recusas por regra de negócio de um administrador (por exemplo, tentar
  suspender o raiz) MUST continuar sendo registradas individualmente.
- **FR-054**: O sistema MUST gravar o **IP real** do cliente nas tentativas auditadas (FR-053) e nas sessões (FR-008), tratando-o
  como dado pessoal (FR-039, FR-061). O IP real MUST ser obtido do cabeçalho informado pelo Cloudflare (CF-Connecting-IP), e esse
  cabeçalho MUST ser considerado confiável somente quando a requisição vem do túnel do Cloudflare; em outras origens, ele MUST NOT
  ser aceito (impede a falsificação do IP). O detalhe técnico fica para o plano.
- **FR-055**: O limite de tentativas de login existente MUST continuar valendo. As **ações do painel MUST ter limite de taxa**
  (excedido o limite, a ação é recusada com orientação de aguardar). Falhas de reautenticação do administrador (FR-035) MUST contar
  no mesmo limite de tentativas de login e, após N falhas, a sessão do administrador MUST ser revogada; as ações destrutivas MUST ter
  limite por administrador. Os valores ficam para o plano.
- **FR-056**: Quando o envio de um aviso de exclusão ou de cancelamento da exclusão falhar, o sistema MUST criar uma **comunicação
  pendente**. O painel MUST exibir um **alerta permanente**, visível em todas as telas do painel (ícone e texto, acessível), de que
  existem comunicações com envio pendente, até que cada uma seja **entregue** (nova tentativa bem-sucedida) ou **descartada pelo
  administrador**; o descarte MUST ser auditado. O administrador MUST poder ver a lista das pendentes e reenviar cada uma. Uma
  comunicação pendente cujo prazo de retenção do endereço se esgotar (FR-057) passa a "expirada" e deixa de contar no alerta.
- **FR-057**: Para o aviso pendente de uma exclusão **já executada**, o endereço de e-mail MUST ficar retido **somente no registro
  da comunicação pendente** (não exibido no painel) e MUST ser apagado ao ser entregue, ao ser descartado pelo administrador ou 30
  dias após a remoção da conta, o que ocorrer primeiro. O restante dos dados do usuário MUST ser removido normalmente e a auditoria
  MUST mostrar o e-mail anonimizado (FR-039).
- **FR-058**: Em **modo de manutenção**: (a) usuários comuns ficam sem acesso: login, API e sincronização recebem resposta de
  manutenção, e quem já estava logado é barrado na próxima requisição; (b) o aplicativo móvel MUST reconhecer a resposta de
  manutenção, mostrar o aviso e manter as **alterações offline guardadas no aparelho**, sincronizando depois, sem perda e sem tratá-las
  como erro; (c) as **tarefas automáticas continuam** (execução de exclusões com prazo vencido e envio de e-mails de aviso); (d) o
  **aceite de convite fica bloqueado** e novos cadastros por conta própria são recusados; (e) a **redefinição de senha continua
  funcionando**; (f) administradores operam normalmente. Fora da manutenção, com os cadastros fechados, o aceite de convite é
  permitido.
- **FR-059**: O **histórico de envios de e-mail** MUST ter retenção própria de **90 dias**, e depois MUST ser apagado
  automaticamente pelo sistema; a **auditoria** é indefinida e imutável (FR-022). A retenção de 90 dias não apaga comunicações ainda
  pendentes (FR-056). O destinatário aparece em claro no histórico durante a retenção; o e-mail de um usuário excluído é anonimizado
  (FR-039).
- **FR-060**: A **abertura do detalhe de um usuário** MUST ser registrada na auditoria (autor, alvo, momento). Buscas e listas
  MUST NOT ser auditadas.
- **FR-061**: A política de privacidade ou o aviso ao usuário MUST informar a coleta de **IP** e **tipo de dispositivo/navegador**
  (sessões e tentativas auditadas), sua finalidade (segurança e suporte), sua visibilidade para administradores e os **prazos de
  anonimização**: o IP de **usuários** é anonimizado na exclusão da conta (FR-039) e o IP de **visitantes não autenticados**
  (acessos negados ao painel) é anonimizado em **90 dias** (FR-062).
- **FR-062**: O **IP de visitantes não autenticados** registrado na auditoria (acessos negados ao painel, FR-002, FR-053 e FR-054)
  MUST ser **anonimizado automaticamente após 90 dias** do registro da tentativa, pelo sistema. A anonimização MUST: (a) **manter a
  linha da tentativa** (tipo, momento, resultado e alvo), apagando apenas o IP em claro; (b) substituir o IP por um identificador
  anônimo, **estável e não reversível** (inclusive por força bruta sobre o espaço de endereços, o que exige derivação com segredo
  mantido fora do banco; detalhe para o plano), de modo que tentativas do mesmo IP continuem correlacionáveis ao longo do tempo sem
  expor o endereço; (c) valer para o registro cujo autor, no momento da tentativa, **não era um usuário autenticado**: o IP de
  usuários autenticados segue a regra do FR-039 (anonimizado na exclusão da conta); (d) ser executada pelo sistema, de forma
  idempotente e recuperável após indisponibilidade, e **nunca disparada, adiada, desfeita ou contornada por administrador**; (e)
  não gerar um registro de auditoria por linha, apenas contagem operacional sem IP. Esta anonimização por prazo é, junto com a do
  FR-039, a **única alteração admitida** em registros de auditoria (FR-020).

### Key Entities

- **Perfil administrador**: indicação de que um usuário pode usar o painel. Pertence a um usuário; pode ser concedido e retirado por
  outro administrador, exceto no caso do administrador raiz.
- **Administrador raiz**: o primeiro administrador, criado pelo dono da implantação diretamente no banco, marcando uma conta já
  cadastrada normalmente. É constante: nenhum outro administrador pode, pelo painel, rebaixá-lo, suspendê-lo, excluí-lo (nem
  antecipar), trocar o e-mail, forçar a redefinição de senha ou encerrar as sessões dele. Só o dono da implantação, pelo banco,
  altera ou recupera essa conta (FR-003, FR-051).
- **Situação administrativa do usuário**: estado da conta do ponto de vista de acesso (ativa, suspensa, aguardando exclusão), com
  motivo, quem alterou e quando; independente dos dados financeiros do usuário. Só um administrador a reverte (FR-047).
- **Registro de auditoria**: fato imutável de uma ação administrativa (autor, tipo, alvo, momento, resultado, motivo, resumo do
  que mudou), inclusive tentativas do usuário afetado de reverter uma decisão administrativa (FR-050), acessos negados ao painel
  (de usuários ou de visitantes, estes identificados por IP), aberturas do detalhe de um usuário (FR-060) e o **IP** das tentativas
  (FR-054). Tentativas repetidas são registradas uma vez por janela de 15 minutos (FR-053). Guardado indefinidamente; sobrevive à
  exclusão do alvo, mas com e-mail, nome, IP e dispositivo do excluído substituídos por um identificador anônimo e estável (a
  justificativa do administrador é mantida); e-mails de convidados sem conta, e-mails antigos e nomes antigos já são gravados
  anonimizados (FR-039). O **IP de visitantes sem conta** é substituído por identificador anônimo e estável **após 90 dias**, sem
  apagar a linha da tentativa (tipo, momento, resultado, alvo); essa anonimização por prazo, feita pelo sistema e nunca por
  administrador, é a única exceção adicional à imutabilidade, junto com a do FR-039 (FR-062). Nunca contém o código de confirmação de troca de e-mail.
- **Solicitação de exclusão**: pedido de exclusão de uma conta, feito pelo próprio usuário ou por um administrador. Tem **origem**
  (usuário ou administrador, que determina se o usuário pode cancelá-la, FR-047 e FR-049; passa a administrativa quando o
  administrador a antecipa), prazo (imediato ou data final), motivo escolhido, **mensagem genérica fixada no momento da
  solicitação**, justificativa (mantida na auditoria, nunca enviada nem mostrada ao usuário), situação (agendada; cancelada;
  executada), o resultado do aviso por e-mail ao usuário (enviado, pendente, descartado ou expirado), a **exclusão anterior** que
  foi antecipada (data original e origem "usuário", quando houver) e a **situação da conta antes da solicitação** (por exemplo,
  suspensa), de modo que o cancelamento restaure exatamente o estado anterior (FR-049). A exclusão sempre prossegue,
  independentemente do aviso (FR-038).
- **Comunicação pendente**: aviso de exclusão ou de cancelamento da exclusão cujo envio por e-mail falhou. Tem tipo, momento, causa
  resumida, situação (pendente, entregue, descartada pelo administrador, expirada) e, quando a conta já foi removida, o endereço de
  e-mail retido **somente nesse registro**, apagado ao ser entregue, descartada, ou 30 dias após a remoção da conta. Enquanto houver
  comunicações pendentes, o painel exibe um alerta permanente em todas as telas (FR-056, FR-057).
- **Troca de e-mail pendente**: pedido do administrador para mudar o e-mail de um usuário, ainda não confirmado. Guarda o novo
  endereço informado, o momento do pedido, a validade (15 minutos), o número de tentativas erradas e a situação (pendente,
  confirmada, cancelada, expirada, invalidada). Há no máximo uma por usuário (novo pedido invalida o anterior). O código de 6
  dígitos nunca é exibido ao administrador nem gravado em auditoria, histórico ou log (FR-052).
- **Motivo de exclusão** (categoria de motivo): item de uma lista cadastrável pelo administrador, com nome, **mensagem genérica**
  (único motivo comunicado ao usuário), situação (ativo ou inativo) e indicação de ser um dos quatro iniciais. Nunca é apagado, só
  desativado; edições e mudanças de situação constam na auditoria.
- **Aviso de exclusão no aplicativo**: aviso mostrado ao usuário afetado, na web e no aplicativo móvel, com prazo e mensagem
  genérica durante uma exclusão com prazo solicitada por administrador, e o aviso de cancelamento (exibido uma única vez e
  dispensável; quando a exclusão cancelada era uma antecipação, informa que a solicitação do usuário continua para a data
  original). Nunca contém a justificativa livre.
- **Sessão**: acesso aberto de um usuário em um dispositivo; pode ser listada (data de início, último uso, **IP** e **tipo de
  dispositivo/navegador**, que são dados pessoais, FR-039 e FR-061) e encerrada, exceto, por outro administrador, as do
  administrador raiz.
- **Convite**: pedido pendente para uma pessoa criar a própria conta; tem e-mail, validade, situação (pendente, aceito, cancelado,
  expirado) e quem convidou. É consumido (aceito) se a pessoa se cadastrar sozinha; qualquer administrador pode reenviá-lo ou
  cancelá-lo, com auditoria; cancelado ou expirado, guarda apenas o identificador anônimo do e-mail; o aceite fica bloqueado em
  modo de manutenção.
- **Parâmetro global**: configuração do sistema (cadastros abertos, modo de manutenção e mensagem) com valor atual, autor e data da
  última alteração; parâmetros somente leitura são exibidos, mas não alterados.
- **Registro de envio de e-mail**: tentativa de envio (tipo, destinatário, momento, situação, causa resumida da falha), sem conteúdo
  e sem o código de confirmação; inclui os avisos de exclusão e de cancelamento ao usuário e os códigos de troca de e-mail.
  Retido por 90 dias e depois apagado (FR-059); o e-mail do usuário excluído é anonimizado (FR-039).
- **Indicador de uso**: contagem agregada do sistema (usuários, cadastros, lançamentos por dia), sem relação com um usuário individual.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das tentativas de usuários comuns e visitantes de usar qualquer função administrativa são negadas, e em 100%
  das janelas de deduplicação (15 minutos por autor/IP, função alvo e tipo de tentativa, FR-053) há ao menos um registro na
  auditoria, com o IP (FR-054); as repetições dentro da janela são contadas em métrica fora da auditoria, sem perda de contagem.
- **SC-002**: O administrador localiza um usuário específico (busca por parte do e-mail) e abre seu detalhe em menos de 30 segundos,
  mesmo com 10.000 usuários cadastrados.
- **SC-003**: Um administrador sem treinamento prévio consegue suspender um usuário e confirmar que o acesso foi cortado em menos
  de 2 minutos, e, na tentativa seguinte do usuário, 100% das requisições com sessão antiga são recusadas.
- **SC-004**: Zero dados financeiros (valores, saldos, lançamentos, contas, cartões, categorias, transferências) de qualquer
  usuário são expostos por qualquer tela ou resposta administrativa, verificado por testes automatizados de isolamento.
- **SC-005**: 100% das ações administrativas concluídas têm o registro de auditoria correspondente com autor, alvo, momento e
  resultado; nenhuma pode ser alterada ou apagada pela interface.
- **SC-006**: Em um incidente de "o e-mail de redefinição não chegou", o administrador identifica a causa no histórico de envios e
  reenvia o e-mail em menos de 3 minutos.
- **SC-007**: A visão geral do sistema abre em menos de 3 segundos e indica corretamente, em 100% dos testes de indisponibilidade
  simulada, qual componente (aplicação ou banco) está com falha.
- **SC-008**: Em 100% das tentativas, inclusive concorrentes (por exemplo, dois administradores removendo-se ao mesmo tempo), o
  sistema nunca fica sem administrador ativo: operações que causariam isso são recusadas. Em 100% das tentativas de outro
  administrador de rebaixar, suspender, excluir (inclusive antecipar), trocar o e-mail, forçar a redefinição de senha ou encerrar as
  sessões do administrador raiz pelo painel, a operação é recusada, nada é alterado e a recusa consta na auditoria (FR-051).
- **SC-009**: Todas as funções do painel são utilizáveis apenas pelo teclado e anunciadas corretamente por leitores de tela, sem que
  a informação dependa apenas de cor.
- **SC-010**: Ao concluir a exclusão de um usuário, 100% dos seus dados pessoais e financeiros são removidos e nenhum e-mail ou nome
  dele permanece visível no painel ou na auditoria; a única exceção é o endereço retido, sem exibição, no registro de um aviso
  pendente (FR-057), por no máximo 30 dias.
- **SC-011**: Em 100% das exclusões de usuário concluídas, verificado por teste automatizado, nenhum registro de auditoria ou de
  envio de e-mail contém o e-mail, o nome, o IP nem o dispositivo da pessoa excluída (apenas o identificador anônimo, igual em todos
  os registros dela), enquanto o tipo da ação, o momento, o resultado, o administrador autor e a justificativa em texto livre
  continuam consultáveis. Em 100% das gravações na auditoria, e-mails de convidados sem conta, e-mails antigos e nomes antigos já
  são gravados anonimizados (FR-039). Os dois prazos de retenção são distintos e verificáveis: a **auditoria** não descarta nenhum
  registro por idade (indefinida e imutável) e o **histórico de envios** é apagado após 90 dias, sem apagar comunicações ainda
  pendentes (FR-059).
- **SC-012**: Em 100% das exclusões solicitadas por administrador (com prazo ou imediatas), a exclusão prossegue independentemente
  do resultado do aviso por e-mail, e há uma tentativa de aviso ao usuário contendo o prazo e a mensagem genérica. Em 0% dos casos o
  aviso contém o texto livre da justificativa, e toda falha de envio vira comunicação pendente visível no histórico, na auditoria e
  no alerta permanente do painel (FR-056).
- **SC-013**: 100% das ações de maior risco (FR-035) são recusadas sem reautenticação por senha válida do administrador.
- **SC-014**: Em 100% das exclusões com prazo solicitadas por administrador, o usuário vê, na primeira abertura ou tentativa de
  entrada na web e no aplicativo móvel, um aviso com o prazo vigente e a mensagem genérica do motivo, em 0% dos casos com a
  justificativa livre. Após o cancelamento, o aviso de cancelamento aparece uma única vez em 100% dos casos e, quando a exclusão era
  uma antecipação, informa que a solicitação original do usuário continua para a data original; em 100% dos cancelamentos a conta
  volta exatamente ao estado anterior à solicitação (inclusive suspensa, se estava) (FR-049).
- **SC-015**: O administrador cadastra um novo motivo e o usa numa exclusão em menos de 3 minutos; em 100% das criações, edições,
  desativações e reativações de motivo (inclusive recusadas) há registro na auditoria; em 100% das exclusões em andamento, editar ou
  desativar o motivo depois não altera a mensagem já comunicada ao usuário; 0 mensagens genéricas aceitas com dados de usuário ou
  com a justificativa livre; os quatro motivos iniciais nunca podem ser apagados.
- **SC-016**: Em 100% das exclusões executadas, o registro mostra o resultado do aviso (enviado, pendente, descartado ou expirado);
  em 0% dos casos uma exclusão é cancelada depois de executada. Em 100% das comunicações pendentes, o painel exibe o alerta
  permanente em todas as telas até que sejam entregues, descartadas (com auditoria) ou expiradas; em 100% delas o endereço retido é
  apagado ao ser entregue, descartado ou 30 dias após a remoção da conta, o que ocorrer primeiro (FR-057).
- **SC-017**: Em 100% das tentativas do usuário afetado de reverter ou contornar uma decisão administrativa (cancelar exclusão
  pedida por administrador, reativar-se, desbloquear-se, reabrir sessão encerrada ou usar sessão invalidada, por tela de entrada,
  Minha conta, aplicativo móvel ou chamada direta), a tentativa é recusada e o estado da conta permanece inalterado; em 100% das
  janelas de deduplicação (FR-053) há registro de auditoria da tentativa, com o IP, e as repetições na janela são contadas em
  métrica fora da auditoria. Em 0% das exclusões pedidas por administrador a tela de entrada oferece ao usuário a opção de
  cancelá-las, e em 100% delas ele vê o prazo, a mensagem genérica e a orientação de procurar o suporte.
- **SC-018**: Em 100% das trocas de e-mail pedidas por administrador, o e-mail antigo continua válido até a confirmação do código; em
  0% dos casos o código aparece para o administrador (tela, resposta), na auditoria, no histórico de envios ou em log; em 100% das
  tentativas com código expirado, já usado, invalidado por novo pedido ou após o limite de erros, a troca é recusada; solicitação,
  confirmação, falha e cancelamento constam na auditoria (FR-052).
- **SC-019**: Em modo de manutenção, em 100% das requisições de usuários comuns (login, API e sincronização, inclusive de quem já
  estava logado) a resposta é de manutenção; 0 alterações offline do aplicativo móvel são perdidas, e todas sincronizam depois que a
  manutenção termina; as exclusões com prazo vencido e os e-mails de aviso continuam sendo processados; a redefinição de senha segue
  funcionando; o aceite de convite é recusado; administradores operam normalmente (FR-058).
- **SC-020**: 100% das aberturas do detalhe de um usuário constam na auditoria; 0 funções de exportação de dados existem no painel; em
  100% das ações do painel que excedem o limite de taxa (FR-055), a ação é recusada com orientação de aguardar; existe roteiro
  documentado para criar o primeiro administrador e recuperar o acesso, e seguir o roteiro numa implantação limpa resulta em uma
  conta raiz funcional sem uso de nenhuma interface do sistema (FR-003).
- **SC-021**: Em 100% dos registros de auditoria de visitantes sem conta com mais de 90 dias (com tolerância de até 1 dia para o
  processamento automático; valor final no plano), o IP não consta em claro (0 IPs em claro de visitantes sem conta após esse
  prazo); o registro da tentativa (tipo, momento, resultado, alvo) continua consultável, nenhuma linha é apagada pela
  anonimização, tentativas do mesmo IP seguem correlacionáveis pelo mesmo identificador anônimo, e 0 funções do painel permitem a
  um administrador disparar, adiar, desfazer ou contornar essa anonimização (FR-062). O aviso de privacidade informa os dois prazos
  (visitantes: 90 dias; usuários: na exclusão da conta, FR-061).

## Assumptions

- **Perfil único**: existe apenas o perfil "administrador" (acesso total ao painel). Papéis administrativos mais finos (somente
  leitura, suporte, financeiro) ficam fora desta versão, por simplicidade (Princípio VII).
- **Administrador também é usuário comum**: o administrador continua com suas próprias contas e lançamentos na área comum do
  sistema; o painel não lhe dá acesso a dados de outros usuários.
- **Primeiro administrador (raiz) criado no banco (confirmado)**: o primeiro administrador é criado pelo dono da implantação
  **diretamente no banco de dados**, marcando como administradora uma conta que já foi cadastrada normalmente. Não existe e-mail de
  administrador configurado no ambiente nem interface para isso. Essa conta é o administrador **raiz**: constante, intocável pelo
  painel (FR-051); só o dono da implantação, pelo banco, a altera. A recuperação de acesso administrativo é sempre feita pelo dono da
  implantação pelo banco, seguindo o roteiro documentado (FR-003). Isso elimina a disputa de cadastro por e-mail (quem se
  cadastrasse primeiro com o e-mail configurado), que existia no desenho anterior. Os demais administradores são promovidos e
  rebaixados por qualquer administrador, pelo painel.
- **Superfície**: o painel administrativo é entregue apenas na web (desktop), sem versão no aplicativo móvel; a tela é utilizável em
  tablets, mas não é otimizada para celulares. O **aviso de exclusão** ao usuário comum (história 12) é a exceção: aparece na web e
  no aplicativo móvel.
- **Sessões e suspensão**: o mecanismo atual de sessões (token de acesso de curta duração com renovação) permite invalidar sessões
  existentes; suspender ou encerrar sessões reutiliza essa capacidade e vale na requisição seguinte.
- **Exclusão reaproveita o mecanismo atual**: a exclusão de usuário pelo administrador usa o mesmo mecanismo de remoção definitiva
  do autoatendimento (carência atual de 30 dias), apagando dados pessoais e financeiros ao final, o que atende ao direito de
  exclusão (LGPD). Diferentemente do autoatendimento, o administrador escolhe o prazo.
- **Prazo da exclusão pelo administrador (confirmado)**: imediato ou N dias, com N de 1 a 30 (o teto coincide com a carência do
  autoatendimento, portanto o administrador só pode igualar ou encurtar esse prazo). Uma exclusão já agendada só pode ser
  antecipada. O cancelamento é possível enquanto houver prazo em curso e restaura exatamente o estado anterior à solicitação,
  inclusive o agendamento original do usuário quando a exclusão foi uma antecipação (FR-049); a exclusão imediata, depois de
  executada, não pode ser cancelada.
- **Motivos da exclusão (confirmado)**: o administrador escolhe um motivo ativo e escreve uma justificativa. Há quatro motivos
  iniciais (solicitação do titular dos dados, violação dos termos de uso, determinação legal ou de autoridade, outros motivos
  administrativos), e o administrador pode cadastrar outros, cada um com mensagem genérica (história 11). Assume-se que motivos
  nunca são apagados (só desativados e reativados), que sempre resta ao menos um ativo e que a mensagem é fixada na solicitação.
  O texto livre da justificativa vai apenas para a auditoria.
- **Aviso por e-mail e dentro do aplicativo (revisto na rodada 4)**: o usuário é avisado por e-mail (inclusive no cancelamento, com
  texto genérico) mesmo estando sem acesso à conta; o texto orienta a procurar o suporte em caso de dúvida. **A exclusão, com
  prazo ou imediata, sempre prossegue, com o aviso enviado ou não**: não existe mais o estado "aguardando aviso" nem a decisão de
  "prosseguir sem aviso". A falha de envio vira uma **comunicação pendente**, a nova tentativa fica a cargo do administrador e o
  painel mantém um alerta permanente até que seja entregue ou descartada (FR-056). O motivo da mudança: não bloquear, por exemplo,
  uma ordem legal por causa de um servidor de e-mail indisponível. Além do e-mail, as exclusões com prazo têm aviso dentro do
  aplicativo (web e móvel), sem janela para exclusões imediatas.
- **Endereço retido só no envio pendente (confirmado)**: se a conta já foi removida e o aviso ainda está pendente, o endereço de
  e-mail é a única exceção à anonimização: fica retido somente no registro da comunicação pendente e é apagado ao ser entregue, ao
  ser descartado pelo administrador ou 30 dias depois da remoção da conta, o que ocorrer primeiro (FR-057). O painel não exibe esse
  endereço; mostra apenas o identificador anônimo.
- **Reaproveitamento do que já existe no aplicativo**: hoje, quem agenda a exclusão da própria conta tem as sessões encerradas na
  hora; ao tentar entrar, a tela de entrada (compartilhada por web e móvel) informa a data da exclusão e oferece cancelá-la
  informando as credenciais, e a tela Minha conta oferece a solicitação de exclusão. Assume-se reaproveitar essa tela de entrada
  e a data de exclusão já registrada na conta para exibir o aviso, acrescentando a mensagem genérica do motivo e o aviso de
  cancelamento, e **sem** permitir que o usuário cancele por conta própria uma exclusão solicitada por administrador (FR-047);
  a exclusão agendada pelo próprio usuário não muda. Para isso, a conta precisará registrar a origem da exclusão e a exclusão
  anterior que foi antecipada (FR-049), hoje inexistentes: o sistema só guarda a data do pedido, e a tela de entrada e a chamada de
  cancelamento por credenciais tratam toda exclusão pendente como cancelável pelo usuário.
- **Decisões administrativas são do administrador (confirmado)**: por decisão do usuário do produto, nenhuma decisão administrativa
  (exclusão, suspensão, encerramento de sessões, redefinição forçada de senha, troca de e-mail confirmada) pode ser revertida,
  cancelada ou contornada pelo próprio usuário afetado; só um administrador a reverte, pelo painel e com auditoria (FR-047). Hoje o
  sistema não tem suspensão nem perfil administrativo, então o login atual só recusa contas com exclusão pendente; a suspensão e a
  origem da exclusão são acréscimos desta feature. Antecipar uma exclusão agendada pelo usuário a torna administrativa e retira dele
  a opção de cancelá-la (consequência direta da regra geral); se o administrador cancelar a antecipação, a exclusão volta a ser do
  usuário, com a data original, e ele volta a poder cancelá-la.
- **Troca de e-mail por código (confirmado)**: a posse do novo endereço é provada por quem está em contato com o administrador, que
  repassa o código recebido naquele endereço. Um e-mail digitado errado não vira posse por terceiro, o que ocorreria se bastasse
  clicar num link enviado ao endereço novo (FR-052). O código tem 15 minutos de validade, uso único e limite de tentativas erradas
  (5 como valor de referência; valor final no plano).
- **Retenção e anonimização (confirmado, revisto na rodada 4)**: a auditoria é guardada **indefinidamente** e é imutável; só muda
  por anonimização automática (FR-039 e, para o IP de visitantes sem conta, o prazo de 90 dias do FR-062). O **histórico de envios de e-mail** tem retenção própria de **90 dias**, e depois é apagado
  (FR-059). Dados pessoais de **convidados sem conta, e-mails antigos (troca de e-mail) e nomes antigos (alteração de nome)** são
  gravados na auditoria já anonimizados, convertidos em identificador estável e não reversível; no caso de **usuário excluído**,
  e-mail, nome, IP e dispositivo dele passam a constar como identificador anônimo. A justificativa em texto livre do administrador
  é **mantida**, assim como o motivo escolhido.
- **Risco residual aceito pelo usuário**: como a justificativa é mantida, o texto livre pode citar dados pessoais do usuário
  excluído. A mitigação é o aviso no formulário orientando a não escrever dados pessoais (FR-048); o risco residual foi aceito.
- **Privacidade do que o administrador vê (confirmado)**: a lista de sessões mostra data de início, último uso, **IP** e **tipo de
  dispositivo/navegador**; a abertura do detalhe de um usuário é auditada (não buscas nem listas); **não há exportação de dados nesta
  versão** (FR-018). IP e dispositivo são dado pessoal: são anonimizados junto com e-mail e nome na exclusão do usuário (FR-039) e a
  política de privacidade/aviso ao usuário deve informar essa coleta (FR-061).
- **IP real via Cloudflare (confirmado)**: o IP do cliente vem do cabeçalho do Cloudflare (CF-Connecting-IP), confiável apenas quando
  a requisição chega pelo túnel (FR-054). Como requisito de comportamento; o detalhe técnico fica para o plano.
- **Volume da auditoria de tentativas (confirmado)**: a tentativa de acesso negado ou de reverter decisão administrativa é registrada
  uma vez por janela de 15 minutos para o mesmo autor/IP, alvo e tipo; as repetições viram apenas contador/métrica fora da
  auditoria (FR-053). O limite de tentativas de login existente continua valendo e as ações do painel também têm limite de taxa
  (FR-055).
- **Modo de manutenção (confirmado)**: usuários comuns ficam sem acesso (login, API e sincronização recebem resposta de manutenção);
  as alterações offline do aplicativo móvel ficam guardadas no aparelho e sincronizam depois, sem perda; as tarefas automáticas
  continuam; o aceite de convite fica bloqueado; a redefinição de senha continua funcionando; administradores operam normalmente
  (FR-058).
- **Sem 2FA nesta versão**: o painel usa a autenticação já existente, reforçada por reautenticação por senha nas ações de risco
  (FR-035), a cada ação. Exigir ou oferecer segundo fator de autenticação (2FA) para administradores é **evolução futura, fora do
  escopo desta feature**.
- **Sem exportação de dados nesta versão**: nenhuma lista, auditoria, histórico ou lista de sessões pode ser exportada (FR-018).
- **Registro de e-mails novo**: hoje não há histórico de envios; esta feature passa a registrar tentativas a partir da sua entrega,
  sem retroativos, retidas por 90 dias.
- **Convites**: validade padrão de 7 dias; o convite não cria conta nem senha antes do aceite.
- **Reenvios**: o limite de reenvios do e-mail de redefinição por usuário reutiliza a política já existente para o autoatendimento.
- **Estatísticas**: "volume de lançamentos" significa quantidade de lançamentos criados por dia, nunca soma de valores; indicadores
  são calculados sobre o sistema inteiro, sem recorte que permita identificar um usuário.
- **Parâmetros editáveis mínimos**: apenas cadastros abertos/fechados e modo de manutenção são editáveis pelo painel nesta versão;
  validade de sessões, limites de login e carência de exclusão permanecem definidos pela implantação.
- **Idioma e formatos**: textos em pt-BR, datas e horas no fuso America/Sao_Paulo e formato brasileiro.
- **Dependência**: requer o serviço de e-mail do sistema configurado para convites, redefinições, códigos de confirmação e testes;
  sem ele, as funções de e-mail do painel informam a indisponibilidade, mas o restante do painel continua funcionando.
- **Compatibilidade com a constituição**: a feature acrescenta tabelas administrativas (auditoria, convites, parâmetros, histórico de
  envios, comunicações pendentes, trocas de e-mail pendentes, motivos de exclusão e avisos de exclusão ao usuário) e uma marca de
  perfil/situação no usuário. Essas tabelas não guardam dados financeiros; a lista de tabelas do Princípio V
  precisará ser atualizada por emenda na fase de planejamento.

**Defaults assumidos sem pergunta ao usuário** (decididos por padrão nesta rodada; revisáveis no plano ou em nova clarificação):

- **Reautenticação do administrador**: as falhas contam no mesmo limite de tentativas de login; após N falhas a sessão do
  administrador é revogada; as ações destrutivas têm limite por administrador (FR-055). Valores de N e dos limites: plano.
- **Sessão do administrador**: tem a mesma validade das dos usuários; retirar o perfil vale na requisição seguinte (FR-004).
- **Convite e cadastro por conta própria**: um convite pendente para um e-mail que depois se cadastra sozinho é consumido pelo
  cadastro (marcado "aceito"); qualquer administrador pode reenviar ou cancelar convites criados por outro, com auditoria (FR-013).
- **Parâmetros de listagem e estatística**: paginação (ex.: 25 por página, máximo 100), tamanho máximo da busca (até 100 caracteres)
  e períodos de estatística (7, 30 e 90 dias) são parâmetros para o plano.
- **Suspensão e encerramento de sessões sem aviso ao usuário**; a redefinição forçada de senha avisa por e-mail, como já previsto.
- **Proteção do raiz também cobre a redefinição forçada** (que derruba sessões e invalida a senha), o encerramento global de sessões
  (que poupa as sessões do raiz) e a exclusão pelo autoatendimento do próprio raiz; reenviar o e-mail de redefinição ao raiz
  continua permitido, pois não altera o acesso (FR-051).
- **Mais de um raiz**: o dono da implantação pode marcar mais de uma conta como raiz; todas têm a mesma proteção.
- **Detalhe de usuário**: cada abertura (inclusive recarregar a tela) conta como uma abertura auditada (FR-060).
- **IP de visitantes (decidido na rodada 5)**: o IP de visitantes não autenticados é **anonimizado após 90 dias**, mantendo-se a
  linha da tentativa (tipo, momento, resultado, alvo); o IP vira um identificador anônimo, estável e não reversível, para ainda
  permitir correlacionar tentativas do mesmo IP sem expô-lo. Não há titular com conta para disparar a anonimização do FR-039, por
  isso o prazo é o gatilho. A política de privacidade informa isso (FR-061, FR-062).
- **Destinatário no histórico de envios**: aparece em claro durante os 90 dias de retenção (necessário para diagnosticar "o e-mail
  não chegou"); na auditoria, convidados, e-mails e nomes antigos nunca aparecem em claro (FR-039, FR-059).
- **Comunicação pendente**: abrange os avisos de exclusão e de cancelamento da exclusão; falhas de reset, convite, teste e código de
  troca de e-mail são mostradas ao administrador na hora e não geram pendência permanente (FR-056).
- **Convites cancelados ou expirados**: passam a guardar apenas o identificador anônimo do e-mail (o administrador convida de novo
  digitando o endereço).
- **Retenção do endereço pendente**: os 30 dias contam a partir da remoção da conta; esgotado o prazo, a comunicação passa a
  "expirada" e deixa de contar no alerta (FR-057).
- **Janela de deduplicação**: fixa de 15 minutos, contada a partir do primeiro registro da combinação (FR-053).

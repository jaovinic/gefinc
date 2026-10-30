# Research: Contas PF/PJ, cartões vinculados com ícone, receita no app e nova identidade visual

Decisões técnicas (D1–D15) que resolvem as incógnitas do plano.

## D1. Onde guardar tipo de titular, ícone e vínculo

- **Decisão**: três colunas novas em `accounts` (`holder_type`, `icon`, `bank_account_id`), em uma migração V7. Sem tabela nova.
- **Racional**: o tipo de titular e o ícone são atributos da própria conta; o vínculo cartão → conta bancária é uma relação de uma conta com outra da mesma tabela. Uma tabela de vínculo ou de ícones só somaria junções.
- **Alternativas rejeitadas**: tabela `card_bank_links` (junção sem ganho, um cartão tem uma única conta); tabela `icons` no banco (o conjunto é fixo e vive no código).

## D2. Tipo de titular (PF/PJ)

- **Decisão**: `holder_type` (`PF` ou `PJ`) só em contas do tipo `CHECKING`, obrigatório nelas e nulo nos demais tipos (`CHECK`). O cartão **herda na exibição** o selo da conta vinculada; não guarda o seu.
- **Racional**: evita dois valores que podem divergir (cartão PF em conta PJ); trocar o vínculo muda o selo sozinho.
- **Alternativas rejeitadas**: `holder_type` também no cartão (redundância e risco de divergência); PF/PJ como novo `AccountType` (quebraria o `CHECK` e todo código que testa `CHECKING`).

## D3. Vínculo do cartão e cartões antigos

- **Decisão**: `bank_account_id` com **chave estrangeira composta** `(bank_account_id, user_id) → accounts(id, user_id)` (garante mesmo usuário, Princípio III) e `CHECK` de que só o cartão tem vínculo. A obrigatoriedade para cartões **novos** e a exigência de que o alvo seja `CHECKING` e ativa ficam no serviço (a coluna fica anulável para cartões antigos). Edição de um cartão sem vínculo exige informar o vínculo, exceto quando a única mudança é ativar/inativar.
- **Racional**: o banco garante o que dá (mesmo usuário, só cartão tem vínculo); a regra "novo exige" não é expressável em `CHECK` sem bloquear dados legados. Não apagamos nem bloqueamos cartões antigos (spec).
- **Alternativas rejeitadas**: `NOT NULL` com conta "Sem banco" criada automaticamente (inventa dado e polui a lista); gatilho no banco (complexidade sem teste simples no Testcontainers); bloquear cartões antigos até o vínculo (quebra o uso).

## D4. Conjunto de ícones

- **Decisão**: conjunto próprio de ~16 ícones em **SVG embutido** (traços da identidade), com **chaves estáveis** (`bank`, `building`, `briefcase`, `landmark`, `wallet`, `cash`, `piggy`, `card`, `card-gold`, `card-platinum`, `card-black`, `shield`, `rocket`, `star`, `globe`, `shopping-bag`) declaradas uma vez em `core-models` (enum do contrato) e desenhadas em `ui-shared` (`gef-icon`). Padrão por tipo quando nenhum é escolhido: PF `bank`, PJ `building`, espécie `cash`, cartão `card`.
- **Racional**: sem rede, sem biblioteca de ícones, sem marcas registradas, funciona offline e no app; o mesmo componente serve para menu, ações, estados e status (FR-028).
- **Alternativas rejeitadas**: biblioteca de ícones pronta (dependência e peso para ~40 ícones); logos oficiais de bancos (direitos de marca); upload de imagem do usuário (armazenamento, moderação, fora do escopo).

## D5. Escolha de conta ou cartão com ícone

- **Decisão**: componente `gef-account-picker` (campo de formulário) que abre uma lista (reusa `gef-sheet`) com ícone, nome, conta vinculada e selo PF/PJ; mostra o selecionado no próprio campo. Substitui o `<select>` nos formulários de lançamento, lançamento rápido, faturas e filtros de conta. Um `gef-account-badge` (ícone + nome, e opcionalmente conta e selo) é usado em listas, tabelas e cartões.
- **Racional**: `<option>` nativo não exibe ícones; a lista própria resolve o FR-015 e fica acessível (papel `listbox`, foco preso e rótulos), no web e no app.
- **Alternativas rejeitadas**: emoji no texto da opção (não segue a identidade e varia por sistema); biblioteca de select (dependência).

## D6. Menu lateral do web

- **Decisão**: o `Shell` do web passa a ter uma **barra lateral esquerda** com logo, itens (ícone e nome), item ativo destacado (barra lateral + cor + `aria-current`), recolher/expandir (preferência em `localStorage`, tolerando falha) e rodapé com Minha conta e Sair. Abaixo de 1024 px vira **gaveta** aberta por botão no topo, com foco preso e fechamento por Escape, toque fora ou escolha de item. Os itens vêm de uma lista única (`NAV_ITEMS`) em `ui-shared`, também usada pelo menu "Mais" do app.
- **Racional**: padrão esperado em sistemas de gestão; libera largura para tabelas; uma fonte de itens evita divergência entre web e app.
- **Alternativas rejeitadas**: manter o topo com ícones (contra o pedido); biblioteca de layout (dependência para um componente simples).

## D7. Receita no aplicativo

- **Decisão (atualizada em round 3)**: a tela inicial tem um **único botão "Novo lançamento"** (`/novo`), que abre o registro rápido em que a natureza (Despesa | Receita) é escolhida na própria tela, com `?tipo=despesa|receita` para abrir já na natureza desejada (as rotas antigas `/quick-expense` e `/quick-income` redirecionam). _A decisão original era de dois botões lado a lado, "Nova despesa" e "Nova receita", que abriam o mesmo registro com o parâmetro `kind`._ Título, categorias (só as da natureza) e cor mudam com a natureza; padrões (últimas conta e categoria) são **por natureza**. Trocar a natureza por toque devolve o foco ao valor (o teclado numérico segue aberto); pelo teclado ou leitor de tela o foco não é movido. No cadastro completo (`GroupForm`), a natureza deixa de ser um `<select>` escondido e vira um **seletor segmentado "Receita | Despesa" no topo**, o primeiro campo. O limite de 3 toques vale para a receita (abrir, escolher Receita, salvar) e 2 para a despesa.
- **Racional**: o problema relatado é de descoberta; reaproveitar a página evita duplicar offline, rascunho e padrões.
- **Alternativas rejeitadas**: tela separada de receita (duplicação); botão flutuante com menu (esconde a ação, que é o problema). Dois botões lado a lado foram adotados primeiro e trocados em round 3 por um botão único "Novo lançamento", mais enxuto na tela inicial.

## D8. Identidade visual: tokens, fonte e logo

- **Decisão**: manter e consolidar os **tokens já existentes** em `theme.css` (paleta do manual: `#090D16`, `#131B2E`, `#1E293B`, `#00E599`, `#00B4D8`, `#7C3AED`, gradiente de marca) e a fonte **Plus Jakarta Sans variável já empacotada** (funciona offline). O **logo** vira um SVG-fonte único (`gefinc-symbol.svg` e `gefinc-wordmark.svg`) e um componente `gef-logo` (símbolo, símbolo + nome), usado nos shells e nas telas de acesso.
- **Racional**: paleta e fonte já estão em uso; o trabalho novo é o logo, os ícones e a aplicação de ponta a ponta.
- **Alternativas rejeitadas**: nova fonte ou paleta (contraria o manual); imagem PNG do logo nas telas (borra e pesa).

## D9. Geração de favicons e ícones do app

- **Decisão**: um script `tools/brand/generate-assets.mjs` (`npm run brand:generate`) renderiza os SVG-fonte no **Chromium do Playwright, que já é dependência de desenvolvimento**, em todos os tamanhos (favicons 16/32/48, `apple-touch-icon` 180, 192/512 do manifesto, ícones Android `mipmap-*` com foreground adaptável e versão monocromática, ícone iOS 1024, ícone de notificação) e monta o `favicon.ico` com um escritor mínimo do formato ICO. Os arquivos gerados são versionados.
- **Racional**: nenhuma ferramenta de imagem está instalada e nenhuma dependência nova é necessária; a geração é repetível quando o logo final do usuário chegar.
- **Alternativas rejeitadas**: `sharp`/`resvg` (dependência nova); exportar à mão (não repetível); usar o PNG da imagem compartilhada (baixa resolução).

## D10. Estados, confirmações e movimento

- **Decisão**: `EmptyView` e `ErrorView` ganham ícone; um `ToastHost` (nos dois shells) mostra confirmações discretas disparadas por `NoticeService.toast(...)`, com ação **Desfazer** para pagar item; `@media (prefers-reduced-motion: reduce)` remove transições e animações.
- **Racional**: atende FR-032 a FR-034 com componentes já existentes e uma peça nova pequena.

## D11. Contraste e "não depender só de cor"

- **Decisão**: receita e despesa passam a ter **sinal (+/−), ícone de seta e cor**; status ganha ícone (pago ✓, pendente relógio, atrasado alerta) além do texto e da cor; tokens de texto sobre superfície validados em AA (a auditoria axe existente cobre as telas novas).
- **Racional**: FR-031 e FR-034; o E2E de conforto já existe e é estendido.

## D12. Migração dos dados existentes

- **Decisão**: V7 acrescenta as colunas, preenche `holder_type = 'PF'` nas contas `CHECKING` existentes e deixa `icon` e `bank_account_id` nulos. O ícone padrão é resolvido na **resposta da API** (não gravado), então mudar o padrão não exige migração. Um teste usa a API do Flyway para migrar até V6, inserir dados legados e migrar até a última.
- **Racional**: nada é apagado ou bloqueado; o teste de migração protege o que mais pode dar errado em produção.

## D13. Compatibilidade com a cópia local e o modo offline

- **Decisão**: o app tolera respostas antigas guardadas na cópia local (sem `holderType`, `icon` ou `bankAccountId`): trata como PF, ícone padrão e cartão sem vínculo. Criar conta, editar conta e vincular cartão **exigem conexão** (já são operações fora da fila).
- **Racional**: a cópia local pode ter sido gravada antes da atualização do app.

## D14. Contrato e tipos

- **Decisão**: o OpenAPI de `packages/core-models` ganha os enums `HolderType` e `AccountIcon` e os campos novos de `Account`, `AccountInput` e `AccountUpdate`; os tipos TypeScript são regenerados no mesmo PR (constituição).

## D15. Estratégia de testes

- **Backend (Testcontainers)**: regras de titular, ícone, vínculo, conta inativa, outro usuário, exclusão e inativação, edição de cartão legado, migração V7, contrato.
- **Unitários (Jest)**: registro de ícones (toda chave tem desenho), `gef-icon`, `gef-account-badge`, `gef-account-picker` (teclado, rótulos, foco), formulário de conta/cartão, `GroupForm` com natureza no topo, shell do web (menu lateral, recolher, gaveta, teclado), toast com desfazer, `quick-expense` por natureza.
- **E2E (Playwright)**: web — menu lateral e contas PF/PJ/cartões; mobile — receita em até 3 toques e offline; identidade (cores, fonte, logo, favicons) e auditoria de conforto/axe nas telas novas.
- **iOS**: só o que for código compartilhado e arquivos de ícone; build em iPhone segue pendente de um Mac.

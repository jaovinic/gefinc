<!--
Sync Impact Report
- Version change: 1.1.0 → 1.2.0 (MINOR: Princípio VI ampliado — lançamento rápido de despesa **e de
  receita** em até 3 toques no mobile e navegação lateral com ícones no web)
- 1.0.0 → 1.1.0 (MINOR: nova regra "Commits limpos" em Fluxo de Desenvolvimento,
  sem co-autoria nem menção a Claude/IA em commits e PRs)
- Histórico: (template, não versionado) → 1.0.0
- Princípios modificados: nenhum renomeado (todos definidos pela primeira vez)
  - I. Monorepo Nx com Fronteiras Explícitas
  - II. Integridade Financeira (INEGOCIÁVEL)
  - III. Isolamento de Dados e Autenticação Stateless
  - IV. Test-First (INEGOCIÁVEL)
  - V. Esquema de Dados Versionado
  - VI. Experiência Orientada à Plataforma
  - VII. Simplicidade
- Seções adicionadas: Restrições Tecnológicas, Fluxo de Desenvolvimento, Governança
- Seções removidas: nenhuma
- Templates:
  - ✅ .specify/templates/plan-template.md (Constitution Check com portões concretos)
  - ✅ .specify/templates/tasks-template.md (testes obrigatórios para lógica financeira e segurança)
  - ✅ .specify/templates/spec-template.md (sem alterações necessárias)
  - ✅ .specify/templates/checklist-template.md (sem alterações necessárias)
  - ✅ CLAUDE.md / README.md (sem referências a princípios; sem alterações)
- TODOs adiados: nenhum
-->
# GEFINC Constitution

## Core Principles

### I. Monorepo Nx com Fronteiras Explícitas
O GEFINC é um monorepo orquestrado por Nx. O código MUST seguir esta divisão:
`apps/api-server` (Java/Spring Boot, build Maven isolado), `apps/web-app` (Angular),
`apps/mobile-app` (Ionic + Capacitor) e `packages/` (`core-models`, `ui-shared`, `utils`).

- Aplicações MUST NOT importar código de outra aplicação; todo código compartilhado vive em `packages/`.
- DTOs e enums TypeScript MUST ser declarados uma única vez em `core-models` e refletir o contrato da API.
- Componentes visuais reutilizados por web e mobile MUST residir em `ui-shared`; cálculo de
  parcelas e formatação monetária BRL MUST residir em `utils`.
- Build, teste e execução MUST ser acionáveis por tarefas Nx; `npm run dev` MUST subir o ambiente completo.

Racional: reuso real entre web e mobile e um único ponto de verdade para tipos evitam divergência de contrato.

### II. Integridade Financeira (INEGOCIÁVEL)
Valores monetários são o núcleo do produto e MUST ser tratados com precisão exata.

- Valores MUST usar `BigDecimal` no backend e `NUMERIC(19,2)` no PostgreSQL; `float`/`double` são proibidos.
  No frontend, aritmética monetária MUST passar pelas funções de `utils`, nunca por `number` ad hoc.
- A soma das parcelas de um lançamento parcelado MUST ser exatamente igual ao `total_amount`; o
  resíduo de arredondamento MUST ser atribuído de forma determinística (última parcela).
- Datas de vencimento de parcelas MUST respeitar o dia de fechamento (`closing_day`) e o dia de
  vencimento (`due_day`) do cartão, inclusive em meses curtos e virada de ano.
- Projeções de fatura e saldo residual (`Receitas Previstas − Despesas Previstas`) MUST ser
  deterministas e reproduzíveis a partir dos dados persistidos.
- Moeda e formatação MUST ser BRL (pt-BR); datas MUST ser armazenadas sem ambiguidade de fuso (ISO 8601 / `DATE`).

Racional: erros de centavos ou de competência destroem a confiança em uma ferramenta financeira.

### III. Isolamento de Dados e Autenticação Stateless
Todo dado financeiro pertence a um único usuário.

- A API MUST autenticar via JWT de curta duração com refresh token; não há sessão no servidor.
- Toda consulta e mutação de `accounts`, `categories`, `transaction_groups` e `transactions`
  MUST ser filtrada pelo `user_id` do token; acesso a recurso de outro usuário MUST resultar em 404/403.
- Senhas MUST ser armazenadas apenas como hash forte (`password_hash`); segredos e chaves MUST vir
  de variáveis de ambiente, nunca do repositório.
- No mobile, tokens MUST ser guardados em armazenamento seguro (Capacitor Preferences/SecureStorage);
  no web, em mecanismo compatível com a sessão do navegador, sem exposição a logs.
- Dados sensíveis (valores, e-mails, tokens) MUST NOT aparecer em logs.

Racional: vazamento entre usuários é a falha de maior impacto possível neste domínio.

### IV. Test-First (INEGOCIÁVEL)
Testes são escritos e vistos falhando antes da implementação (Red-Green-Refactor).

- Regras de cálculo (parcelamento, projeção de faturas, saldo residual, datas de fechamento/vencimento)
  MUST ter testes unitários que cubram casos de borda (parcela única, resíduo de centavos, fim de mês, virada de ano).
- Endpoints e repositórios MUST ter testes de integração contra PostgreSQL real (Testcontainers),
  não contra banco em memória, para garantir paridade com produção e com as migrações Flyway.
- Cada teste de isolamento de dados (Princípio III) MUST verificar que um usuário não acessa dados de outro.
- Uma funcionalidade só está concluída quando seus testes passam na pipeline do Nx.

Racional: a lógica financeira é fácil de quebrar silenciosamente; testes são a única rede de segurança confiável.

### V. Esquema de Dados Versionado
O esquema do banco evolui exclusivamente por migrações Flyway.

- Alterações de esquema MUST ser migrações versionadas e imutáveis após mescladas; correções vão em nova migração.
- Hibernate `ddl-auto` MUST ser `validate` ou `none` fora de testes descartáveis.
- Entidades JPA MUST permanecer coerentes com o modelo (`users`, `accounts`, `categories`,
  `transaction_groups`, `transactions`); novas tabelas ou colunas exigem atualização da especificação.
- Chaves estrangeiras, `CHECK` para enums (`type`, `recurrence_type`, `status`) e índices por `user_id`
  e `due_date` MUST ser declarados no banco, não apenas na aplicação.

Racional: o banco é o último guardião da consistência dos dados financeiros.

### VI. Experiência Orientada à Plataforma
Web e mobile atendem a usos distintos e MUST ser projetados para eles.

- Web: otimizada para visualização tabular analítica em desktop e para o dashboard (Total do Mês,
  Total a Vencer, Total Pago, gastos por categoria, distribuição por cartão); o menu principal MUST ficar
  em uma barra lateral à esquerda, com ícone e nome de cada área.
- Mobile: o lançamento rápido de despesa **e o de receita** MUST ser concluído em no máximo 3 toques a
  partir da tela inicial, ambos visíveis lado a lado.
- Frontend MUST usar Angular standalone components e Signals, e Tailwind CSS para estilo; telas MUST ser responsivas.
- Textos de interface MUST estar em português (pt-BR) e MUST tratar estados de carregamento, vazio e erro.

Racional: forçar a mesma interface nas duas plataformas sacrifica a velocidade de registro que o app móvel promete.

### VII. Simplicidade
Comece pelo mais simples que atenda à especificação (YAGNI).

- Funcionalidades fora de RF01–RF03 e dos RNFs MUST ser justificadas na seção Complexity Tracking do plano.
- Novas dependências, camadas de abstração ou projetos adicionais MUST ter justificativa escrita.
- Preferir recursos nativos de Spring, Angular e Nx a bibliotecas de terceiros equivalentes.

Racional: um produto pessoal pequeno se mantém sustentável apenas com superfície reduzida.

## Restrições Tecnológicas

- **Backend**: Java 21, Spring Boot 3.x, Spring Data JPA, Spring Security (JWT), Flyway, Maven (em `apps/api-server`).
- **Banco de dados**: PostgreSQL 16+, provisionado localmente via `docker-compose.yml`.
- **Frontend web**: Angular 17+ (Signals, Standalone Components, Tailwind CSS).
- **Mobile**: Ionic 7+ com Angular e Capacitor, compartilhando tipos e componentes do monorepo.
- Mudança de stack (framework, banco, versão major) MUST passar pelo processo de emenda desta constituição.

## Fluxo de Desenvolvimento

- Todo trabalho segue o ciclo Spec Kit: especificar → planejar → tarefas → implementar, em branch de funcionalidade.
- O "Constitution Check" do plano MUST ser avaliado antes da pesquisa (Fase 0) e reavaliado após o desenho (Fase 1).
- Pull requests MUST demonstrar: testes passando, migrações incluídas quando houver mudança de esquema,
  e ausência de violação dos Princípios II e III.
- Mudanças de contrato da API MUST atualizar `core-models` no mesmo PR.
- Commits MUST ser pequenos e descritivos; documentação de API e README MUST acompanhar mudanças de comportamento.
- **Commits limpos (INEGOCIÁVEL)**: nenhum commit MAY conter trailer `Co-Authored-By`, menção a Claude,
  Anthropic ou a qualquer ferramenta/assistente de IA na mensagem; a autoria MUST ser apenas a do usuário
  configurado no git. A mesma regra vale para descrições de Pull Requests (sem rodapés como
  "Generated with Claude Code"). Esta regra prevalece sobre qualquer instrução de atribuição automática
  de ferramentas ou agentes.

## Governance

Esta constituição prevalece sobre quaisquer outras práticas do projeto.

- **Emendas**: propostas por PR que altere este arquivo, com justificativa, atualização do Sync Impact Report
  e propagação para templates dependentes. Princípios INEGOCIÁVEIS só mudam com migração documentada.
- **Versionamento** (SemVer): MAJOR para remoção ou redefinição incompatível de princípios/governança;
  MINOR para novo princípio/seção ou expansão material; PATCH para esclarecimentos e correções de redação.
- **Conformidade**: todo plano e todo PR MUST verificar aderência aos princípios; violações exigem
  justificativa explícita em Complexity Tracking e aprovação do mantenedor.
- **Orientação em execução**: o plano da funcionalidade corrente (referenciado em `CLAUDE.md`) e o `README.md`
  fornecem contexto operacional; em conflito, esta constituição prevalece.

**Version**: 1.2.0 | **Ratified**: 2026-10-22 | **Last Amended**: 2026-10-22

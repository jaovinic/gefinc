# Research: Gestão Financeira Pessoal (GEFINC)

**Feature**: `001-personal-finance-management` | **Date**: 2026-10-22

A stack já está definida pela constituição e pelo `spec-genfic.md`. Esta pesquisa registra as
**decisões de projeto** necessárias para implementar a spec dentro dessa stack. Não restou
nenhuma incógnita técnica em aberto.

Versões exatas (Spring Boot 3.x, Angular 17+, Ionic 7+, Nx) são fixadas na tarefa de
scaffolding, usando a última versão estável compatível com a faixa exigida pela constituição.

## D1. Representação de dinheiro na API e no banco

- **Decisão**: Banco `NUMERIC(19,2)`; backend `BigDecimal` (escala 2, `RoundingMode.HALF_EVEN`
  apenas em cálculos que o exijam); na API JSON, valores monetários são **strings decimais**
  (`"1234.56"`), nunca números JSON.
- **Racional**: números JSON viram `double` no JavaScript e perdem precisão (Princípio II).
  Strings preservam o valor exato e são validadas por padrão (`^-?\d+\.\d{2}$`).
- **Alternativas**: inteiros em centavos (exigiria conversão em todo lugar e diverge do
  modelo `NUMERIC` exigido); números JSON (rejeitado por precisão).

## D2. Cálculo de parcelas e vencimentos (cartão e demais contas)

- **Decisão**: Uma classe pura `InstallmentScheduler` no backend (autoritativa) e um módulo
  equivalente em `packages/utils` (prévia na UI). Ambos são testados contra **os mesmos vetores
  de teste** em `packages/core-models/fixtures/installments.json`.
- **Regras**:
  - Cartão: compra com dia ≤ `closing_day` (inclusive, ajustado ao último dia do mês) entra na
    fatura do mês da compra; depois disso, entra na do mês seguinte. O vencimento da fatura é
    `due_day` do mesmo mês se `due_day > closing_day`, senão do mês seguinte ao fechamento.
    Dias 29–31 são limitados ao último dia do mês.
  - Demais contas: parcela *k* vence no mês do primeiro vencimento + (*k*−1), limitada ao
    último dia do mês, preservando o dia original como referência (31/01 → 28/02 → 31/03).
  - Valor: `floor(total/n, 2)` em cada parcela; o resto de centavos vai para a última.
  - Quando `due_day == closing_day`, o vencimento cai no mês seguinte ao fechamento (a regra é
    `due_day > closing_day` para o mesmo mês).
  - A regra do cartão vale para **toda** ocorrência: parcela, compra avulsa e cada mês de um
    lançamento fixo (tratado como compra no dia de `purchase_date` do mês, limitado ao último dia).
    O vencimento nunca é informado pelo usuário em cartão. A classe pura `DueDateCalculator`
    (Java e TypeScript) concentra o cálculo; `InstallmentScheduler` e o serviço de grupos a usam.
- **Racional**: a constituição exige que o cálculo viva em `utils` (Princípio I) e que o
  resultado seja determinístico (Princípio II); o servidor continua sendo a fonte da verdade.
  Vetores compartilhados evitam divergência silenciosa entre as duas implementações.
- **Alternativas**: só no servidor com endpoint de prévia (viola a localização exigida em
  `utils` e adiciona latência à UI); só no cliente (nunca confiável).

## D3. Faturas: visão derivada + pagamentos persistidos

- **Decisão**: Não existe tabela `invoices`. Uma fatura é identificada por
  `(account_id, mês do due_date)` e calculada por agregação. Pagamentos de fatura são
  persistidos em `invoice_payments`. Itens quitados automaticamente guardam
  `transactions.settled_by_payment_id`.
- **Fórmula**: `restante = total − Σ pagamentos − Σ itens PAID com settled_by_payment_id nulo`.
  Quando `restante = 0` após um pagamento, os itens PENDING da fatura viram PAID com
  `settled_by_payment_id` = id do pagamento. Desfazer qualquer pagamento reverte para PENDING
  todos os itens da fatura com `settled_by_payment_id` não nulo.
- **Racional**: a spec define fatura como visão derivada (Key Entities); persistir só o
  pagamento mantém uma única fonte de verdade e atende FR-033 a FR-038 e o caso de borda de
  desfazer após quitação.
- **Invariante**: `restante ≥ 0` sempre. Operações que o violariam (excluir item, reduzir
  valor, ou pagar acima do restante) retornam `409` com código `INVOICE_BALANCE_VIOLATION`.
  Verificação feita dentro da transação com `SELECT … FOR UPDATE` na linha da conta.
- **Chaves e exclusão**: referências a pai usam `ON DELETE NO ACTION`, não `RESTRICT` (que não
  pode ser adiado e falharia na exclusão de usuário em cascata, FR-010). Itens quitados por
  pagamento recebem `payment_date` = `paid_at` do pagamento; `settled_by_payment_id` não usa
  `SET NULL`, para que um item não vire "pago individualmente" por engano.
- **Painel**: "Total Pago" = itens pagos individualmente + pagamentos de fatura do mês do
  vencimento (itens quitados por pagamento não entram de novo). Ver `data-model.md`.
- **Alternativas**: tabela `invoices` materializada (duplica dado e exige sincronização);
  marcar itens como pagos a cada pagamento parcial (contradiz a spec).

## D4. Lançamentos fixos (recorrência mensal)

- **Decisão**: Materializar ocorrências para uma janela de 12 meses à frente. Um job
  `@Scheduled` diário completa a janela de grupos ativos (idempotente por
  `UNIQUE (group_id, reference_month)`). Alterar valor "a partir do mês M" atualiza apenas as
  ocorrências PENDING com `reference_month ≥ M`; encerrar define `end_month` e remove as
  ocorrências PENDING posteriores.
- **Racional**: consultas de painel e projeção usam agregações SQL simples sobre
  `transactions`, sem expandir regras em tempo de leitura; atende SC-006 e FR-019.
- **Alternativas**: expansão em tempo de leitura (consultas complexas e difíceis de testar);
  janela infinita (volume ilimitado).
- **Premissa operacional**: uma única instância da API roda o job; execuções repetidas são
  inofensivas por causa da unicidade.

## D5. Autenticação e sessões (RNF02, FR-002, FR-005)

- **Decisão**: JWT de acesso com duração de 15 minutos e refresh token **opaco**, rotativo, de
  30 dias, guardado no banco apenas como hash SHA-256. Reuso de um refresh token já rotacionado
  revoga toda a família de tokens daquele login.
  - **Web**: o refresh token trafega em cookie `HttpOnly; Secure; SameSite=Strict`; o token de
    acesso fica apenas em memória.
  - **Mobile**: ambos os tokens ficam no corpo JSON e são guardados em armazenamento seguro do
    dispositivo (Keychain/Keystore via plugin de secure storage do Capacitor).
  - O cliente web identifica-se com o cabeçalho `X-Client: web` para receber o cookie.
- **Senhas**: BCrypt com custo 12 (nativo do Spring Security). O limite é de **72 bytes** em
  UTF-8, validado no servidor (não 72 caracteres).
- **Invalidação imediata**: `users.token_version` (inteiro) é gravado no JWT de acesso. O filtro
  de segurança faz uma consulta indexada por requisição e recusa tokens com versão diferente ou
  de usuário com exclusão pendente. A versão sobe na troca de senha e no pedido de exclusão, o
  que encerra também os tokens de acesso ainda não expirados (FR-006, FR-008).
- **Racional**: reduz exposição a XSS no web (token longo fora do JavaScript) e atende o
  armazenamento seguro no mobile. Dois modos de entrega são justificados em Complexity Tracking.
- **Alternativas**: tudo em `localStorage` (vulnerável a XSS); sessão com cookie de servidor
  (viola "stateless" do RNF02).

## D6. Recuperação de senha (FR-006, FR-007)

- **Decisão**: tabela `password_reset_tokens` (hash SHA-256 do token, `expires_at` = agora + 60
  min, `used_at`). Limite de 3 solicitações por e-mail por hora, contado no próprio banco. A
  resposta é sempre `202` idêntica, exista ou não a conta. Nova solicitação invalida os links
  anteriores. Ao confirmar, a senha muda e todos os refresh tokens do usuário são revogados.
  Envio por SMTP (Spring Mail); em desenvolvimento, Mailpit via `docker-compose`.
- **Racional**: sem dependência nova de infraestrutura (sem Redis); respeita a não
  enumeração de contas.
- **Alternativas**: Redis para rate limit (infra extra sem necessidade); provedor de e-mail
  transacional proprietário (decisão de produção, fora do escopo do plano).

## D7. Exclusão de conta com carência (FR-008 a FR-010)

- **Decisão**: coluna `users.deletion_requested_at`. Solicitar exige senha, revoga todos os
  refresh tokens e grava a data. Enquanto pendente, `login` responde `423 Locked` com código
  `ACCOUNT_DELETION_PENDING` e a data limite, **sem emitir tokens**. O cancelamento é um
  endpoint próprio que recebe e-mail e senha. Um job diário remove, com `DELETE` em cascata,
  usuários com `deletion_requested_at` ≤ agora − 30 dias. O e-mail permanece reservado durante
  a carência (unicidade natural).
- **Efeito imediato**: o pedido de exclusão incrementa `token_version`; credenciais de acesso
  emitidas antes são recusadas já na requisição seguinte (ver D5).
- **Racional**: nenhum dado é acessível durante a carência e a eliminação é completa por
  `ON DELETE CASCADE`, sem lógica espalhada.
- **Observação**: retenção em backups do banco após a exclusão é decisão operacional, anotada
  como pendência de baixo impacto da spec.

## D8. Concorrência e consistência de edição

- **Decisão**: `@Version` (bloqueio otimista) em `transaction_groups`, `transactions` e
  `accounts`; as requisições de atualização enviam `version` e recebem `409
  (STALE_VERSION)` se estiver desatualizada. Exclusões de `transactions` e pagamentos de
  fatura passam pelo bloqueio da linha da conta (D3).
- **Racional**: cobre o caso de borda de dois dispositivos editando ao mesmo tempo sem
  complexidade de sincronização.

## D9. Isolamento de dados no banco (Princípio III)

- **Decisão**: todas as tabelas de domínio têm `user_id NOT NULL`; `transactions` também.
  Chaves estrangeiras **compostas** `(x_id, user_id)` garantem no banco que um lançamento só
  referencia conta, categoria e grupo do mesmo usuário. Todo repositório recebe `userId` do
  token (`@AuthenticationPrincipal`), nunca de parâmetro da requisição. Recurso de outro
  usuário responde `404`.
- **Racional**: defesa em profundidade; mesmo um bug de serviço não grava referência cruzada.
- **Alternativas**: Row Level Security do PostgreSQL (exige sessão por usuário no pool; mais
  complexo que o benefício agora); filtro só na aplicação (sem proteção no banco).

## D10. Contrato da API e tipos compartilhados (Princípio I)

- **Decisão**: contrato **OpenAPI 3.1** escrito primeiro (`contracts/openapi.yaml`), copiado na
  implementação para `packages/core-models/openapi/gefinc.openapi.yaml`. Os tipos TypeScript de
  `core-models` são **gerados** desse arquivo (`openapi-typescript`) e ficam sob versionamento. Os testes
  de integração do backend validam respostas contra o mesmo arquivo
  (`swagger-request-validator`). Erros seguem RFC 7807 (`application/problem+json`) com campo
  `code` estável. A API é versionada por prefixo `/api/v1`.
- **Racional**: um único contrato alimenta backend, web e mobile; DTOs são declarados uma só
  vez, como a constituição exige.
- **Alternativas**: gerar o contrato a partir das anotações do Spring (o contrato passa a
  seguir o código, e não o contrário); manter DTOs à mão em cada lado (deriva garantida).

## D11. Painel, projeção e desempenho (SC-006)

- **Decisão**: agregações SQL (`SUM … GROUP BY`) por mês de `due_date`, apoiadas pelos índices
  `(user_id, due_date)`, `(user_id, account_id, due_date)` e `(user_id, category_id, due_date)`.
  Sem cache na primeira versão. Meta: p95 < 2 s com 6.000 lançamentos, validada por teste de
  carga leve no Testcontainers.
- **Racional**: a cardinalidade é pequena; o índice resolve. Cache só entra se o teste de
  desempenho falhar (Princípio VII).

## D12. Frontend web e gráficos

- **Decisão**: Angular standalone + Signals, Tailwind CSS, roteamento por rotas *lazy*,
  `HttpClient` com interceptor de refresh, formulários reativos. Gráficos com **Chart.js 4**
  (via componente próprio em `ui-shared`, sem wrapper de terceiros além do necessário).
  Valores monetários passam sempre por `packages/utils` (`Money` baseado em `string` + BigInt de
  centavos para aritmética, sem `number` de ponto flutuante).
- **Alternativas**: ngx-charts / ApexCharts (dependências maiores sem ganho para dois gráficos).

## D13. Aplicativo móvel e lançamento em até 3 toques (RNF03, SC-002)

- **Decisão**: Ionic + Angular reutilizando `core-models`, `ui-shared` e `utils`. Tela inicial
  tem botão de ação flutuante "Nova despesa": **toque 1** abre o formulário já preenchido com
  conta, categoria e data padrão (últimas usadas); o usuário digita o valor; **toque 2** em
  "Salvar" conclui. Ajustes de conta/categoria/data ficam inline no mesmo formulário. O teste E2E
  conta os toques em viewport móvel.
- **Armazenamento seguro**: plugin de secure storage para Capacitor (Keychain/Keystore); o
  pacote exato é validado no scaffolding.
- **Racional**: o limite é de 3 toques, e o fluxo proposto usa 2 mais a digitação do valor.

## D14. Estratégia de testes (Princípio IV)

- **Backend**: JUnit 5 + AssertJ; testes unitários puros para `InstallmentScheduler`, cálculo
  de fatura e regras de pagamento; testes de integração com **Testcontainers (PostgreSQL 16)**
  executando as migrações Flyway reais; testes de isolamento entre usuários para cada recurso.
- **Frontend**: Jest + Testing Library para componentes e `utils`; Playwright para fluxos
  críticos (cadastro/login, lançar parcelado, pagar fatura parcial, painel) e para o fluxo
  móvel de 3 toques em viewport de celular.
- **Carga (SC-008)**: script de carga com k6 em `apps/api-server/loadtest/` simulando 1.000
  usuários simultâneos nos fluxos de lançamento, painel e projeção, executado sob demanda e
  antes de releases (fora da pipeline padrão).
- **Vetores compartilhados**: `installments.json` consumido por Java e TypeScript (D2).
- **Pipeline**: `nx affected -t lint test build`; o build Maven roda via `nx:run-commands`.

## D15. Orquestração Nx e Maven (RNF01)

- **Decisão**: `apps/api-server` mantém um `pom.xml` próprio e um `project.json` com alvos
  `build`, `test`, `serve` e `lint` que executam o Maven Wrapper (`./mvnw`) por
  `nx:run-commands`. Scripts do `package.json`: `dev` (sobe o PostgreSQL e o Mailpit via Docker
  Compose e executa `serve` do backend, do web e do mobile no navegador em paralelo), `test`, `build`.
- **Alternativas**: plugin comunitário de Maven para Nx (dependência extra sem necessidade).

## D16. Observabilidade e segurança operacional

- **Decisão**: logs estruturados em JSON, com identificador de correlação por requisição, sem
  e-mail, valores ou tokens (FR-003 e Princípio III); Spring Boot Actuator só com `health` e
  `info`; CORS restrito às origens do web e do app; cabeçalhos de segurança padrão do Spring
  Security. Limitação de tentativas de login por e-mail/IP fica como melhoria futura
  (anotada, fora da spec atual).

## D17. Relógio e datas

- **Decisão**: `Clock` injetável (testes determinísticos). "Hoje" para atraso e "Total a
  Vencer" usa o fuso `America/Sao_Paulo`. Datas de negócio são `DATE` (sem hora e sem fuso);
  instantes de auditoria são `TIMESTAMPTZ` em UTC.

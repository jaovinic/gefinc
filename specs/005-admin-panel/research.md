# Research: Painel administrativo

Decisões técnicas (D1–D32) que resolvem o que a spec deixou para o plano. Cada uma traz a decisão, o racional e as alternativas
rejeitadas. Valores numéricos "para o plano" estão consolidados em D32.

## D1. Dependência da infraestrutura de e-mail (branch `fix/smtp-brevo-async-reset-mail`)

- **Fato verificado**: `main` tem um `MailService` mínimo (`sendPasswordReset`, SMTP sem autenticação, envio síncrono dentro da
  transação, falha engolida). A branch `fix/smtp-brevo-async-reset-mail` (commits `7af549b` e `cc16559`, **sem merge e sem PR**) traz SMTP
  autenticado com STARTTLS (Brevo), envio assíncrono pós-commit (`@TransactionalEventListener(AFTER_COMMIT)` + `@Async("mailExecutor")`,
  `AsyncConfig`), retry seletivo (só falha transitória), `MailMetrics` (Micrometer) e log sem destinatário.
- **Decisão**: o painel **depende** dessa infraestrutura (e-mail é crítico em quase todas as histórias: redefinição, convite, aviso de
  exclusão, código de troca de e-mail). **Recomendação**: abrir o PR dessa branch e mesclá-la na `main` **antes** de iniciar a
  implementação; a branch `005-admin-panel` é então atualizada com `git merge main`. Alternativa aceitável: basear a implementação na
  branch `fix/smtp-brevo-async-reset-mail` (mas isso arrasta o PR da 005 para depender do outro). Sem a correção, os envios de produção
  nem saem (sem autenticação SMTP).
- **Conflito esperado**: esta feature altera os mesmos arquivos (`MailService`, `PasswordResetService`, `application.yml`,
  `IntegrationTestBase`, `docker-compose.selfhost.yml`, `docs/operations.md`). Fazer a mesclagem primeiro evita resolver isso duas vezes.
- **Reaproveitamento e generalização do `MailService`**:
  - hoje o método é específico (`sendPasswordReset`) e **nunca propaga falha**. O painel precisa do **resultado**. Passa a existir
    `MailOutcome send(OutgoingMail mail, DeliveryMode mode)`, com `OutgoingMail(kind, to, subject, body, userId)` e
    `DeliveryMode.SYNC_ONCE` (ações do painel: uma tentativa, timeout de 10 s já configurado, resultado devolvido na hora) ou
    `WITH_RETRY` (tarefas de fundo e reenvio automático: política atual da branch). O `describeRootCause`/`isPermanentRejection` da branch
    é reaproveitado para classificar a falha em `FailureReason`.
  - o caminho público de redefinição continua **assíncrono e sem diferença de tempo observável** (decisão da branch, necessária contra
    enumeração de contas). Só o seu *listener* passa a registrar o resultado em `email_deliveries` (D13).
  - modelos de texto em `resources/mail/*.txt` (um por tipo), sempre em pt-BR; nenhum corpo é gravado.
- **Alternativas rejeitadas**: reimplementar o envio na feature (duplica a branch e diverge); deixar `main` como está (envio quebrado em
  produção); tornar todas as ações do painel assíncronas (o administrador precisa saber na hora se falhou, US4.4 e US7.2).

## D2. Modelo do perfil administrador e do administrador raiz

- **Decisão**: uma coluna `users.role VARCHAR(5) NOT NULL DEFAULT 'USER'` com `CHECK (role IN ('USER','ADMIN','ROOT'))`. `ROOT` implica
  `ADMIN` (autoridades `ROLE_ADMIN` e `ROLE_ROOT`). Sem tabela de papéis.
- **Proteção em duas camadas (defesa em profundidade, FR-003/FR-051)**:
  1. **Serviço**: `AdminPolicy` recusa qualquer operação do painel sobre `ROOT` (rebaixar, suspender, excluir/antecipar, trocar e-mail,
     forçar redefinição, encerrar sessões, global ou individual) com `ROOT_PROTECTED` e auditoria `REFUSED`; recusa promoção a `ROOT` (o
     painel só conhece `USER` ↔ `ADMIN`).
  2. **Banco**: gatilho `BEFORE INSERT OR UPDATE OF role OR DELETE ON users` que **só** admite criar, alterar ou apagar `ROOT` quando a
     transação define `SET LOCAL gefinc.allow_root_change = 'on'`. Esse é exatamente o roteiro do dono da implantação (D3); a aplicação
     nunca define essa variável. Mais dois `CHECK`: `ROOT` não pode ter `suspended_at` nem exclusão pendente.
- **Racional**: o requisito é que "só o dono da implantação, pelo banco" altere o raiz; um bug no serviço ou uma rota nova esquecida
  não pode criar um raiz nem destruir um. O gatilho custa ~20 linhas de PL/pgSQL, é testável com Testcontainers e o roteiro continua
  uma única transação.
- **Alternativas rejeitadas**: `is_admin boolean` + `is_root boolean` (permite estados inválidos como `root` sem `admin`; exigiria `CHECK`
  extra e duas colunas para uma hierarquia linear); tabela `admin_roles` (junção sem ganho com papel único, Princípio VII); marcar o
  raiz por e-mail em variável de ambiente (rejeitado pela spec: disputa de cadastro); apenas validação no serviço (o banco aceitaria um
  `UPDATE` indevido de qualquer código futuro).

## D3. Roteiro documentado para criar o raiz e recuperar o acesso

- **Decisão**: seção nova em `docs/operations.md` ("Administrador raiz e recuperação de acesso") e script `tools/ops/promote-root.sh`
  (opcional, apenas conveniência). Ambos executam, via `docker compose exec postgres psql` (selfhost) ou `psql` direto:

  ```sql
  BEGIN;
  SET LOCAL gefinc.allow_root_change = 'on';
  UPDATE users SET role = 'ROOT' WHERE lower(email) = lower('dono@exemplo.com');   -- deve afetar 1 linha
  COMMIT;
  ```

  Recuperação (todas as contas administradoras inacessíveis): (a) a conta raiz perdeu a senha: usar o fluxo normal de redefinição por
  e-mail ou, sem e-mail, `UPDATE users SET password_hash = '<bcrypt gerado fora>' , token_version = token_version + 1 ...`; (b) um
  administrador comum foi suspenso: `UPDATE users SET suspended_at = NULL, token_version = token_version + 1 WHERE ...`; (c) promover outra
  conta a `ROOT` como acima. Cada passo traz a consulta de conferência (`SELECT id, email, role, suspended_at ...`) e o aviso de que
  alterações diretas **não** geram auditoria (por isso o roteiro manda registrar o chamado fora do sistema).
- **Racional**: SC-020 exige o roteiro e que ele resulte em um raiz funcional sem usar interface do sistema; o `SET LOCAL` é a "porta" do
  gatilho de D2.
- **Teste**: `RootGuardTriggerIT` executa o roteiro literal contra o PostgreSQL de teste; E2E usa o mesmo comando (`promoteToRoot` em
  `support.ts`).

## D4. Autorização por função a cada requisição

- **Decisão**: o **papel não vai no JWT**. `JwtAuthenticationFilter` já consulta o usuário a cada requisição (`TokenVersionLookup`); a
  consulta passa a trazer `role`, `suspended_at`, `deletion_requested_at`, `token_version` e o estado da sessão (`sid`, D6) numa única
  projeção. O principal vira `AuthenticatedUser(id, role, sessionId)` e as autoridades (`ROLE_ADMIN`, `ROLE_ROOT`) são derivadas do papel
  **atual no banco**: retirar o perfil vale na requisição seguinte (FR-004), mesmo com token válido.
- **Defesa em três camadas**: (1) regra de URL `requestMatchers("/admin/**").hasRole("ADMIN")` em `SecurityConfig`; (2)
  `@EnableMethodSecurity` + `@PreAuthorize("hasRole('ADMIN')")` em todo controlador de `admin` (via anotação composta `@AdminOnly`); (3)
  teste de enumeração: `AdminAccessIT` percorre o `RequestMappingHandlerMapping`, e para **cada** mapeamento sob `/admin/**` chama como
  anônimo e como usuário comum e exige 401/403 sem corpo administrativo, mais um registro de auditoria por janela (FR-002).
- **Negativa auditada**: `ProblemSecurityHandlers` (entry point e access-denied) delega a `AdminAccessAuditor` quando o caminho começa
  em `/admin`: grava `ACCESS_DENIED` com autor (usuário) ou IP (visitante), de acordo com D11. A resposta continua `401`/`403` genérica.
  Qualquer rota inexistente sob `/admin/**` também cai na regra de URL (não vaza quais existem).
- **Alternativas rejeitadas**: papel no JWT (retirada só valeria após 15 min, violando FR-004); apenas `@PreAuthorize` (esquecer a
  anotação num controlador novo abriria a rota; a regra de URL fecha por padrão); guardas só no Angular (FR-001 proíbe).

## D5. Situação da conta, suspensão e invalidação de sessões

- **Decisão**: `users.suspended_at TIMESTAMPTZ NULL` (suspensa ⇔ não nulo). A situação exibida é **derivada**: `SUSPENDED`,
  `DELETION_PENDING`, `ACTIVE`; suspensão e exclusão pendente **combinam** (colunas independentes). Motivo e autor da suspensão ficam
  na auditoria (FR-009), não na tabela de usuários.
- **Invalidação**: suspender e reativar fazem `token_version++` (os tokens de acesso emitidos morrem na requisição seguinte) e revogam
  todas as famílias de refresh (`TokenService.revokeAllOfUser`). O filtro JWT recusa conta suspensa e conta com exclusão pendente.
- **Login e renovação**: `AuthService.login` confere credenciais primeiro (para não revelar a situação a quem não sabe a senha) e depois
  recusa `suspended_at != null` com `403 ACCOUNT_SUSPENDED` ("procure o suporte"), sem emitir tokens; `refresh` revoga e recusa. O fluxo
  normal de redefinição de senha **não** altera `suspended_at` (a conta continua suspensa, FR-047).
- **Tentativa de reverter** (credenciais certas numa conta suspensa; redefinição; uso de sessão antiga): recusada e auditada como
  `REVERT_ATTEMPT` com deduplicação (D11).
- **Interpretação registrada**: o cancelamento de exclusão "restaura exatamente o estado anterior" (FR-049). Como suspensão e exclusão são
  independentes, **cancelar não toca em `suspended_at`**: conta suspensa continua suspensa naturalmente. Se um administrador reativar a
  conta *durante* a exclusão, a reativação prevalece (decisão explícita posterior); o cancelamento não "ressuscita" a suspensão.
- **Alternativas rejeitadas**: coluna `status` enumerada (`ACTIVE/SUSPENDED/DELETION_PENDING`) não combina os dois estados e obrigaria a
  guardar o "estado anterior" para restaurar; tabela `account_status_history` (a auditoria já é o histórico).

## D6. Sessões: listar, encerrar uma, encerrar todas

- **Fato verificado**: sessão hoje = *família* de refresh tokens (`refresh_tokens.family_id`); não há IP, dispositivo nem "último uso";
  o JWT de acesso (15 min) não identifica a sessão, então encerrar **uma** sessão não derrubaria o token de acesso já emitido.
- **Decisão**: tabela nova `auth_sessions` (PK = `family_id`), com `user_id`, `created_at`, `last_used_at`, `expires_at`, `client_ip`,
  `device_label`, `client_kind`, `revoked_at`, `revoked_by`. O JWT ganha a claim `sid` (UUID da família) e a projeção do filtro (D4) traz
  `auth_sessions.revoked_at` — encerrar uma sessão passa a valer **na requisição seguinte**, sem esperar os 15 min. Tokens emitidos antes
  do deploy (sem `sid`) são aceitos até expirarem (≤ 15 min) e o `sid` passa a ser obrigatório em seguida (`JwtService` com janela de
  transição desligável).
- **"Último uso"** = última renovação do token de acesso (≤ 15 min de granularidade): evita uma escrita por requisição. Atualizado em
  `TokenService.rotate`. `users.last_access_at` (login e renovação) alimenta a ordenação e as estatísticas.
- **Encerrar todas as de um usuário**: `token_version++` + revogar famílias + marcar `auth_sessions.revoked_at`.
- **Encerrar todas do sistema (FR-030)**: operação em lote: para cada usuário que **não** seja `ROOT`, `token_version++` e revogar as
  famílias, **exceto** a sessão (família) do administrador que acionou — para ele só se revogam as *outras* famílias, sem `token_version++`
  (preserva a sua sessão). As sessões dos raízes ficam intactas.
- **Limpeza**: `auth_sessions` revogadas ou expiradas há mais de 30 dias são apagadas pelo job de manutenção (D27); `ON DELETE CASCADE`
  com o usuário (IP e dispositivo somem junto na exclusão, FR-039).
- **Migração**: `V17` preenche `auth_sessions` a partir de `refresh_tokens` (uma linha por família; IP/dispositivo nulos = "não
  registrado"; revogada se todos os tokens da família estão revogados).
- **Alternativas rejeitadas**: colunas em `refresh_tokens` (várias linhas por sessão por causa da rotação; listar exigiria `GROUP BY`);
  lista de revogação (`jti`) em memória (perde-se no reinício); incluir IP no JWT (inútil e vaza).

## D7. Origem da exclusão, histórico da solicitação e restauração

- **Fato verificado**: hoje só existe `users.deletion_requested_at`; a carência de 30 dias é constante (`AuthService.DELETION_GRACE_DAYS`);
  `AccountDeletionService.cancel` cancela qualquer exclusão pendente com e-mail e senha; `UserRepository.deleteExpiredDeletions` apaga em
  lote por `deletion_requested_at`.
- **Decisão**: livro-razão `account_deletion_requests` (uma linha por solicitação, **sem FK para `users`**, ver D9) com `origin`
  (`USER`/`ADMIN`), `mode` (`IMMEDIATE`/`GRACE`), `grace_days`, `due_at`, `status` (`SCHEDULED`, `CANCELED`, `SUPERSEDED`, `EXECUTED`),
  `supersedes_request_id` (a solicitação do usuário que foi antecipada), mensagem fixada, `notice_state` e carimbos. `users` ganha
  `deletion_due_at`, `deletion_origin` e `deletion_request_id` (consistência por `CHECK` com `deletion_requested_at`); os campos de `users`
  são o que o filtro e o login leem (rápido); o livro-razão é a verdade histórica.
- **Antecipar**: a solicitação do usuário passa a `SUPERSEDED`, a nova (`ADMIN`) aponta para ela e `users` recebe o novo prazo/origem.
  Só aceita `due_at` menor que o atual (FR-036). **Cancelar a antecipação**: a nova vai a `CANCELED`, a anterior volta a `SCHEDULED` e
  `users` recebe de volta data, origem `USER` e `deletion_request_id` originais (`restoreFrom(superseded)`); gera aviso
  `user_notices` com a data original (D22). **Cancelar exclusão sem antecipação**: limpa as colunas de `users` e `CANCELED`.
- **Autoatendimento**: `AccountDeletionService.request` também grava uma linha (`origin=USER`, 30 dias de `app.deletion.grace-days`), o
  que unifica o job e permite a restauração; `cancel` por credenciais passa a recusar `origin=ADMIN` (`ADMIN_DECISION_LOCKED`, auditado
  como `REVERT_ATTEMPT`). Raiz e último administrador não podem pedir a própria exclusão (FR-051, FR-005).
- **Migração**: `V15` cria o livro-razão; `V16` cria uma linha `USER/GRACE/30` para cada exclusão pendente legada e preenche
  `deletion_due_at = deletion_requested_at + 30 dias`.
- **Alternativas rejeitadas**: reaproveitar só `deletion_requested_at` e calcular prazo na leitura (sem origem, sem prazo variável, sem
  restauração); guardar o "estado anterior" em JSON dentro de `users` (frágil, sem consulta); adiar via nova data (spec proíbe adiar).

## D8. Prazo variável e execução pelo job

- **Decisão**: `due_at` é a verdade. Imediata: `due_at = now`; com prazo: `requested_at + N dias` (N inteiro 1–30, `CHECK`). O job
  `AccountDeletionJob` passa de diário (03:00) para **a cada 5 minutos** (`fixedDelay`), porque (a) prazos de poucos dias pedem precisão
  de horas e (b) a exclusão imediata é concluída pela requisição, mas o job é a rede de segurança se o processo cair entre o envio do
  aviso e a remoção. Índice parcial `ix_users_deletion_due` em `deletion_due_at`.
- **Fluxo por usuário** (`AccountErasureService.processDue(userId)`, transação própria por usuário, `SELECT ... FOR UPDATE SKIP LOCKED`
  na linha do usuário, que também serializa "cancelamento × fim do prazo": vence o que registrar primeiro):
  1. se o aviso ainda está `QUEUED` (nunca tentado), tenta enviá-lo agora (`SYNC_ONCE`) **fora da trava da linha** e registra `SENT` ou cria a
     comunicação pendente (D14); falha **nunca** impede o passo 2 (FR-038);
  2. numa transação: anonimiza `email_deliveries` do usuário, copia o e-mail para a comunicação pendente (se houver), marca o livro-razão
     `EXECUTED`, grava `ACCOUNT_ERASED` na auditoria (autor `SYSTEM`) e apaga o usuário (a cascata do banco remove os dados financeiros).
- **Exclusão imediata iniciada pelo painel**: a requisição registra a solicitação (transação 1), tenta o aviso (síncrono, uma tentativa,
  ≤ 10 s) e executa `processDue` (transação 2) antes de responder, devolvendo ao administrador o resultado do aviso. Se o processo cair
  no meio, o job conclui.
- **Alternativas rejeitadas**: manter o job diário (imprecisão de até 24 h e janela de uma noite para o imediato); agendar com
  `TaskScheduler` por usuário (perde-se no reinício); `deleteExpiredDeletions` em lote (impede o aviso, a anonimização e o registro por
  usuário).

## D9. Tabelas de histórico sem chave estrangeira para `users`

- **Decisão**: `audit_log`, `account_deletion_requests`, `pending_communications` e `email_deliveries` guardam `*_user_id BIGINT` **sem
  FK**: precisam sobreviver à exclusão do usuário. O identificador é um `IDENTITY` nunca reutilizado e sem significado externo; sem a linha
  de `users`, não liga a ninguém. Onde há dado pessoal, ele fica em coluna que o serviço de exclusão zera (D8) ou em tabela lateral com
  `ON DELETE CASCADE` (D10). Tabelas cuja vida acompanha a do usuário (`auth_sessions`, `user_notices`, `pending_email_changes`) mantêm
  FK com `CASCADE`; `system_parameters.updated_by` e `invitations.invited_by` usam `ON DELETE SET NULL`.
- **Exceção ao Princípio V** ("FKs declaradas no banco") registrada no Complexity Tracking e na emenda.

## D10. Auditoria imutável (append-only) e anonimização sem editar a auditoria

- **Decisão central**: separar o **fato** (imutável) do **dado pessoal** (descartável).
  - `audit_log`: só fatos — `action`, `result`, `actor_kind`, `actor_user_id`, `target_user_id`, `subject`, `reason_text` (justificativa,
    mantida), `refusal_code`, `details` (JSONB de chaves fixas), `client_ref` (HMAC do IP, D11), `dedupe_key`, `occurred_at`. **Nenhum e-mail,
    nome, IP ou dispositivo em claro.** E-mail e nome do alvo/autor são resolvidos **na leitura** por junção com `users`; se a linha de `users`
    não existe mais, a API devolve o rótulo anônimo `anônimo-<8 hex>` calculado por HMAC do id (D11). Resultado: FR-039 (quatro fontes) é
    satisfeito **sem nenhum `UPDATE` em `audit_log`**.
  - `audit_log_client(audit_id PK → audit_log, user_id NULL → users ON DELETE CASCADE, ip, device_label, created_at)`: o IP/dispositivo em
    claro das tentativas auditadas. Excluir o usuário apaga as linhas por cascata (anonimização do FR-039 com IP e dispositivo); para
    **visitantes** (`user_id IS NULL`), o job `AuditClientPurgeJob` apaga as linhas com mais de 90 dias (FR-062), idempotente e recuperável
    (predicado por idade, roda diariamente; tolerância ≤ 1 dia, SC-021). O `client_ref` permanece em `audit_log`, então tentativas do mesmo
    IP continuam correlacionáveis.
  - E-mails de convidados, e-mails antigos e nomes antigos (FR-039, 2–4) entram em `details` **já como HMAC** (`emailRef`, `oldEmailRef`,
    `oldNameRef`), nunca em claro.
- **Imutabilidade garantida e testada**: (1) gatilhos `BEFORE UPDATE OR DELETE` (por linha) e `BEFORE TRUNCATE` (por instrução) em
  `audit_log` (a tabela lateral `audit_log_client` fica fora do gatilho de propósito: ela é o dado pessoal descartável, apagado por cascata e
  pelo job); (2) a entidade JPA é `@Immutable`, sem setters, e o repositório estende `Repository` (apenas `save` e consultas;
  sem `delete*`); (3) nenhum controlador mapeia `PUT/PATCH/DELETE` em `/admin/audit/**`; (4) testes: `AuditImmutabilityIT` tenta `UPDATE`,
  `DELETE` e `TRUNCATE` por `JdbcTemplate` e exige exceção; `AuditApiSurfaceIT` varre os mapeamentos de `/admin/audit/**`;
  `AuditRetentionIT` prova que `DELETE` de usuário não toca `audit_log` e zera `audit_log_client`.
- **Infra de teste**: `IntegrationTestBase` hoje faz `TRUNCATE` de todas as tabelas; passa a desligar os gatilhos de usuário na própria conexão
  (`SET session_replication_role = replica` dentro de uma `ConnectionCallback`, o contêiner de teste é superusuário) antes de truncar. Também
  precisa **recriar as sementes** das migrações (motivos de exclusão, parâmetros) que o `TRUNCATE` apaga: helper `AdminSeed.restore(jdbc)`.
- **Endurecimento opcional** (documentado em operations): rodar a API com um papel de banco que não seja dono das tabelas e sem
  `UPDATE/DELETE/TRUNCATE` em `audit_log`; o gatilho continua sendo a garantia mínima.
- **Escrita atômica com a ação (FR-019, "falha parcial")**: `AuditService.record` participa da **mesma transação** da ação; falha de
  auditoria desfaz a ação. **Recusas** (regra de negócio, reautenticação, raiz protegido) precisam persistir mesmo com a transação da ação
  revertida: `AuditService.recordRefusal` roda em `Propagation.REQUIRES_NEW` e o `GlobalExceptionHandler`/`AdminActionExecutor` o invoca antes de
  relançar a `ApiException`. A abertura do detalhe (FR-060) é uma escrita dentro de um `GET` (transação não-readOnly).
- **`details`**: `AuditDetails` é um construtor com chaves de um `enum` fechado (`field`, `from`, `to`, `emailRef`, `oldEmailRef`,
  `oldNameRef`, `days`, `mode`, `reasonId`, `parameter`, `count`, `requestId`...); valores só escalares curtos. Um teste varre os valores de
  todos os registros gerados por todos os ITs de admin à procura de padrões proibidos (senha, token, link, código de 6 dígitos, e-mail,
  valor monetário).
- **Alternativas rejeitadas**: gravar o e-mail em claro e anonimizar com `UPDATE` (exige exceção à imutabilidade e gatilho com
  contorno; é o que a spec tolera, mas a separação elimina a exceção); criptografar colunas pessoais (chave a gerir, sem ganho); tabela
  particionada por mês (complexidade sem necessidade de escala; o índice `(occurred_at, id)` e a paginação por cursor bastam, D19).

## D11. Identificador anônimo estável e não reversível; deduplicação de 15 minutos

- **Pseudonimização**: `Pseudonymizer` calcula `HMAC-SHA256(PSEUDONYM_SECRET, domínio + ":" + valor normalizado)` e guarda os primeiros 16 bytes
  em hex (32 caracteres, colisão desprezível). Domínios separados (`user`, `email`, `name`, `ip`, `dedupe`, `code`). O **segredo vem de variável
  de ambiente `PSEUDONYM_SECRET` (≥ 32 bytes), fora do banco e distinto de `JWT_SECRET`**; a API recusa subir sem ele em produção. Por ser
  HMAC com segredo, o espaço de 4 bilhões de IPv4 não pode ser varrido sem o segredo (FR-062b). Rótulo na UI: `anônimo-` + 8 primeiros hex.
- **Rotação**: trocar o segredo faz **novos** identificadores divergirem dos antigos (perde a correlação futura, não expõe nada); documentado
  como "não rotacione sem necessidade; guarde junto das demais credenciais".
- **Deduplicação (FR-053)**: janela de 15 minutos contada a partir do primeiro registro. Chave: `HMAC(dedupe, ator|IP|decisão-alvo|tipo)`
  (nos acessos negados o alvo é constante, `/admin`, e não a rota; a rota normalizada vai só em `subject`).
  Em `AdminAccessAuditor`/`RevertAttemptAuditor`: `pg_advisory_xact_lock(hashtext(chave))`, depois `SELECT 1 FROM audit_log WHERE dedupe_key = :k AND
  occurred_at > now() - interval '15 minutes'`; se existir, **não** grava e incrementa o contador Micrometer `gefinc.admin.attempts.suppressed`
  (tags de baixa cardinalidade: `type`); senão grava (com a linha em `audit_log_client`). O `SELECT` usa o índice parcial
  `(dedupe_key, occurred_at DESC) WHERE dedupe_key IS NOT NULL`.
- **Por que no banco e não em memória**: sobrevive a reinício (a regra é "uma vez por janela"), não cresce sem limite sob ataque com IPs
  aleatórios e dá a mesma resposta com mais de uma instância. O custo é uma consulta indexada por requisição negada, aceitável.
- **Contador "fora da auditoria"**: métrica do Micrometer (já presente; o actuator só expõe `health,info`, então não sai da aplicação) +
  linha de log `INFO` agregada por minuto sem IP. SC-001 é verificado lendo o `MeterRegistry` nos testes.
- **Alternativas rejeitadas**: `Map` em memória (perde no reinício; cresce); bucket fixo por quarto de hora (a spec diz "a partir do
  primeiro registro"); Redis (infraestrutura nova).

## D12. IP real (CF-Connecting-IP só do túnel) e tipo de dispositivo

- **Fato verificado**: produção = `cloudflared` na rede `gefinc-net` do Compose, sem portas publicadas no host; hoje
  `FORWARD_HEADERS_STRATEGY=native` faz o Tomcat reescrever `getRemoteAddr()` a partir do `X-Forwarded-For`. `AuthController` usa
  `request.getRemoteAddr()` para o limite de login.
- **Decisão**: novo `ClientIpResolver` (um bean, usado por **todos** os pontos: login, cancelamento, sessões, auditoria):
  1. `peer = request.getRemoteAddr()` — com `FORWARD_HEADERS_STRATEGY=none` é o endereço TCP real (o contêiner `cloudflared`);
  2. se `peer` pertence a `app.security.trusted-proxies` (lista CIDR; env `TRUSTED_PROXY_CIDRS`; **padrão vazio = nunca confia**), lê o cabeçalho
     configurado (`app.security.client-ip-header`, padrão `CF-Connecting-IP`), valida que é **literal IPv4/IPv6** (sem resolução de DNS) e o
     devolve; cabeçalho ausente/inválido cai para `peer`;
  3. fora dos proxies confiáveis o cabeçalho é **ignorado** (IP forjado não vale, FR-054; teste com `CF-Connecting-IP: 1.2.3.4` vindo de
     origem não confiável).
- **Implantação**: `docker-compose.selfhost.yml` fixa a sub-rede de `gefinc-net` e o IP do `cloudflared`
  (`ipv4_address`), define `TRUSTED_PROXY_CIDRS=<ip>/32` e muda `FORWARD_HEADERS_STRATEGY` para `none`. Isso é mais estrito que confiar na sub-rede inteira
  (outros contêineres, como o Postgres, também estão nela). Para outras hospedagens (guia Oracle A1 com proxy próprio): o administrador de sistema configura
  `TRUSTED_PROXY_CIDRS` e `CLIENT_IP_HEADER`. Atualizar `docs/operations.md` (a seção "IP real atrás de proxy" hoje manda usar `native`).
- **Efeito colateral positivo**: o limite de login por IP passa a ser por IP real do cliente (hoje, com `native`, depende do primeiro valor
  de `X-Forwarded-For`, que o cliente pode anexar).
- **Dispositivo**: `DeviceLabelResolver` (classe pura, sem dependência) reduz o `User-Agent` + `X-Client` a um rótulo curto e grosseiro
  ("Chrome em Windows (computador)", "Aplicativo Android", "Safari em iPhone"): família do navegador, SO e classe (computador, celular,
  tablet, aplicativo). O `User-Agent` bruto **nunca** é gravado (menos dado pessoal, FR-061). Limite 80 caracteres.
- **Alternativas rejeitadas**: `server.tomcat.remoteip` com `internal-proxies` (lida com `X-Forwarded-For`, não com o cabeçalho do
  Cloudflare, e confia em faixa privada inteira); `uap-java` (dependência para um rótulo grosseiro, Princípio VII); confiar em
  `CF-Connecting-IP` sempre (qualquer um forja fora do túnel); verificar as faixas IP da Cloudflare (o tráfego do túnel chega do `cloudflared`
  local, não dos IPs da borda).

## D13. Histórico de envios (retenção 90 dias)

- **Decisão**: tabela `email_deliveries` (tipo, `recipient_email` em claro durante a retenção, `recipient_ref`, `user_id` sem FK, status
  `SENT/FAILED`, `failure_reason` enumerado, tentativas, carimbo). **Nunca** corpo, link, token nem código. Quem grava: o próprio
  `MailService.send` (D1), em transação separada (`REQUIRES_NEW`) para que um rollback da ação não apague o registro de um envio que de fato
  aconteceu. `failure_reason` ∈ `AUTHENTICATION`, `PERMANENT_REJECTION`, `TRANSIENT_EXHAUSTED`, `TIMEOUT`, `NOT_CONFIGURED`, `OTHER` (mapeado de
  `MailMetrics.FailureReason`); o painel traduz para frases legíveis, sem a mensagem técnica.
- **Retenção**: `EmailDeliveryPurgeJob` (diário) apaga `created_at < now() - 90 dias`. Não toca em `pending_communications` (outra tabela).
- **Exclusão de usuário**: `AccountErasureService` faz `UPDATE email_deliveries SET recipient_email = NULL WHERE user_id = :id` na mesma
  transação (FR-039/SC-011); a linha fica com `recipient_ref`. Teste `ErasureAnonymizationIT`.
- **Consulta**: `GET /admin/email/deliveries` com filtros por status e tipo e paginação por cursor (D19).
- **Reenvio a partir do histórico (FR-028)**: só `PASSWORD_RESET` com status `FAILED` e `user_id` ainda existente: é o fluxo da US4 (novo
  link), nunca reenvio do mesmo link (o sistema não o guarda). Limite: o mesmo do autoatendimento (3 por hora por e-mail), via
  `PerKeyRateLimiter` (D18).
- **Alternativas rejeitadas**: guardar o corpo para reenviar (vazaria o link); particionar por mês (volume baixo); apagar por gatilho.

## D14. Comunicação pendente (aviso de exclusão ou de cancelamento que falhou)

- **Decisão**: `pending_communications` (`kind` `DELETION_NOTICE|CANCELLATION_NOTICE`, `state` `PENDING|DELIVERED|DISCARDED|EXPIRED`, `deletion_request_id`,
  `user_id` sem FK, `retained_email`, `retained_until`, `failure_reason`, `attempts`). Falhas de reset, convite, teste e código **não** geram pendência (a spec).
- **Endereço retido (FR-057)**: enquanto a conta existe, o destinatário é o e-mail *vivo* do usuário (`retained_email` nulo). Na exclusão, o serviço
  copia o e-mail para `retained_email` e define `retained_until = removida_em + 30 dias`, **somente** para as pendentes. Um `CHECK` garante
  `retained_email IS NULL OR state = 'PENDING'`; entregar, descartar ou expirar zera o campo. O job `PendingCommunicationJob` (a cada hora)
  expira as vencidas. A API nunca devolve o endereço (só o rótulo `anônimo-…` quando a conta foi removida).
- **Alerta permanente**: `GET /admin/alerts` devolve `pendingCommunications` (contagem de `PENDING`); o layout do painel o consulta a cada
  navegação e a cada 60 s (e ao reenviar/descartar). Reenviar reutiliza `MailService.send(SYNC_ONCE)`; sucesso → `DELIVERED` e limpa o endereço.
  Descarte e reenvio são auditados (`COMMUNICATION_DISCARDED`, `COMMUNICATION_RESENT`).
- **Resultado do aviso na solicitação** (SC-016): `account_deletion_requests.notice_state` (`NOT_APPLICABLE|QUEUED|SENT|PENDING|DISCARDED|EXPIRED`) é atualizado
  junto com a pendência, para o registro mostrar o resultado mesmo depois de removido o usuário.
- **Alternativas rejeitadas**: reter o e-mail no histórico de envios (a retenção de 90 dias é maior que a de 30 dias e o histórico é de
  outra natureza); fila de reenvio automática (a spec delega a nova tentativa ao administrador).

## D15. Troca de e-mail com código de 6 dígitos

- **Decisão**: `pending_email_changes` (no máximo uma `PENDING` por usuário, índice único parcial). Fluxo: `POST .../email-change {newEmail}` valida
  formato e unicidade (também contra `users` e contra outro pedido pendente para o mesmo endereço), gera código com `SecureRandom` (0–999999,
  zero à esquerda), grava **só `code_hash = HMAC(PSEUDONYM_SECRET, "code:" + id + ":" + código)`**, envia ao **novo** endereço (`SYNC_ONCE`; falha →
  nada é criado, `502 MAIL_DELIVERY_FAILED`) e invalida o pedido anterior no mesmo commit. Validade 15 min, `attempts` até 5.
- **Confirmação**: `POST .../email-change/confirm {code}` trava a linha (`FOR UPDATE`), confere expiração/status/tentativas, compara em tempo constante
  (`MessageDigest.isEqual`), reconfere a unicidade, grava o novo e-mail, `token_version++` + revoga sessões, notifica o endereço antigo e o novo
  (`EMAIL_CHANGE_NOTICE`, assíncrono) e audita sem código. **Tentativa errada incrementa `attempts` em transação própria** (`REQUIRES_NEW`/
  `noRollbackFor`), senão o rollback da recusa apagaria a contagem; ao chegar a 5, `INVALIDATED`.
- **Segurança do código**: nunca aparece em resposta, auditoria, histórico, log nem `toString` (DTO com `[REDACTED]`; `LogRedactionIT` ganha caso). HMAC (não SHA-256
  puro) porque 10⁶ possibilidades se quebram offline em milissegundos se o banco vazar; com segredo fora do banco isso não ocorre.
- **Cancelar**: `DELETE .../email-change` → `CANCELED`, código inválido. O **usuário** não confirma nem cancela (não há endpoint dele).
- **Limite de envio** por usuário: `PerKeyRateLimiter` "admin-mail" (3 por hora por usuário alvo).
- **Alternativas rejeitadas**: link no novo endereço (spec proíbe: terceiro que clique vira dono); código mais longo (a spec fixa 6 dígitos).

## D16. Convites (7 dias)

- **Decisão**: tabela `invitations` (`email` em claro **somente** enquanto `PENDING`, `email_ref` sempre, `token_hash` SHA-256 do token aleatório de 256 bits,
  `status` `PENDING|ACCEPTED|CANCELED|EXPIRED`, `expires_at = created_at + 7 dias`, `invited_by` FK `SET NULL`). `CHECK ((status='PENDING') = (email IS NOT NULL))`:
  cancelado, expirado ou aceito guarda apenas `email_ref`. Índice único parcial em `lower(email) WHERE status='PENDING'` (um convite pendente por
  endereço; reconvidar enquanto pendente = reenviar).
- **Endpoints públicos**: `GET /auth/invitations/{token}` (mostra e-mail e validade ou `410 INVITATION_EXPIRED`) e `POST /auth/invitations/{token}/accept {password}`
  (cria o usuário pelo mesmo caminho do cadastro, ignorando "cadastros fechados", **respeitando a manutenção** — FR-058d). Reenviar gera token novo e
  invalida o anterior; cancelar limpa o e-mail.
- **Consumo pelo cadastro próprio**: `RegistrationService.register` marca como `ACCEPTED` o convite pendente do mesmo e-mail (se houver).
- **Expiração**: `InvitationExpiryJob` (a cada hora) muda `PENDING` vencido para `EXPIRED` e zera o e-mail; o aceite também confere `expires_at` (não depende do job).
- **Auditoria**: `INVITATION_CREATED/RESENT/CANCELED` com `emailRef` (convidado sem conta nunca em claro, FR-039-2).
- **Alternativas rejeitadas**: criar o usuário "inativo" no convite (a spec diz que o convite não cria conta nem senha); reaproveitar `password_reset_tokens`.

## D17. Modo de manutenção e parâmetros globais

- **Armazenamento**: `system_parameters(key, value, updated_at, updated_by)` com chave em `CHECK` (`SIGNUPS_OPEN`, `MAINTENANCE_ENABLED`, `MAINTENANCE_MESSAGE`);
  linhas por parâmetro porque a spec pede "quem alterou por último e quando" **por parâmetro**. `SystemParameterService` mantém um *snapshot* em memória
  (recarregado após escrita local e a cada 5 s) para o filtro não consultar o banco em toda requisição. Linha ausente (por exemplo após o `TRUNCATE` dos
  testes) cai nos padrões (`true`, `false`, vazio).
- **Pontos de aplicação** (`MaintenanceGuard`):
  - `MaintenanceFilter` (depois do `JwtAuthenticationFilter`): principal autenticado com papel `USER` → `503 MAINTENANCE` + `Retry-After: 60` + mensagem. Libera:
    `OPTIONS`, `/actuator/health/**`, `/system/status`, `/auth/password-reset/**`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/admin/**` (a regra do papel decide).
  - serviços (porque login/refresh/registro/convite/cancelamento chegam **sem** principal): `AuthService.login` (depois de conferir credenciais e papel),
    `AuthService.refresh`, `RegistrationService`, `InvitationService.accept` e `AccountDeletionService.cancel` chamam `MaintenanceGuard.assertUserAllowed(role)`.
    Administradores e raiz passam sempre.
  - **Redefinição de senha continua** (`/auth/password-reset/*` fora do bloqueio) e **jobs continuam** (não passam por HTTP).
- **Cadastros fechados**: `RegistrationService.register` → `403 SIGNUPS_CLOSED`; o aceite de convite ignora esse parâmetro.
- **Cliente**: `GET /system/status` (público, sem dado sensível: `maintenance`, `message`, `signupsOpen`) alimenta o aviso das telas de entrada. No
  `auth.interceptor.ts` compartilhado: (a) `503` com `code=MAINTENANCE` abre o aviso (web: rota pública `/maintenance`; app: faixa de manutenção) e **não** é erro de sessão;
  (b) falha de **renovação** com `503 MAINTENANCE` **não** chama `session.expire()` (hoje qualquer falha de renovação desloga, o que no app descartaria a sessão); o
  `sync-engine` já trata `>= 500` como temporário, então a fila **fica no aparelho** e é reenviada depois (acrescenta-se um teste para `503 MAINTENANCE` com atraso
  maior, respeitando `Retry-After`). Leituras com cópia local respondem pela cópia, como offline.
- **Alternativas rejeitadas**: bloquear no proxy (não distingue administrador); um único registro JSON de parâmetros (sem autoria por parâmetro);
  checar o banco em toda requisição (carga desnecessária); responder `401` na manutenção (dispararia o fluxo de renovação e o descarte de sessão).

## D18. Limite de taxa das ações do painel e reautenticação

- **Padrão do projeto**: limitadores em memória, instância única (`LoginAttemptLimiter`, `PasswordResetRateLimiter`). Extrai-se um `PerKeyRateLimiter`
  genérico (janela deslizante, `Clock` injetado, `clear()` para testes) e as três políticas passam a ser instâncias nomeadas; sem mudar o comportamento do que já existe.
- **Valores** (configuráveis em `app.admin.*`): ações mutantes do painel: **30 por minuto por administrador**; ações destrutivas (excluir, suspender, encerrar sessões,
  forçar redefinição, trocar e-mail, encerrar todas, conceder/retirar perfil): **10 por 15 minutos por administrador**; envios de e-mail por usuário-alvo: **3 por hora**
  (mesma política da redefinição). Excedido: `429` com `Retry-After`; métrica `gefinc.admin.ratelimited`. Implementado como `HandlerInterceptor` em `/admin/**` (anotação `@Destructive`).
- **Reautenticação (FR-035)**: o corpo da ação de risco traz `password`; `Reauthenticator.verify(admin, password)`: (1) `LoginAttemptLimiter.checkAllowed(email do admin, IP)`; (2) confere o
  hash BCrypt; (3) falha → `recordFailure`, `403 REAUTH_FAILED` (**403 e não 401**, para o interceptor não tentar renovar a sessão), auditoria `REFUSED` (`refusal_code=REAUTH_FAILED`); (4) a
  quinta falha em 15 min do mesmo administrador **revoga a sessão atual** (família do `sid`), e o cliente cai no login. Sucesso não zera o contador do login (não é login).
- **Alternativas rejeitadas**: 2FA (fora do escopo, spec); limitador no banco (carga e latência para um uso de poucos administradores); revogar todas as sessões do administrador
  na quinta falha (a spec diz "a sessão"; revogar a atual basta para cortar o atacante com a sessão roubada).

## D19. Paginação, busca e ordenação

- **Usuários**: `page`/`size` (padrão 25, máximo 100) com `totalElements` (milhares; contagem barata). Busca `q` ≤ 100 caracteres, tratada como **texto literal** (escapa `%`, `_`, `\`),
  sem diferenciar caixa nem acento: `unaccent(lower(email)) LIKE '%' || unaccent(lower(:q)) || '%'` (idem `name`). Habilita-se a extensão `unaccent` na migração (extensão *trusted*
  do PostgreSQL 16, instalável pelo dono do banco; a imagem `postgres:16` e `postgres:16-alpine` a trazem). Com 10 000 usuários a varredura é de milissegundos (SC-002); índice
  trigram só se medição pedir. Filtros: `ACTIVE` (nem suspenso nem exclusão pendente), `SUSPENDED`, `DELETION_PENDING`, `ADMIN` (papel). Ordenação: `createdAt`, `lastAccessAt` (+ desempate por `id`).
- **Auditoria e histórico de envios**: **paginação por cursor** (chave `(occurred_at, id)` codificada em Base64 opaco), `limit` até 100, sem `COUNT(*)` (a tabela cresce
  indefinidamente; contar seria cada vez mais lento — "permanece rápida com o passar dos anos"). Filtros por período, autor, tipo de ação, usuário-alvo e resultado usam os índices
  `(occurred_at DESC, id DESC)`, `(target_user_id, occurred_at DESC)`, `(actor_user_id, occurred_at DESC)`, `(action, occurred_at DESC)`.
- **Alternativas rejeitadas**: `OFFSET` na auditoria (degrada com o tempo); índice `pg_trgm` desde já (YAGNI); busca no cliente (proíbe carregar todos).

## D20. Estatísticas agregadas sem dados financeiros (exceção ao texto do Princípio III)

- **Decisão**: `UsageStatsRepository` é a **única** classe do módulo `admin` autorizada a tocar uma tabela financeira, e só com `COUNT(*) ... GROUP BY dia`:
  lançamentos criados por dia = `transaction_groups.created_at` (um "lançamento" = um grupo, uma compra parcelada conta uma vez). Totais por situação, ativos 7/30 dias
  (`last_access_at`) e novos cadastros por dia vêm de `users`. Períodos 7, 30 e 90 dias. Resultado em *record* `(date, count)`; nada com `user_id`, valor ou linha.
- **Guarda arquitetural**: `AdminModuleBoundaryTest` (sem biblioteca nova) lê os fontes de `admin/**` e falha se algum importar `..transaction..`, `..account..`,
  `..category..`, `..invoice..`, `..transfer..` ou `..dashboard..` fora de `UsageStatsRepository`, e se esse repositório contiver colunas fora de `created_at`.
- **Desempenho**: cache em memória de 60 s por período (a tela mostra "última leitura" e o botão Atualizar ignora o cache, FR-025); sem índice novo em
  `transaction_groups` (varredura do intervalo de 90 dias; se SC-007 estourar, índice `ix_groups_created_at`, decisão registrada como risco R5).
- **Emenda**: o texto do Princípio III ("toda consulta ... de `transactions` ... MUST ser filtrada pelo `user_id` do token") precisa abrir essa exceção explícita (Complexity Tracking).
- **Alternativas rejeitadas**: contador incrementado a cada escrita (acopla o caminho financeiro quente ao painel); `pg_class.reltuples` (aproximado e sem série diária).

## D21. Saúde da API e do banco

- **Decisão**: `GET /admin/system/health` (só administrador) chama `SystemHealthService`: aplicação = responde (UP), banco = `SELECT 1` com timeout de 2 s e
  captura de qualquer exceção → `DOWN` **sem mensagem** (nada de host, credencial ou stack). Versão: `BuildProperties` (adicionar o objetivo `build-info` ao
  `spring-boot-maven-plugin`) com *fallback* `desconhecida`; tempo no ar: `ManagementFactory.getRuntimeMXBean().getUptime()`. O endpoint público `/actuator/health`
  (usado pelo health check do Docker) permanece como está; nenhum outro endpoint do actuator é exposto.
- **SC-007**: teste derruba o `DataSource` (proxy que lança) e confere que o painel aponta o banco. Obs.: se o banco cai, a autenticação (que consulta `users`)
  também falha; a tela de saúde só é alcançável com o banco "meio vivo"; o indicador vale para degradação/latência e para o *probe* após reconexão. Registrado como limitação.
- **Alternativas rejeitadas**: expor `/actuator/health` com detalhes (vaza componentes); Prometheus (fora do escopo).

## D22. Aviso de exclusão para o usuário (web e app) e avisos de cancelamento

- **Onde entra**: a tela de entrada é **uma só**, em `packages/ui-shared` (`Login`), usada por web e app. O usuário com exclusão pendente **não tem sessão**; o aviso só
  pode ser mostrado depois de provar a identidade, ou seja, **ao fazer login com e-mail e senha corretos** (decisão **confirmada pelo usuário do produto**; a spec foi alinhada). Mostrar por e-mail
  digitado antes da senha vazaria a existência da conta e a situação dela. Decisão registrada como interpretação.
- **Contrato**: `POST /auth/login` com exclusão pendente responde `423 ACCOUNT_DELETION_PENDING` com `deletionDate`, `origin` (`USER`|`ADMIN`), `canCancel` (`origin == USER`),
  `reasonMessage` (só se `ADMIN`, a mensagem **fixada** na solicitação) e `supportHint`; conta suspensa → `403 ACCOUNT_SUSPENDED`. `Login` passa a exibir o prazo e o motivo, sem o
  botão "Cancelar a exclusão e entrar" quando `canCancel=false`. `POST /auth/account-deletion/cancel` repete a checagem no servidor.
- **Aviso de cancelamento (uma vez)**: `user_notices` (`kind=DELETION_CANCELED`, `delivered_at`, `dismissed_at`). Entrega: (a) login bem-sucedido → `GET /auth/me` devolve `notices[]` e marca
  `delivered_at` na leitura; o cliente mostra um aviso dispensável (`POST /auth/notices/{id}/dismiss` opcional, o "uma vez" já vale pela entrega); (b) se a conta continua sem acesso
  (suspensa, ou voltou a uma exclusão do próprio usuário), as respostas `403/423` do login trazem o aviso e o marcam como entregue. O texto é montado no servidor conforme o estado atual:
  *conta ativa* / *continua sem acesso, procure o suporte* / *sua solicitação continua para dd/mm*.
- **Acessibilidade**: `role="alert"` + ícone + texto; sem cor como único sinal; teste axe nos dois estados. App móvel: `Login` é o mesmo componente; só se acrescenta o tratamento de `503 MAINTENANCE` (D17).
- **Alternativas rejeitadas**: endpoint público por e-mail (enumeração); notificação push (fora do escopo); aviso apenas por e-mail (a spec pede também no app).

## D23. Shell e rotas do painel no web-app Angular

- **Decisão**: o painel vive em `apps/web-app/src/app/admin/` (**só web**, Princípio I: nada compartilhado com o mobile; tipos vêm de `core-models`). Rotas sob o `Shell` existente:
  `/admin` (visão geral), `/admin/users`, `/admin/users/:id`, `/admin/audit`, `/admin/email`, `/admin/invitations`, `/admin/deletion-reasons`, `/admin/settings`,
  carregadas sob demanda (`loadComponent`). `adminGuard` (`CanActivateFn`) consulta `GET /auth/me` (campo `admin`) e redireciona usuário comum para `/`; é só conforto, a barreira é do servidor.
- **Menu**: `Shell` ganha o grupo "Administração" (itens em `ADMIN_NAV_ITEMS`, **fora** de `NAV_ITEMS`, que é compartilhado com o app e tem teste que lista as áreas) renderizado apenas se
  `SessionService.isAdmin()`; ícones novos (`shield`, `users`, `audit`, `mail`, `ticket`, `sliders`) entram no catálogo `ICON_SET` de `ui-shared` (Aurora FinTech, SVG próprio, sem biblioteca).
  `AdminLayout` (rota-pai) renderiza o **alerta permanente** de comunicações pendentes (ícone + texto, `role="status"`, link para a lista) acima do `<router-outlet>`.
- **Interceptor**: `403` em `/admin/**` com sessão válida (perfil retirado) → recarrega `me`, navega para `/` e mostra aviso (edge case "retirar o perfil com o painel aberto"); `429` mostra o `Retry-After`.
- **Componentes**: tabelas semânticas (`<table>` com `<caption>`, `scope`), paginação acessível, diálogos de confirmação com o **efeito** escrito (reaproveita `confirm-dialog`), formulário de exclusão com o aviso de dados pessoais
  (FR-048), estados de carregamento/vazio/erro com `state-views`, foco gerenciado ao abrir diálogos, Esc fecha, teclado completo (SC-009). Textos pt-BR; datas no fuso America/Sao_Paulo.
- **Alternativas rejeitadas**: módulo/app Angular separado (build e deploy novos sem ganho); páginas em `ui-shared/pages` (o mobile as empacotaria sem usá-las); rotas fora do `Shell` (perderia menu lateral, requisito do FR-006).

## D24. Contratos OpenAPI

- **Decisão**: tudo vai para `packages/core-models/openapi/gefinc.openapi.yaml` (tag `Admin` para `/admin/**`, tag `System` para `/system/status`), com `api.ts` regenerado
  (`npx nx run core-models:generate`) e tipos exportados em `models.ts` (Princípio I). Mudanças em endpoints existentes são **aditivas** (campos opcionais, códigos de erro novos). Detalhe em `contracts/openapi-delta.md`.
- **Erros**: códigos novos em `ErrorCode` (`ACCOUNT_SUSPENDED`, `ADMIN_DECISION_LOCKED`, `MAINTENANCE`, `SIGNUPS_CLOSED`, `ROOT_PROTECTED`, `LAST_ADMIN`, `SELF_ACTION_FORBIDDEN`,
  `REAUTH_FAILED`, `INVALID_CONFIRMATION`, `MAIL_DELIVERY_FAILED`, `INVITATION_EXPIRED`, `DELETION_ALREADY_EXECUTED`, `ACCOUNT_NOT_USABLE`, `EMAIL_CHANGE_CODE_INVALID`,
  `REASON_NAME_TAKEN`, `LAST_ACTIVE_REASON`). Regra de status: negativas de regra de negócio do administrador em `409`/`403` (nunca `401`, que aciona a renovação de sessão no cliente).
- **Testes de contrato**: `ContractAssertions` (já existe) valida respostas do `/admin/**` contra o YAML (swagger-request-validator).

## D25. Migrações Flyway (próxima versão livre = V14)

- **Fato verificado**: `db/migration` vai de `V1` a `V13` (`V13__account_transfers.sql`); a branch de SMTP não adiciona migrações. Esta feature usa `V14`–`V20`, **uma por assunto**, imutáveis depois de mescladas:
  `V14` motivos e parâmetros (com sementes) · `V15` livro-razão de exclusões e avisos ao usuário · `V16` colunas e guardas de `users` (+ `unaccent`, preenchimento da exclusão legada) ·
  `V17` `auth_sessions` (+ preenchimento) · `V18` `audit_log` e `audit_log_client` (+ gatilhos) · `V19` `email_deliveries` e `pending_communications` · `V20` `invitations` e `pending_email_changes`.
- **Sem dependência de dados financeiros**; todas aditivas (nada é apagado ou renomeado). Rollback: nova migração, nunca editar (Princípio V).
- **Testes de migração** no padrão `AccountMigrationV7IT` (Flyway até a versão anterior, dados legados, migrar, verificar preenchimento e `CHECK`s): `AdminMigrationV16IT`
  (exclusão pendente legada ganha `due_at`/origem/livro-razão; papéis e gatilho) e `AdminMigrationV17IT` (sessões preenchidas).

## D26. Plano de testes (Princípio IV: testes antes)

- **Unitários** (JUnit): `PseudonymizerTest` (estável, domínios separados, não reversível por construção), `ClientIpResolverTest` (confiável × forjado, IPv6, valor inválido, sem DNS),
  `DeviceLabelResolverTest`, `AdminPolicyTest` (matriz de regras: raiz, último administrador, si mesmo), `DeletionPolicyTest` (prazo 1–30, só antecipar), `EmailCodeTest`, `GenericMessageValidatorTest`,
  `PerKeyRateLimiterTest`, `AuditDetailsTest`.
- **Integração** (Testcontainers `postgres:16` + GreenMail): ver a lista por história em `plan.md` ("Plano de testes"); inclui os ITs de **isolamento** (SC-004), **migração**, **imutabilidade**,
  **concorrência** (`LastAdminConcurrencyIT` com duas transações simultâneas), **anonimização** (SC-011), **retenção** (SC-021 com relógio controlável `MutableClock`) e **enumeração de rotas** (`AdminAccessIT`).
- **Front** (Jest): guards, serviços de API do painel, páginas, `Login` com aviso de exclusão administrativa e de manutenção, interceptor (503/403).
- **E2E Playwright** (web): uma suíte por história + `admin-accessibility.spec.ts` (axe nas telas do painel, navegação só por teclado, SC-009); E2E mobile: aviso de exclusão e manutenção com fila offline preservada.
  O raiz dos E2E é criado com o mesmo comando do roteiro (D3).

## D27. Tarefas agendadas

| Job | Cadência | Função | Idempotência |
|---|---|---|---|
| `AccountDeletionJob` | 5 min | executa exclusões vencidas (D8) | trava `SKIP LOCKED` + re-checagem do estado |
| `PendingCommunicationJob` | 1 h | expira pendências com `retained_until` vencido e apaga o endereço retido | predicado por data |
| `InvitationExpiryJob` | 1 h | `PENDING` vencido → `EXPIRED`, zera o e-mail | predicado |
| `EmailDeliveryPurgeJob` | diário 03:10 | apaga envios > 90 dias | predicado |
| `AuditClientPurgeJob` | diário 03:20 | apaga IP/dispositivo de **visitantes** > 90 dias (FR-062); métrica de contagem, sem log por linha | predicado por idade; recupera atraso sozinho |
| `AuthSessionPurgeJob` | diário 03:30 | apaga sessões revogadas/expiradas > 30 dias | predicado |

Todas continuam em manutenção (não passam por HTTP). Instância única (como os limitadores); se houver várias, o `FOR UPDATE SKIP LOCKED` nas partes críticas evita duplicidade.

## D28. Privacidade: aviso ao usuário sobre IP e dispositivo (FR-061)

- **Decisão**: página pública `PrivacyNoticePage` (rota `/privacidade` no web; link no rodapé de login/cadastro e em Minha conta) com o texto: dados coletados (IP, tipo de dispositivo/navegador),
  finalidade (segurança e suporte), quem vê (administradores) e os **dois prazos** (usuários: anonimizado na exclusão da conta; visitantes sem conta: 90 dias). O texto vive em
  `ui-shared` (o app também o abre). Sem política jurídica completa (fora da spec); o conteúdo é validado pelo dono do produto antes do lançamento (risco R7).

## D29. Concorrência e travas

- **Último administrador (FR-005)**: toda operação que muda o conjunto de administradores ativos (rebaixar, suspender, excluir/antecipar, exclusão pelo autoatendimento, conceder) executa
  `pg_advisory_xact_lock(hashtext('gefinc.admin-set'))` no início e, depois, conta administradores ativos (`role IN ('ADMIN','ROOT')`, não suspensos, sem exclusão pendente) **excluindo o alvo**;
  se der zero, recusa `LAST_ADMIN`. Duas operações simultâneas se serializam; a segunda reavalia e é recusada. `LastAdminConcurrencyIT` dispara as duas em threads com barreira.
- **Mesma conta, dois administradores**: toda ação mutante sobre um usuário faz `SELECT ... FOR UPDATE` da linha (`UserRepository.findForUpdate`); "a última prevalece, nenhuma se perde da auditoria".
- **Exclusão × cancelamento** e **job × cancelamento**: mesma trava de linha (D8); cancelar após `EXECUTED` → `409 DELETION_ALREADY_EXECUTED` auditado.
- **Motivos**: "pelo menos um ativo" (`deletion_reasons`): trava consultiva `gefinc.deletion-reasons` ao desativar.

## D30. Logs e dados pessoais

- Todos os DTOs novos seguem o padrão `toString() -> [REDACTED]`. `LogRedactionIT` é ampliado: com o app em TRACE, executa uma troca de e-mail, um convite e uma exclusão e confere que
  e-mail, código, link, token, IP e justificativa **não** aparecem nos logs. O log de segurança dos acessos negados é agregado (contagem por minuto, sem IP).

## D31. Fluxos de usuário comum que mudam (regressão)

- Cadastro (`POST /auth/register`): `SIGNUPS_CLOSED`/`MAINTENANCE`; consome convite pendente.
- Login: suspensão, exclusão com origem, manutenção; cria `auth_sessions`; devolve `sid`.
- Renovação: atualiza `last_used_at`/`last_access_at`; recusa conta suspensa; respeita manutenção.
- Exclusão da própria conta: grava livro-razão; recusa raiz e último administrador.
- Cancelar exclusão: recusa origem `ADMIN`.
- Redefinição de senha: continua; listener registra o envio.
- `GET /auth/me`: campos `admin` e `notices`.
  Cada item tem teste de regressão no conjunto existente (`AuthRegistrationLoginIT`, `AccountDeletionIT`, `RefreshTokenIT`, `PasswordResetIT`, `LoginThrottlingIT` são ajustados, não reescritos).

## D32. Parâmetros fixados no plano

| Parâmetro | Valor | Onde |
|---|---|---|
| Página de usuários | 25 (máx. 100) | `app.admin.page-size` |
| Busca | ≤ 100 caracteres | validação |
| Períodos de estatística | 7, 30, 90 dias | `days` |
| Cursor de auditoria/envios | `limit` 50 (máx. 100) | |
| Janela de deduplicação | 15 min fixos | constante |
| Tentativas do código de e-mail | 5; validade 15 min | constante |
| Convite | 7 dias | `app.admin.invitation-ttl` |
| Reautenticação: falhas até revogar a sessão | 5 em 15 min | `app.admin.reauth-max-failures` |
| Limites do painel | 30/min mutantes; 10/15 min destrutivas | `app.admin.rate.*` |
| Envios de e-mail por usuário-alvo | 3/hora | `PerKeyRateLimiter` |
| Retenção do histórico de envios | 90 dias | job |
| IP de visitante em claro | 90 dias (tolerância 1 dia) | job |
| Endereço retido em pendência | 30 dias após a remoção | job |
| Sessões revogadas guardadas | 30 dias | job |
| Cache de estatísticas | 60 s | serviço |
| Snapshot de parâmetros | 5 s | serviço |
| Tamanhos | justificativa 1000; motivo de suspensão 500; nome do motivo 80; mensagem genérica 500; mensagem de manutenção 280 | validação + `VARCHAR` |
| Carência máxima do administrador | 30 dias (= autoatendimento) | `app.deletion.grace-days` |

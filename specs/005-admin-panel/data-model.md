# Data Model: Painel administrativo

As entidades financeiras (lançamentos, faturas, contas, categorias, transferências) **não mudam** (ver
`specs/001-personal-finance-management/data-model.md` e `specs/004-account-transfers/data-model.md`). Esta feature altera **uma tabela**
(`users`, migração `V16`) e acrescenta **11 tabelas administrativas** (migrações `V14` a `V20`). Nenhuma delas guarda dado financeiro.
Convenções: `TIMESTAMPTZ` em UTC; identificadores `BIGINT GENERATED ALWAYS AS IDENTITY`; enumerações sempre com `CHECK` no banco (Princípio V).

## Visão das migrações

| Migração | Conteúdo |
|---|---|
| `V14__admin_system_parameters_and_deletion_reasons.sql` | `system_parameters`, `deletion_reasons` (+ sementes) |
| `V15__account_deletion_requests_and_user_notices.sql` | `account_deletion_requests`, `user_notices` |
| `V16__users_admin_columns_and_guards.sql` | colunas novas em `users`, `CHECK`s, gatilho do raiz, `unaccent`, preenchimento da exclusão legada |
| `V17__auth_sessions.sql` | `auth_sessions` (+ preenchimento a partir de `refresh_tokens`) |
| `V18__audit_log.sql` | `audit_log`, `audit_log_client`, gatilhos de imutabilidade |
| `V19__email_deliveries_and_pending_communications.sql` | `email_deliveries`, `pending_communications` |
| `V20__invitations_and_pending_email_changes.sql` | `invitations`, `pending_email_changes` |

Todas aditivas e imutáveis depois de mescladas. Sem preenchimento retroativo de auditoria, histórico de envios ou convites (nascem vazias), exceto o que está
indicado em `V16` e `V17`.

## `users` (colunas novas, `V16`)

| Coluna | Tipo | Regras |
|---|---|---|
| `role` | `VARCHAR(5) NOT NULL DEFAULT 'USER'` | `ck_users_role`: `IN ('USER','ADMIN','ROOT')`; `ROOT` só pelo roteiro do dono da implantação (gatilho) |
| `suspended_at` | `TIMESTAMPTZ` anulável | suspensa ⇔ não nulo; independente da exclusão pendente |
| `last_access_at` | `TIMESTAMPTZ` anulável | último login/renovação; ordenação e "ativos em 7/30 dias" |
| `deletion_due_at` | `TIMESTAMPTZ` anulável | momento da execução (imediata: igual ao pedido); preenchido com `deletion_requested_at + 30 dias` nas pendentes legadas |
| `deletion_origin` | `VARCHAR(5)` anulável | `ck_users_deletion_origin`: `IN ('USER','ADMIN')` |
| `deletion_request_id` | `BIGINT` anulável | `REFERENCES account_deletion_requests (id)` |

Regras no banco:

- `ck_users_deletion_consistent`: ou as quatro colunas de exclusão (`deletion_requested_at`, `deletion_due_at`, `deletion_origin`, `deletion_request_id`)
  são todas nulas, ou todas não nulas; e `deletion_due_at >= deletion_requested_at`.
- `ck_users_root_active`: `role <> 'ROOT' OR (suspended_at IS NULL AND deletion_requested_at IS NULL)` (o raiz nunca fica suspenso nem em exclusão pelo painel).
- Gatilho `trg_users_root_guard` (`BEFORE INSERT OR UPDATE OF role OR DELETE`): criar, alterar ou apagar uma linha com papel `ROOT` (ou que passe a sê-lo) lança
  `42501` salvo se `current_setting('gefinc.allow_root_change', true) = 'on'` na transação.
- `CREATE EXTENSION IF NOT EXISTS unaccent`.
- Índices: `ix_users_deletion_due (deletion_due_at) WHERE deletion_due_at IS NOT NULL` (job); `ix_users_role (role) WHERE role <> 'USER'` (administradores);
  `ix_users_created (created_at DESC, id DESC)` e `ix_users_last_access (last_access_at DESC NULLS LAST, id DESC)` (ordenação da lista).
- O índice atual `ix_users_deletion_requested_at` permanece (migrações são imutáveis).

**Situação derivada** (nunca gravada): `SUSPENDED` se `suspended_at IS NOT NULL`; `DELETION_PENDING` se `deletion_requested_at IS NOT NULL`; senão `ACTIVE`.
Os dois primeiros combinam (a API devolve os dois sinalizadores). `ADMIN` é o filtro por papel (`role IN ('ADMIN','ROOT')`).

Administrador **ativo** = papel `ADMIN`/`ROOT`, `suspended_at IS NULL`, `deletion_requested_at IS NULL` (base da regra "nunca sem administrador", FR-005).

## `system_parameters` (nova, `V14`)

| Coluna | Tipo | Regras |
|---|---|---|
| `key` | `VARCHAR(30) PRIMARY KEY` | `CHECK (key IN ('SIGNUPS_OPEN','MAINTENANCE_ENABLED','MAINTENANCE_MESSAGE'))` |
| `value` | `VARCHAR(500) NOT NULL` | booleanos como `'true'/'false'`; `ck_sp_bool` para as duas chaves booleanas; mensagem ≤ 280 (serviço) |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |
| `updated_by` | `BIGINT` anulável | `REFERENCES users (id) ON DELETE SET NULL`; a tela mostra "administrador excluído" quando nulo |

Sementes: `SIGNUPS_OPEN='true'`, `MAINTENANCE_ENABLED='false'`, `MAINTENANCE_MESSAGE=''`. Parâmetros somente leitura (validade de sessões, limites de login,
carência) **não** são linhas: vêm de `AppProperties`/constantes e a API os devolve marcados `editable=false` (FR-031). Linha ausente = valor padrão (resiliência a `TRUNCATE` em testes).

## `deletion_reasons` (nova, `V14`)

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `BIGINT` identidade | PK |
| `name` | `VARCHAR(80) NOT NULL` | único sem diferenciar caixa: `ux_dr_name (lower(name))` |
| `message` | `VARCHAR(500) NOT NULL` | mensagem genérica mostrada ao usuário |
| `active` | `BOOLEAN NOT NULL DEFAULT true` | |
| `initial` | `BOOLEAN NOT NULL DEFAULT false` | `true` nos quatro iniciais |
| `created_at`, `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

Sementes (`initial=true`, `active=true`): *Solicitação do titular dos dados*, *Violação dos termos de uso*, *Determinação legal ou de autoridade*,
*Outros motivos administrativos*, cada uma com mensagem genérica em pt-BR. Nunca há `DELETE` (nem endpoint, nem repositório com `delete`); a FK do livro-razão
impede apagar um motivo usado. "Ao menos um ativo" é regra de serviço com trava consultiva (D29).
Validação da mensagem (serviço, `GenericMessageValidator`): recusa e-mail, sequências de ≥ 8 dígitos (documento/telefone), marcadores de substituição (`{{`, `${`, `%s`, `{nome}`) e URL; é uma
heurística e não detecta nomes próprios (limite documentado).

## `account_deletion_requests` (nova, `V15`) — livro-razão das exclusões

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `BIGINT` identidade | PK |
| `user_id` | `BIGINT NOT NULL` | **sem FK** (sobrevive à exclusão, D9) |
| `target_ref` | `VARCHAR(32) NOT NULL` | HMAC do id do usuário (rótulo anônimo) |
| `origin` | `VARCHAR(5) NOT NULL` | `IN ('USER','ADMIN')` |
| `mode` | `VARCHAR(9) NOT NULL` | `IN ('IMMEDIATE','GRACE')` |
| `grace_days` | `SMALLINT` anulável | `GRACE`: 1–30; `IMMEDIATE`: nulo; `ck_adr_days` |
| `requested_at` | `TIMESTAMPTZ NOT NULL` | |
| `due_at` | `TIMESTAMPTZ NOT NULL` | execução; imediata = `requested_at` |
| `requested_by` | `BIGINT` anulável | id do administrador (sem FK); nulo se `origin='USER'` |
| `reason_id` | `BIGINT` anulável | `REFERENCES deletion_reasons (id)`; obrigatório se `origin='ADMIN'` |
| `reason_name`, `reason_message` | `VARCHAR(80)`, `VARCHAR(500)` anuláveis | **fixados** na solicitação (FR-046); obrigatórios se `ADMIN` |
| `supersedes_id` | `BIGINT` anulável | `REFERENCES account_deletion_requests (id)`: a solicitação do usuário que esta antecipou |
| `status` | `VARCHAR(10) NOT NULL` | `IN ('SCHEDULED','CANCELED','SUPERSEDED','EXECUTED')` |
| `notice_state` | `VARCHAR(14) NOT NULL` | `IN ('NOT_APPLICABLE','QUEUED','SENT','PENDING','DISCARDED','EXPIRED')` |
| `canceled_at`, `canceled_by`, `executed_at` | `TIMESTAMPTZ`/`BIGINT`/`TIMESTAMPTZ` anuláveis | |

Restrições: `ck_adr_admin_reason` (`origin='ADMIN'` ⇒ `reason_id`, `reason_name`, `reason_message` não nulos e `requested_by` não nulo); `ck_adr_user_mode` (`origin='USER'` ⇒
`mode='GRACE'`, `grace_days=30`, `notice_state='NOT_APPLICABLE'`); índice único parcial `ux_adr_active (user_id) WHERE status = 'SCHEDULED'` (no máximo uma solicitação ativa por usuário);
`ix_adr_user (user_id, requested_at DESC)`. **A justificativa em texto livre não é guardada aqui**: vai só para `audit_log.reason_text` (FR-037).

### Máquina de estados

```text
          pedido (USER ou ADMIN)
                  │
            ┌─────▼─────┐   admin antecipa    ┌────────────┐
            │ SCHEDULED │────────────────────▶│ SUPERSEDED │◀──────────────┐
            └─┬───┬───┬─┘  (cria nova ADMIN)  └─────▲──────┘               │
   cancelar   │   │   │ due_at <= now()             │ admin cancela a      │
   (admin;    │   │   ▼                              │ antecipação          │
   ou usuário │   │ ┌──────────┐                     │ (a anterior volta    │
   se USER)   │   │ │ EXECUTED │  (terminal)         │  a SCHEDULED)        │
              ▼   │ └──────────┘                     │                      │
        ┌──────────┐                                 └──────────────────────┘
        │ CANCELED │ (terminal)
        └──────────┘
```

Transições válidas: `SCHEDULED → CANCELED` (administrador; usuário apenas se `origin='USER'`), `SCHEDULED → SUPERSEDED` (antecipação), `SCHEDULED → EXECUTED` (job),
`SUPERSEDED → SCHEDULED` (cancelamento da antecipação). `EXECUTED` e `CANCELED` são terminais. Cancelar um `EXECUTED` é recusado (`DELETION_ALREADY_EXECUTED`).

`notice_state`: `QUEUED` (admin, ainda sem tentativa) → `SENT` ou `PENDING` (falhou); `PENDING → SENT` (reenvio ok) | `DISCARDED` (administrador) | `EXPIRED` (30 dias após a remoção).

## `user_notices` (nova, `V15`)

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `BIGINT` identidade | PK |
| `user_id` | `BIGINT NOT NULL` | `REFERENCES users (id) ON DELETE CASCADE` |
| `kind` | `VARCHAR(20) NOT NULL` | `CHECK (kind IN ('DELETION_CANCELED'))` (extensível por migração futura) |
| `deletion_request_id` | `BIGINT NOT NULL` | `REFERENCES account_deletion_requests (id)` |
| `created_at`, `delivered_at`, `dismissed_at` | `TIMESTAMPTZ` | `delivered_at` marcado ao entregar (a entrega já é o "uma vez") |

Índice `ix_un_user_open (user_id) WHERE delivered_at IS NULL`. O texto é montado no servidor com o estado atual (conta ativa / continua sem acesso / solicitação continua para dd/mm) e a
mensagem fixada; **nunca** a justificativa livre.

## `auth_sessions` (nova, `V17`)

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `UUID PRIMARY KEY` | = `refresh_tokens.family_id`; vai na claim `sid` |
| `user_id` | `BIGINT NOT NULL` | `REFERENCES users (id) ON DELETE CASCADE` (IP e dispositivo somem com o usuário) |
| `created_at` | `TIMESTAMPTZ NOT NULL` | início |
| `last_used_at` | `TIMESTAMPTZ NOT NULL` | última renovação |
| `expires_at` | `TIMESTAMPTZ NOT NULL` | do último token de renovação |
| `client_ip` | `VARCHAR(45)` anulável | dado pessoal (FR-061); nulo em sessões anteriores à feature |
| `device_label` | `VARCHAR(80)` anulável | rótulo grosseiro, nunca o `User-Agent` bruto |
| `client_kind` | `VARCHAR(6) NOT NULL DEFAULT 'OTHER'` | `IN ('WEB','MOBILE','OTHER')` (`X-Client`) |
| `revoked_at` | `TIMESTAMPTZ` anulável | |
| `revoked_by` | `VARCHAR(6)` anulável | `IN ('USER','ADMIN','SYSTEM')` |

Sessão **aberta** = `revoked_at IS NULL AND expires_at > now()`. Índice `ix_as_user_open (user_id, created_at DESC) WHERE revoked_at IS NULL`. Preenchimento em `V17`: uma linha por `family_id` de `refresh_tokens`
(`created_at = min`, `last_used_at = max(created_at)`, `expires_at = max(expires_at)`, revogada se todos os tokens da família estão revogados).

## `audit_log` (nova, `V18`) — imutável

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `BIGINT` identidade | PK; ordem estável com `occurred_at` |
| `occurred_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |
| `action` | `VARCHAR(32) NOT NULL` | `ck_al_action` com o catálogo abaixo |
| `result` | `VARCHAR(7) NOT NULL` | `IN ('SUCCESS','REFUSED','FAILED')` |
| `actor_kind` | `VARCHAR(7) NOT NULL` | `IN ('ADMIN','USER','VISITOR','SYSTEM')` |
| `actor_user_id` | `BIGINT` anulável | sem FK; nulo para visitante e sistema |
| `target_user_id` | `BIGINT` anulável | sem FK |
| `subject` | `VARCHAR(60)` anulável | alvo não-usuário: chave do parâmetro, id do motivo/convite/comunicação, rota negada |
| `reason_text` | `VARCHAR(1000)` anulável | motivo/justificativa informados pelo administrador (**mantido** após a exclusão do alvo, FR-039) |
| `refusal_code` | `VARCHAR(32)` anulável | `ROOT_PROTECTED`, `LAST_ADMIN`, `SELF_ACTION`, `REAUTH_FAILED`, `ADMIN_DECISION_LOCKED`... |
| `details` | `JSONB NOT NULL DEFAULT '{}'` | só chaves do `enum` `AuditKey`; valores escalares curtos; **nunca** senha, token, link, código, e-mail, nome, IP, valor monetário |
| `client_ref` | `VARCHAR(32)` anulável | HMAC do IP (correlação sem expor o IP) |
| `dedupe_key` | `VARCHAR(32)` anulável | HMAC de `ator|IP|alvo|tipo` (só nas tentativas de FR-053) |
| `request_id` | `VARCHAR(40)` anulável | `X-Request-Id` (correlação com logs) |

**Catálogo `action`**: `USER_DETAIL_OPENED`, `USER_SUSPENDED`, `USER_REACTIVATED`, `LOGIN_LOCK_CLEARED`, `SESSION_REVOKED`, `SESSIONS_REVOKED_ALL`, `SYSTEM_SESSIONS_REVOKED`,
`PASSWORD_RESET_SENT`, `PASSWORD_RESET_FORCED`, `USER_RENAMED`, `EMAIL_CHANGE_REQUESTED`, `EMAIL_CHANGE_CONFIRMED`, `EMAIL_CHANGE_FAILED`, `EMAIL_CHANGE_CANCELED`, `ROLE_GRANTED`, `ROLE_REVOKED`,
`DELETION_REQUESTED`, `DELETION_ANTICIPATED`, `DELETION_CANCELED`, `ACCOUNT_ERASED`, `COMMUNICATION_RESENT`, `COMMUNICATION_DISCARDED`, `EMAIL_TEST_SENT`, `INVITATION_CREATED`,
`INVITATION_RESENT`, `INVITATION_CANCELED`, `REASON_CREATED`, `REASON_UPDATED`, `REASON_DEACTIVATED`, `REASON_ACTIVATED`, `PARAMETER_CHANGED`, `ACCESS_DENIED`, `REVERT_ATTEMPT`.

Índices: `ix_al_time (occurred_at DESC, id DESC)`; `ix_al_target (target_user_id, occurred_at DESC)`; `ix_al_actor (actor_user_id, occurred_at DESC)`; `ix_al_action (action, occurred_at DESC)`;
`ix_al_dedupe (dedupe_key, occurred_at DESC) WHERE dedupe_key IS NOT NULL`.

Imutabilidade: `trg_al_immutable` (`BEFORE UPDATE OR DELETE`, por linha) e `trg_al_no_truncate` (`BEFORE TRUNCATE`, por instrução) levantam exceção `restrict_violation`. A API nunca devolve e-mail/nome
gravados: resolve por junção com `users` na leitura, ou o rótulo `anônimo-<8 hex>` (HMAC do id) quando a linha de `users` não existe mais.

## `audit_log_client` (nova, `V18`) — o dado pessoal descartável

| Coluna | Tipo | Regras |
|---|---|---|
| `audit_id` | `BIGINT PRIMARY KEY` | `REFERENCES audit_log (id)` |
| `user_id` | `BIGINT` anulável | `REFERENCES users (id) ON DELETE CASCADE`; nulo = visitante não autenticado |
| `ip` | `VARCHAR(45) NOT NULL` | IP real (D12) |
| `device_label` | `VARCHAR(80)` anulável | |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

Só nas tentativas de `ACCESS_DENIED` e `REVERT_ATTEMPT` (e recusas de reautenticação). Excluir o usuário apaga as linhas por cascata; `AuditClientPurgeJob` apaga as de visitantes com mais de 90 dias
(`user_id IS NULL AND created_at < now() - interval '90 days'`). Índice `ix_alc_visitor (created_at) WHERE user_id IS NULL`.

## `email_deliveries` (nova, `V19`) — histórico de envios (90 dias)

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `BIGINT` identidade | PK |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |
| `kind` | `VARCHAR(24) NOT NULL` | `IN ('PASSWORD_RESET','TEST','INVITATION','DELETION_NOTICE','CANCELLATION_NOTICE','EMAIL_CHANGE_CODE','EMAIL_CHANGE_NOTICE')` |
| `recipient_email` | `VARCHAR(254)` anulável | em claro **durante a retenção**; zerado quando o usuário é excluído |
| `recipient_ref` | `VARCHAR(32) NOT NULL` | HMAC do endereço |
| `user_id` | `BIGINT` anulável | sem FK |
| `status` | `VARCHAR(6) NOT NULL` | `IN ('SENT','FAILED')` |
| `failure_reason` | `VARCHAR(20)` anulável | `IN ('AUTHENTICATION','PERMANENT_REJECTION','TRANSIENT_EXHAUSTED','TIMEOUT','NOT_CONFIGURED','OTHER')`; `ck_ed_failure`: não nulo ⇔ `FAILED` |
| `attempts` | `SMALLINT NOT NULL DEFAULT 1` | |

Índices: `ix_ed_time (created_at DESC, id DESC)`; `ix_ed_status_kind (status, kind, created_at DESC)`; `ix_ed_user (user_id, created_at DESC)`. **Nunca**: corpo, assunto, link, token, código, mensagem técnica do servidor.

## `pending_communications` (nova, `V19`)

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `BIGINT` identidade | PK |
| `kind` | `VARCHAR(19) NOT NULL` | `IN ('DELETION_NOTICE','CANCELLATION_NOTICE')` |
| `deletion_request_id` | `BIGINT NOT NULL` | `REFERENCES account_deletion_requests (id)` |
| `user_id` | `BIGINT NOT NULL` | sem FK |
| `target_ref` | `VARCHAR(32) NOT NULL` | rótulo anônimo |
| `state` | `VARCHAR(9) NOT NULL` | `IN ('PENDING','DELIVERED','DISCARDED','EXPIRED')` |
| `failure_reason` | `VARCHAR(20)` | mesmo domínio de `email_deliveries` |
| `attempts` | `SMALLINT NOT NULL DEFAULT 1` | |
| `retained_email` | `VARCHAR(254)` anulável | **única** retenção do endereço de conta removida (FR-057); nunca exibido |
| `retained_until` | `TIMESTAMPTZ` anulável | remoção + 30 dias |
| `created_at`, `resolved_at` | `TIMESTAMPTZ` | |

`ck_pc_retained`: `retained_email IS NULL OR (state = 'PENDING' AND retained_until IS NOT NULL)`. Índice `ix_pc_pending (created_at) WHERE state = 'PENDING'` (alerta e lista).
Máquina: `PENDING → DELIVERED | DISCARDED | EXPIRED`; todo estado final zera `retained_email`.

## `invitations` (nova, `V20`)

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `BIGINT` identidade | PK |
| `email` | `VARCHAR(254)` anulável | em claro **somente** se `PENDING` |
| `email_ref` | `VARCHAR(32) NOT NULL` | HMAC do e-mail normalizado |
| `token_hash` | `VARCHAR(64) NOT NULL UNIQUE` | SHA-256 do token (o token em si só vai no e-mail) |
| `status` | `VARCHAR(8) NOT NULL` | `IN ('PENDING','ACCEPTED','CANCELED','EXPIRED')` |
| `expires_at` | `TIMESTAMPTZ NOT NULL` | `created_at + 7 dias` |
| `invited_by` | `BIGINT` anulável | `REFERENCES users (id) ON DELETE SET NULL` |
| `accepted_user_id` | `BIGINT` anulável | sem FK |
| `created_at`, `resolved_at` | `TIMESTAMPTZ` | |

`ck_inv_email`: `(status = 'PENDING') = (email IS NOT NULL)`. Índice único parcial `ux_inv_pending_email (lower(email)) WHERE status = 'PENDING'`; `ix_inv_status (status, created_at DESC)`.
Máquina: `PENDING → ACCEPTED` (aceite, ou cadastro próprio do mesmo e-mail) | `CANCELED` | `EXPIRED`; reenviar troca `token_hash` e `expires_at` (o link anterior deixa de valer).

## `pending_email_changes` (nova, `V20`)

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `BIGINT` identidade | PK (entra no HMAC do código) |
| `user_id` | `BIGINT NOT NULL` | `REFERENCES users (id) ON DELETE CASCADE` |
| `requested_by` | `BIGINT` anulável | `REFERENCES users (id) ON DELETE SET NULL` |
| `new_email` | `VARCHAR(254)` anulável | em claro só enquanto `PENDING` |
| `new_email_ref` | `VARCHAR(32) NOT NULL` | |
| `code_hash` | `VARCHAR(64)` anulável | HMAC do código; nulo fora de `PENDING` |
| `attempts` | `SMALLINT NOT NULL DEFAULT 0` | `CHECK (attempts BETWEEN 0 AND 5)` |
| `status` | `VARCHAR(11) NOT NULL` | `IN ('PENDING','CONFIRMED','CANCELED','EXPIRED','INVALIDATED')` |
| `created_at`, `expires_at`, `resolved_at` | `TIMESTAMPTZ` | validade 15 min |

`ck_pec_pending`: `status <> 'PENDING' OR (new_email IS NOT NULL AND code_hash IS NOT NULL)`; índice único parcial `ux_pec_user_pending (user_id) WHERE status = 'PENDING'` (no máximo uma por usuário).
Máquina: `PENDING → CONFIRMED | CANCELED | EXPIRED | INVALIDATED` (novo pedido ou 5 erros). Ao sair de `PENDING`, `new_email` e `code_hash` são zerados.

## Esquemas e objetos derivados (não são tabelas)

- **Janela de deduplicação** (FR-053): consulta em `audit_log` por `dedupe_key` (D11); contador Micrometer fora do banco.
- **Estatísticas** (`UsageStatsRepository`): `COUNT(*)` por situação e por dia em `users` e `transaction_groups.created_at`; nada por usuário (D20).
- **Parâmetros somente leitura**: derivados de `AppProperties` e constantes (`LoginAttemptLimiter.EMAIL_LIMIT/IP_LIMIT/WINDOW`, `refresh-token-ttl`, `access-token-ttl`, `app.deletion.grace-days`).

## Regras de negócio no serviço (testadas com Testcontainers)

| Regra | Onde |
|---|---|
| Administrador não age contra a própria conta (suspender, excluir, retirar perfil); raiz intocável; nunca sem administrador ativo | `AdminPolicy` + trava `gefinc.admin-set` |
| Reautenticação por senha nas ações de FR-035; exclusão exige digitar o e-mail do alvo | `Reauthenticator`, `DeletionRequestService` |
| Motivo ativo + justificativa; prazo 1–30 dias ou imediato; só antecipar; motivo e mensagem fixados | `DeletionRequestService` |
| Exclusão sempre prossegue; falha de aviso vira pendência; endereço retido 30 dias | `AccountErasureService`, `PendingCommunicationService` |
| Usuário não reverte decisão administrativa por nenhum canal (login, cancelar exclusão, redefinir senha, sessão antiga) | `AuthService`, `AccountDeletionService`, `JwtAuthenticationFilter` |
| Troca de e-mail por código; e-mail antigo vale até confirmar | `EmailChangeService` |
| Manutenção e cadastros fechados | `MaintenanceGuard`, `RegistrationService`, `InvitationService` |
| Nada financeiro em respostas do painel | `AdminModuleBoundaryTest`, `AdminIsolationIT` |

# Contratos: alterações na API (feature 005)

Aplicadas em `packages/core-models/openapi/gefinc.openapi.yaml` durante a implementação, com `api.ts` regenerado
(`npx nx run core-models:generate`) e os tipos exportados em `packages/core-models/src/lib/models.ts` (Princípio I). Caminhos relativos ao
`context-path` `/api/v1`. Todo caminho `/admin/**` exige papel administrador **verificado no servidor a cada requisição**; usuário comum recebe `403`, visitante `401`
(ambos `problem+json` genéricos, auditados uma vez por janela de 15 min, FR-002/FR-053).

Regras gerais dos endpoints `/admin/**`:

- Respostas de erro `application/problem+json` com `code` estável (tabela de erros abaixo). Recusas de regra de negócio usam `403`/`409`/`422`, **nunca `401`**
  (o cliente trata `401` como sessão expirada e tenta renovar).
- Ações de risco (FR-035) recebem `password` (senha do próprio administrador) no corpo; falha → `403 REAUTH_FAILED`.
- Ações mutantes: limite de **30/min** por administrador; destrutivas: **10 a cada 15 min**; excedido → `429` + `Retry-After` (FR-055).
- Nenhuma resposta contém dado financeiro de ninguém (FR-018, SC-004) nem senha, token, link ou código. **Não existe** exportação, edição ou exclusão de auditoria.
- Listas de usuários: `page` (padrão 0), `size` (padrão 25, máx. 100). Listas de auditoria e de envios: `cursor` opaco + `limit` (padrão 50, máx. 100), sem total.

## Caminhos públicos novos e alterados (tags `System`, `Auth`)

| Operação | Descrição |
|---|---|
| `GET /system/status` | **Público.** `SystemStatus { maintenance, message?, signupsOpen }`. Alimenta o aviso das telas de entrada (web e app). Sem dado sensível. |
| `GET /auth/invitations/{token}` | **Público.** `InvitationPreview { email, expiresAt }`; token inexistente `404`; expirado/cancelado `410 INVITATION_EXPIRED`. |
| `POST /auth/invitations/{token}/accept` | **Público.** Corpo `{ password }` (política de senha existente). `201 UserProfile`. `410` expirado; `503 MAINTENANCE` em manutenção; ignora "cadastros fechados". |
| `POST /auth/notices/{id}/dismiss` | Autenticado. `204`. Dispensa explícita do aviso (a entrega já conta como "visto"); `404` se não for do usuário. |

### Alterações aditivas em endpoints existentes

- `POST /auth/login`:
  - novo `403 ACCOUNT_SUSPENDED` (somente depois de credenciais corretas): `extras.supportHint`, `extras.notices?`;
  - `423 ACCOUNT_DELETION_PENDING` ganha `extras.origin` (`USER`|`ADMIN`), `extras.canCancel` (`origin == USER`), `extras.reasonMessage?` (só `ADMIN`; mensagem **fixada** na solicitação;
    **nunca** a justificativa), `extras.supportHint`, `extras.notices?`; `deletionDate` passa a ser o `due_at` real (prazo variável);
  - novo `503 MAINTENANCE` (usuário comum, após credenciais corretas) com `Retry-After`; administradores entram normalmente.
- `POST /auth/refresh`: `403 ACCOUNT_SUSPENDED`/`401` conforme o caso; `503 MAINTENANCE` para usuário comum (o cliente **não** encerra a sessão por isso).
- `POST /auth/register`: novos `403 SIGNUPS_CLOSED` e `503 MAINTENANCE`; consome convite pendente do mesmo e-mail.
- `POST /auth/account-deletion` (autoatendimento): novos `403 ROOT_PROTECTED` (administrador raiz) e `409 LAST_ADMIN`.
- `POST /auth/account-deletion/cancel`: novo `403 ADMIN_DECISION_LOCKED` (exclusão de origem `ADMIN`; auditado como `REVERT_ATTEMPT`, deduplicado) e `503 MAINTENANCE`.
- `GET /auth/me` → `UserProfile`: campos **opcionais no esquema** `admin: boolean` (conveniência de UI; a barreira é do servidor) e `notices: UserNotice[]` (entrega única, D22).
- Token de acesso: nova claim `sid` (UUID da sessão). Não é contrato público de API, mas muda `JwtService`; tokens antigos sem `sid` valem até expirar.
- Qualquer endpoint autenticado, para usuário comum em manutenção: `503 MAINTENANCE` (corpo `Problem` com `extras.message`); `OPTIONS`, `/auth/password-reset/**`, `/auth/logout`, `/system/status` e
  `/actuator/health` seguem funcionando.
- Cabeçalho/IP: nenhum campo novo no contrato; o IP real passa a vir de `CF-Connecting-IP` só quando a conexão vem do proxy confiável (`TRUSTED_PROXY_CIDRS`).

```yaml
SystemStatus:       { maintenance: boolean, message?: string(<=280), signupsOpen: boolean }
InvitationPreview:  { email: string, expiresAt: date-time }
UserNotice:         { id: int64, kind: DELETION_CANCELED, variant: ACTIVE|STILL_BLOCKED|USER_REQUEST_CONTINUES,
                      originalDeletionDate?: date, message: string }    # texto pronto em pt-BR, sem justificativa
```

## Usuários (tag `Admin`)

| Operação | Descrição |
|---|---|
| `GET /admin/users?q=&status=&sort=&dir=&page=&size=` | `AdminUserPage`. `q` ≤ 100 caracteres, literal, sem caixa/acento. `status` ∈ `ACTIVE`, `SUSPENDED`, `DELETION_PENDING`, `ADMIN`. `sort` ∈ `createdAt`, `lastAccessAt`. Não é auditada (FR-060). |
| `GET /admin/users/{id}` | `AdminUserDetail`. **A abertura é auditada** (`USER_DETAIL_OPENED`, FR-060); recarregar conta como nova abertura. `404` se não existe. |
| `GET /admin/users/{id}/sessions` | `AdminSession[]` (início, último uso, `ip`, `device`). Dado pessoal; sem auditoria própria. |
| `DELETE /admin/users/{id}/sessions/{sessionId}` | Encerra uma sessão (vale na requisição seguinte). `204`. `403 ROOT_PROTECTED` se o alvo é raiz. Sem aviso ao usuário. |
| `DELETE /admin/users/{id}/sessions` | Encerra todas as sessões do usuário. `204`. Mesma proteção. |
| `POST /admin/users/{id}/suspend` | `{ reason }` (1–500). `204`. Recusas: si mesmo `409 SELF_ACTION_FORBIDDEN`, raiz `403 ROOT_PROTECTED`, último administrador `409 LAST_ADMIN`. |
| `POST /admin/users/{id}/reactivate` | `204`. Mantém exclusão pendente, se houver. |
| `DELETE /admin/users/{id}/login-lock` | Retira o bloqueio temporário por tentativas de login. `204`. |
| `POST /admin/users/{id}/password-reset/send` | Reenvia o e-mail de redefinição (novo link; anteriores invalidados). `202`. `409 ACCOUNT_NOT_USABLE` (suspensa/exclusão); `429`; `502 MAIL_DELIVERY_FAILED` (nada concluído). Permitido para o raiz. |
| `POST /admin/users/{id}/password-reset/force` | Invalida a senha atual e as sessões e envia o link. `202`. `403 ROOT_PROTECTED`; `502` desfaz tudo. O administrador nunca vê senha/link/token. |
| `PATCH /admin/users/{id}` | `{ name }` (≤ 80). `200 AdminUserDetail`. Efeito imediato. |
| `PUT /admin/users/{id}/role` | `{ role: USER\|ADMIN, password }`. `204`. Alvo ativo; `403 ROOT_PROTECTED`; `409 LAST_ADMIN`; `403 REAUTH_FAILED`. |
| `POST /admin/users/{id}/email-change` | `{ newEmail }`. `202 PendingEmailChange { newEmail, expiresAt, attemptsLeft }`. Envia o código ao **novo** endereço; o e-mail antigo continua válido. `409 EMAIL_ALREADY_REGISTERED`; `403 ROOT_PROTECTED`; `502`. |
| `POST /admin/users/{id}/email-change/confirm` | `{ code }` (6 dígitos). `204`. `422 EMAIL_CHANGE_CODE_INVALID` (expirado, usado, invalidado ou 5 erros); encerra as sessões do usuário e notifica os dois endereços. |
| `DELETE /admin/users/{id}/email-change` | Cancela a troca pendente. `204`. |
| `POST /admin/users/{id}/deletion` | `DeletionRequest { reasonId, justification (1–1000), mode: IMMEDIATE\|GRACE, days? (1–30), confirmEmail, password }` → `200 DeletionOutcome { status, dueAt?, noticeState: SENT\|PENDING }`. Antecipa se já houver exclusão do usuário (só prazo menor; senão `422`). Imediata: tenta o aviso e **executa antes de responder**. `403 ROOT_PROTECTED`, `409 SELF_ACTION_FORBIDDEN\|LAST_ADMIN`, `422 INVALID_CONFIRMATION` (e-mail digitado), `403 REAUTH_FAILED`. |
| `DELETE /admin/users/{id}/deletion` | Cancela exclusão **com prazo** em curso e restaura o estado anterior (D7). `204`. `409 DELETION_ALREADY_EXECUTED`. Notifica o usuário (e-mail + aviso no app). |

```yaml
AdminUserRow:    { id, email, name?, createdAt, lastAccessAt?, role: USER|ADMIN|ROOT, suspended: boolean, deletionPending: boolean }
AdminUserPage:   { content: AdminUserRow[], page, size, totalElements, counts: { active, suspended, deletionPending, admin } }
AdminUserDetail: AdminUserRow + { openSessions: int, loginLock?: { lockedUntil }, deletion?: { origin: USER|ADMIN, requestedAt, dueAt,
                   reasonName?, noticeState? }, pendingEmailChange?: PendingEmailChange, protected: boolean,   # protected = raiz
                   recentActions: AuditEntry[] (últimas 20) }
AdminSession:    { id: uuid, startedAt, lastUsedAt, ip?: string, device?: string, current: false|true }
```

Nunca aparecem: contas, cartões, lançamentos, categorias, transferências, saldos, valores ou contagens deles (SC-004).

## Auditoria (tag `Admin`) — somente leitura

| Operação | Descrição |
|---|---|
| `GET /admin/audit?from=&to=&actorId=&targetUserId=&action=&result=&cursor=&limit=` | `AuditPage { content: AuditEntry[], nextCursor? }`, da mais recente à mais antiga. |
| `GET /admin/audit/{id}` | `AuditEntry` completo (motivo, resumo `details`). |

```yaml
AuditEntry: { id, occurredAt, action, result: SUCCESS|REFUSED|FAILED, actor: Party, target?: Party, subject?, reason?, refusalCode?, summary: string (pt-BR), details?: object }
Party:      { userId?, label: string }      # e-mail/nome vivos, ou "anônimo-1a2b3c4d" se a conta foi removida; visitante: "visitante" + ip só enquanto em claro (<= 90 dias)
```

**Não existem** `POST/PUT/PATCH/DELETE` em `/admin/audit/**` (teste `AuditApiSurfaceIT`). Não existe exportação (FR-018).

## Sistema, saúde e estatísticas (tag `Admin`)

| Operação | Descrição |
|---|---|
| `GET /admin/system/health` | `SystemHealth { app: UP\|DOWN, database: UP\|DOWN, version, uptimeSeconds, readAt }`. Sem endereços, credenciais ou mensagens internas. |
| `GET /admin/system/stats?days=7\|30\|90&refresh=` | `UsageStats { readAt, usersByStatus, active7d, active30d, newUsersByDay: DayCount[], entriesCreatedByDay: DayCount[] }`. `refresh=true` ignora o cache de 60 s. Só contagens. |
| `GET /admin/alerts` | `AdminAlerts { pendingCommunications: int }` (alerta permanente em todas as telas, FR-056). |

## E-mail e comunicações pendentes (tag `Admin`)

| Operação | Descrição |
|---|---|
| `GET /admin/email/config` | `EmailConfig { host, port, from, complete, authEnabled, starttls }`. **Nunca** usuário/senha. |
| `POST /admin/email/test` | Envia ao e-mail do próprio administrador. `200 { status: SENT\|FAILED, failureReason? }` (na hora, `SYNC_ONCE`). |
| `GET /admin/email/deliveries?status=&kind=&cursor=&limit=` | `EmailDeliveryPage` (últimos 90 dias). Destinatário em claro durante a retenção; `anônimo-…` se a conta foi removida. Sem corpo/link/token/código. |
| `POST /admin/email/deliveries/{id}/resend` | Somente `PASSWORD_RESET` com falha e conta ainda existente: gera novo link (US4). `202`; `409 ACCOUNT_NOT_USABLE`; `429`. |
| `GET /admin/communications/pending` | `PendingCommunication[] { id, kind, targetLabel, failureReason, attempts, createdAt, retainedUntil? }`. **Não** devolve o endereço retido. |
| `POST /admin/communications/pending/{id}/resend` | Reenvia o aviso. `200 { state: DELIVERED\|PENDING }`. |
| `POST /admin/communications/pending/{id}/discard` | Descarta (auditado); apaga o endereço retido. `204`. |

```yaml
EmailDelivery: { id, createdAt, kind, recipient: Party, status: SENT|FAILED, failureReason?: AUTHENTICATION|PERMANENT_REJECTION|TRANSIENT_EXHAUSTED|TIMEOUT|NOT_CONFIGURED|OTHER }
```

## Convites (tag `Admin`)

| Operação | Descrição |
|---|---|
| `GET /admin/invitations?status=` | `Invitation[] { id, email?, status, invitedBy: Party, createdAt, expiresAt }` (e-mail só se `PENDING`). |
| `POST /admin/invitations` | `{ email }` → `201 Invitation`. `409 EMAIL_ALREADY_REGISTERED`; pendente existente: reenvia; `502` se o envio falhar (convite não é criado). |
| `POST /admin/invitations/{id}/resend` | Novo link, anterior invalidado. Qualquer administrador (FR-013). `202`. |
| `DELETE /admin/invitations/{id}` | Cancela (zera o e-mail). `204`. |

## Motivos de exclusão (tag `Admin`)

| Operação | Descrição |
|---|---|
| `GET /admin/deletion-reasons` | `DeletionReason[] { id, name, message, active, initial }`. |
| `POST /admin/deletion-reasons` | `{ name (1–80), message (1–500) }` → `201`. `409 REASON_NAME_TAKEN`; `422` se a mensagem contém dado pessoal/marcador. |
| `PUT /admin/deletion-reasons/{id}` | `{ name, message }`. Não altera mensagens de exclusões já solicitadas (D7/FR-046). |
| `POST /admin/deletion-reasons/{id}/deactivate` | `409 LAST_ACTIVE_REASON` se for o último ativo. |
| `POST /admin/deletion-reasons/{id}/activate` | |

Não existe `DELETE` (nenhum motivo é apagado).

## Parâmetros e manutenção (tag `Admin`)

| Operação | Descrição |
|---|---|
| `GET /admin/parameters` | `Parameters { editable: [ { key, value, updatedAt, updatedBy?: Party } ], readOnly: [ { key, value, label } ] }` (validade de sessões, limites de login, carência de exclusão). |
| `PUT /admin/parameters/signups-open` | `{ open }`. `204`. Auditado com valor anterior e novo. |
| `PUT /admin/parameters/maintenance` | `{ enabled, message? (<=280) }`. `204`. Auditado. |
| `POST /admin/sessions/revoke-all` | `{ password, confirmWord: "ENCERRAR" }`. Encerra as sessões de todos, exceto a do administrador que acionou e as dos raízes. `200 { revoked: int }`. `403 REAUTH_FAILED`, `422 INVALID_CONFIRMATION`. |

## Códigos de erro novos (`Problem.code`)

| Código | HTTP | Quando |
|---|---|---|
| `ACCOUNT_SUSPENDED` | 403 | login/renovação de conta suspensa (após credenciais corretas) |
| `ADMIN_DECISION_LOCKED` | 403 | usuário tenta cancelar exclusão administrativa (ou outra reversão) |
| `MAINTENANCE` | 503 | usuário comum em manutenção; `Retry-After`, `extras.message` |
| `SIGNUPS_CLOSED` | 403 | cadastro por conta própria com cadastros fechados |
| `ROOT_PROTECTED` | 403 | qualquer ação do painel contra o administrador raiz |
| `LAST_ADMIN` | 409 | ação deixaria o sistema sem administrador ativo |
| `SELF_ACTION_FORBIDDEN` | 409 | administrador contra a própria conta (suspender, excluir, retirar perfil) |
| `REAUTH_FAILED` | 403 | senha de reautenticação incorreta (conta no limite de login; 5 falhas revogam a sessão) |
| `INVALID_CONFIRMATION` | 422 | e-mail digitado diferente do alvo, ou palavra de confirmação errada |
| `MAIL_DELIVERY_FAILED` | 502 | ação do painel que depende de e-mail e o envio falhou (nada foi concluído) |
| `INVITATION_EXPIRED` | 410 | convite expirado ou cancelado |
| `DELETION_ALREADY_EXECUTED` | 409 | cancelar exclusão já executada |
| `ACCOUNT_NOT_USABLE` | 409 | redefinição para conta suspensa ou em exclusão |
| `EMAIL_CHANGE_CODE_INVALID` | 422 | código expirado, usado, invalidado, errado ou acima de 5 tentativas |
| `REASON_NAME_TAKEN` | 409 | nome de motivo repetido |
| `LAST_ACTIVE_REASON` | 409 | desativar o último motivo ativo |

`401` continua exclusivo de "não autenticado/sessão expirada". `429 TOO_MANY_REQUESTS` (existente) vale para limite de taxa do painel.

## Compatibilidade

Clientes antigos ignoram `admin`, `notices` e os códigos novos; nenhum campo ou caminho existente muda de significado. Mudanças de comportamento a registrar nas descrições do YAML:
`423` do login com prazo variável e origem; fim do cancelamento por credenciais para exclusão administrativa; `503 MAINTENANCE`. O app móvel antigo (sem tratamento de manutenção) trata `503`
como erro temporário e mantém a fila (comportamento atual do `sync-engine` para `>= 500`), sem perda; o aviso amigável chega com a versão nova.

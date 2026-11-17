-- Painel administrativo (feature 005), parte 2: livro-razão das exclusões de conta e avisos ao usuário.

-- Livro-razão: uma linha por solicitação de exclusão (do próprio usuário ou de um administrador).
-- user_id, requested_by e canceled_by NÃO têm chave estrangeira: a linha sobrevive à exclusão da conta.
-- target_ref (HMAC do id do usuário, rótulo anônimo) é anulável: o preenchimento das exclusões legadas
-- (V16) não consegue calcular o HMAC, cujo segredo fica fora do banco; o rótulo é então derivado do
-- user_id na leitura. A justificativa em texto livre NÃO é guardada aqui (só em audit_log.reason_text).
CREATE TABLE account_deletion_requests (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        BIGINT       NOT NULL,
    target_ref     VARCHAR(32),
    origin         VARCHAR(5)   NOT NULL,
    mode           VARCHAR(9)   NOT NULL,
    grace_days     SMALLINT,
    requested_at   TIMESTAMPTZ  NOT NULL,
    due_at         TIMESTAMPTZ  NOT NULL,
    requested_by   BIGINT,
    reason_id      BIGINT       REFERENCES deletion_reasons (id),
    reason_name    VARCHAR(80),
    reason_message VARCHAR(500),
    supersedes_id  BIGINT       REFERENCES account_deletion_requests (id),
    status         VARCHAR(10)  NOT NULL,
    notice_state   VARCHAR(14)  NOT NULL,
    canceled_at    TIMESTAMPTZ,
    canceled_by    BIGINT,
    executed_at    TIMESTAMPTZ,
    CONSTRAINT ck_adr_origin CHECK (origin IN ('USER', 'ADMIN')),
    CONSTRAINT ck_adr_mode CHECK (mode IN ('IMMEDIATE', 'GRACE')),
    CONSTRAINT ck_adr_status CHECK (status IN ('SCHEDULED', 'CANCELED', 'SUPERSEDED', 'EXECUTED')),
    CONSTRAINT ck_adr_notice CHECK (
        notice_state IN ('NOT_APPLICABLE', 'QUEUED', 'SENT', 'PENDING', 'DISCARDED', 'EXPIRED')),
    -- Carência de 1 a 30 dias; exclusão imediata não tem carência.
    CONSTRAINT ck_adr_days CHECK (
        (mode = 'GRACE' AND grace_days IS NOT NULL AND grace_days BETWEEN 1 AND 30) OR (mode = 'IMMEDIATE' AND grace_days IS NULL)),
    -- Pedido de administrador exige motivo (fixado na solicitação) e quem pediu.
    CONSTRAINT ck_adr_admin_reason CHECK (
        origin <> 'ADMIN'
        OR (reason_id IS NOT NULL AND reason_name IS NOT NULL AND reason_message IS NOT NULL
            AND requested_by IS NOT NULL)),
    -- Autoatendimento: sempre carência de 30 dias e sem aviso por e-mail.
    CONSTRAINT ck_adr_user_mode CHECK (
        origin <> 'USER'
        OR (mode = 'GRACE' AND grace_days = 30 AND notice_state = 'NOT_APPLICABLE'))
);

-- No máximo uma solicitação ativa por usuário.
CREATE UNIQUE INDEX ux_adr_active ON account_deletion_requests (user_id) WHERE status = 'SCHEDULED';
CREATE INDEX ix_adr_user ON account_deletion_requests (user_id, requested_at DESC);

-- Avisos de uma só entrega ao usuário (hoje: exclusão cancelada pelo administrador). O texto é montado
-- no servidor com a mensagem fixada, nunca com a justificativa livre.
CREATE TABLE user_notices (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind                VARCHAR(20) NOT NULL,
    deletion_request_id BIGINT      NOT NULL REFERENCES account_deletion_requests (id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at        TIMESTAMPTZ,
    dismissed_at        TIMESTAMPTZ,
    CONSTRAINT ck_un_kind CHECK (kind IN ('DELETION_CANCELED'))
);

CREATE INDEX ix_un_user_open ON user_notices (user_id) WHERE delivered_at IS NULL;

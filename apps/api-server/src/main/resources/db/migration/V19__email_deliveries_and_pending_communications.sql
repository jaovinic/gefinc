-- Painel administrativo (feature 005), parte 6: histórico de envios de e-mail e comunicações pendentes.
-- Sem preenchimento retroativo: as tabelas nascem vazias.

-- Histórico de envios (retenção de 90 dias). Guarda só metadados: NUNCA corpo, assunto, link, token,
-- código nem a mensagem técnica do servidor de e-mail. O endereço fica em claro durante a retenção e é
-- zerado quando o usuário é excluído; recipient_ref (HMAC) permite correlacionar sem o endereço.
CREATE TABLE email_deliveries (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    kind            VARCHAR(24)  NOT NULL,
    recipient_email VARCHAR(254),
    recipient_ref   VARCHAR(32)  NOT NULL,
    user_id         BIGINT,
    status          VARCHAR(6)   NOT NULL,
    failure_reason  VARCHAR(20),
    attempts        SMALLINT     NOT NULL DEFAULT 1,
    CONSTRAINT ck_ed_kind CHECK (kind IN (
        'PASSWORD_RESET', 'TEST', 'INVITATION', 'DELETION_NOTICE', 'CANCELLATION_NOTICE',
        'EMAIL_CHANGE_CODE', 'EMAIL_CHANGE_NOTICE')),
    CONSTRAINT ck_ed_status CHECK (status IN ('SENT', 'FAILED')),
    CONSTRAINT ck_ed_reason CHECK (failure_reason IN (
        'AUTHENTICATION', 'PERMANENT_REJECTION', 'TRANSIENT_EXHAUSTED', 'TIMEOUT', 'NOT_CONFIGURED',
        'OTHER')),
    -- O motivo da falha existe se, e somente se, o envio falhou.
    CONSTRAINT ck_ed_failure CHECK ((failure_reason IS NOT NULL) = (status = 'FAILED'))
);

CREATE INDEX ix_ed_time ON email_deliveries (created_at DESC, id DESC);
CREATE INDEX ix_ed_status_kind ON email_deliveries (status, kind, created_at DESC);
CREATE INDEX ix_ed_user ON email_deliveries (user_id, created_at DESC);

-- Avisos de exclusão/cancelamento que não puderam ser enviados. retained_email é a única retenção do
-- endereço de uma conta já removida (30 dias, nunca exibido) e é zerado em todo estado final.
CREATE TABLE pending_communications (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind                VARCHAR(19) NOT NULL,
    deletion_request_id BIGINT      NOT NULL REFERENCES account_deletion_requests (id),
    user_id             BIGINT      NOT NULL,
    target_ref          VARCHAR(32) NOT NULL,
    state               VARCHAR(9)  NOT NULL,
    failure_reason      VARCHAR(20),
    attempts            SMALLINT    NOT NULL DEFAULT 1,
    retained_email      VARCHAR(254),
    retained_until      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at         TIMESTAMPTZ,
    CONSTRAINT ck_pc_kind CHECK (kind IN ('DELETION_NOTICE', 'CANCELLATION_NOTICE')),
    CONSTRAINT ck_pc_state CHECK (state IN ('PENDING', 'DELIVERED', 'DISCARDED', 'EXPIRED')),
    CONSTRAINT ck_pc_reason CHECK (failure_reason IN (
        'AUTHENTICATION', 'PERMANENT_REJECTION', 'TRANSIENT_EXHAUSTED', 'TIMEOUT', 'NOT_CONFIGURED',
        'OTHER')),
    CONSTRAINT ck_pc_retained CHECK (
        retained_email IS NULL OR (state = 'PENDING' AND retained_until IS NOT NULL))
);

CREATE INDEX ix_pc_pending ON pending_communications (created_at) WHERE state = 'PENDING';

-- Painel administrativo (feature 005), parte 5: trilha de auditoria imutável e a tabela separada do
-- dado pessoal descartável (IP e dispositivo). audit_log nunca guarda e-mail, nome, IP, senha, token,
-- link, código ou valor financeiro: a identificação é por HMAC (client_ref, dedupe_key) e a API resolve
-- e-mail/nome por junção com users na leitura. Sem preenchimento retroativo: nasce vazia.

CREATE TABLE audit_log (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    action         VARCHAR(32)   NOT NULL,
    result         VARCHAR(7)    NOT NULL,
    actor_kind     VARCHAR(7)    NOT NULL,
    -- Sem chave estrangeira: a linha sobrevive à exclusão do ator e do alvo.
    actor_user_id  BIGINT,
    target_user_id BIGINT,
    -- Alvo que não é usuário: chave do parâmetro, id do motivo/convite/comunicação ou rota negada.
    subject        VARCHAR(60),
    -- Justificativa informada pelo administrador; mantida após a exclusão do alvo.
    reason_text    VARCHAR(1000),
    refusal_code   VARCHAR(32),
    -- Só chaves do enum AuditKey, com valores escalares curtos.
    details        JSONB         NOT NULL DEFAULT '{}'::jsonb,
    client_ref     VARCHAR(32),
    dedupe_key     VARCHAR(32),
    request_id     VARCHAR(40),
    CONSTRAINT ck_al_action CHECK (action IN (
        'USER_DETAIL_OPENED', 'USER_SUSPENDED', 'USER_REACTIVATED', 'LOGIN_LOCK_CLEARED',
        'SESSION_REVOKED', 'SESSIONS_REVOKED_ALL', 'SYSTEM_SESSIONS_REVOKED',
        'PASSWORD_RESET_SENT', 'PASSWORD_RESET_FORCED', 'USER_RENAMED',
        'EMAIL_CHANGE_REQUESTED', 'EMAIL_CHANGE_CONFIRMED', 'EMAIL_CHANGE_FAILED',
        'EMAIL_CHANGE_CANCELED', 'ROLE_GRANTED', 'ROLE_REVOKED',
        'DELETION_REQUESTED', 'DELETION_ANTICIPATED', 'DELETION_CANCELED', 'ACCOUNT_ERASED',
        'COMMUNICATION_RESENT', 'COMMUNICATION_DISCARDED', 'EMAIL_TEST_SENT',
        'INVITATION_CREATED', 'INVITATION_RESENT', 'INVITATION_CANCELED',
        'REASON_CREATED', 'REASON_UPDATED', 'REASON_DEACTIVATED', 'REASON_ACTIVATED',
        'PARAMETER_CHANGED', 'ACCESS_DENIED', 'REVERT_ATTEMPT')),
    CONSTRAINT ck_al_result CHECK (result IN ('SUCCESS', 'REFUSED', 'FAILED')),
    CONSTRAINT ck_al_actor_kind CHECK (actor_kind IN ('ADMIN', 'USER', 'VISITOR', 'SYSTEM'))
);

CREATE INDEX ix_al_time ON audit_log (occurred_at DESC, id DESC);
CREATE INDEX ix_al_target ON audit_log (target_user_id, occurred_at DESC);
CREATE INDEX ix_al_actor ON audit_log (actor_user_id, occurred_at DESC);
CREATE INDEX ix_al_action ON audit_log (action, occurred_at DESC);
-- Janela de deduplicação das tentativas negadas (consulta por dedupe_key nos últimos 15 minutos).
CREATE INDEX ix_al_dedupe ON audit_log (dedupe_key, occurred_at DESC) WHERE dedupe_key IS NOT NULL;

-- Imutabilidade: nem UPDATE, nem DELETE, nem TRUNCATE, mesmo para o dono da tabela (restrict_violation,
-- SQLSTATE 23001). A API e os testes só inserem; o reset dos testes desliga os gatilhos de forma local
-- à transação (session_replication_role = replica).
CREATE FUNCTION audit_log_immutable() RETURNS trigger
    LANGUAGE plpgsql
AS
$$
BEGIN
    RAISE EXCEPTION 'audit_log é imutável: % não permitido', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_al_immutable
    BEFORE UPDATE OR DELETE
    ON audit_log
    FOR EACH ROW
EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER trg_al_no_truncate
    BEFORE TRUNCATE
    ON audit_log
    FOR EACH STATEMENT
EXECUTE FUNCTION audit_log_immutable();

-- O dado pessoal descartável (IP real e rótulo do dispositivo) fica à parte, ligado à linha da trilha:
-- apagado em cascata com o usuário e por rotina de retenção para visitantes. Só nas tentativas negadas
-- e recusas de reautenticação. Fica fora dos gatilhos de imutabilidade de propósito.
CREATE TABLE audit_log_client (
    audit_id     BIGINT      PRIMARY KEY REFERENCES audit_log (id),
    user_id      BIGINT      REFERENCES users (id) ON DELETE CASCADE,
    ip           VARCHAR(45) NOT NULL,
    device_label VARCHAR(80),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_alc_visitor ON audit_log_client (created_at) WHERE user_id IS NULL;

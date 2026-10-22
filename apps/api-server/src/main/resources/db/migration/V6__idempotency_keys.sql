-- Chaves de idempotência do app móvel: operações enviadas depois de um período offline (ou repetidas
-- por falha de rede) são registradas uma só vez. A chave é escopada por usuário.
CREATE TABLE idempotency_keys (
    user_id         BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    key             UUID         NOT NULL,
    method          VARCHAR(8)   NOT NULL,
    path            VARCHAR(200) NOT NULL,
    request_hash    CHAR(64)     NOT NULL,
    state           VARCHAR(12)  NOT NULL,
    response_status INT,
    response_body   TEXT,
    created_at      TIMESTAMPTZ  NOT NULL,
    PRIMARY KEY (user_id, key),
    CONSTRAINT ck_idem_state CHECK (state IN ('IN_PROGRESS', 'COMPLETED')),
    CONSTRAINT ck_idem_completed CHECK (state = 'IN_PROGRESS' OR response_status IS NOT NULL)
);

-- Usado pela limpeza diária (registros com mais de 7 dias).
CREATE INDEX ix_idem_created_at ON idempotency_keys (created_at);

-- Painel administrativo (feature 005), parte 7: convites de cadastro e trocas de e-mail pendentes.
-- Sem preenchimento retroativo: as tabelas nascem vazias.

-- Convite de cadastro. O e-mail fica em claro somente enquanto PENDING; o token só existe no e-mail
-- enviado (aqui, apenas o hash SHA-256). Reenviar troca token_hash e expires_at.
CREATE TABLE invitations (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email            VARCHAR(254),
    email_ref        VARCHAR(32) NOT NULL,
    token_hash       VARCHAR(64) NOT NULL UNIQUE,
    status           VARCHAR(8)  NOT NULL,
    expires_at       TIMESTAMPTZ NOT NULL,
    invited_by       BIGINT      REFERENCES users (id) ON DELETE SET NULL,
    accepted_user_id BIGINT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at      TIMESTAMPTZ,
    CONSTRAINT ck_inv_status CHECK (status IN ('PENDING', 'ACCEPTED', 'CANCELED', 'EXPIRED')),
    CONSTRAINT ck_inv_email CHECK ((status = 'PENDING') = (email IS NOT NULL))
);

-- No máximo um convite pendente por e-mail (sem diferenciar caixa).
CREATE UNIQUE INDEX ux_inv_pending_email ON invitations (lower(email)) WHERE status = 'PENDING';
CREATE INDEX ix_inv_status ON invitations (status, created_at DESC);

-- Troca de e-mail por código de 6 dígitos (validade de 15 minutos, no máximo 5 erros). O código nunca
-- é gravado: só o HMAC (code_hash), que entra com o id do pedido. Ao sair de PENDING, new_email e
-- code_hash são zerados.
CREATE TABLE pending_email_changes (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    requested_by  BIGINT      REFERENCES users (id) ON DELETE SET NULL,
    new_email     VARCHAR(254),
    new_email_ref VARCHAR(32) NOT NULL,
    code_hash     VARCHAR(64),
    attempts      SMALLINT    NOT NULL DEFAULT 0,
    status        VARCHAR(11) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    resolved_at   TIMESTAMPTZ,
    CONSTRAINT ck_pec_attempts CHECK (attempts BETWEEN 0 AND 5),
    CONSTRAINT ck_pec_status CHECK (
        status IN ('PENDING', 'CONFIRMED', 'CANCELED', 'EXPIRED', 'INVALIDATED')),
    CONSTRAINT ck_pec_pending CHECK (
        status <> 'PENDING' OR (new_email IS NOT NULL AND code_hash IS NOT NULL))
);

-- No máximo uma troca pendente por usuário.
CREATE UNIQUE INDEX ux_pec_user_pending ON pending_email_changes (user_id) WHERE status = 'PENDING';

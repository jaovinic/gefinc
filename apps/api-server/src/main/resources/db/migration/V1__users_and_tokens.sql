-- Usuários, tokens de renovação de sessão e tokens de redefinição de senha.
-- Referências a tabelas pai usam NO ACTION (padrão) e não RESTRICT, para que a exclusão do usuário em
-- cascata funcione quando linhas dependentes são removidas no mesmo comando.

CREATE TABLE users (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email                 VARCHAR(254) NOT NULL,
    password_hash         VARCHAR(100) NOT NULL,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deletion_requested_at TIMESTAMPTZ,
    token_version         INTEGER      NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX ux_users_email_lower ON users (lower(email));
CREATE INDEX ix_users_deletion_requested_at ON users (deletion_requested_at)
    WHERE deletion_requested_at IS NOT NULL;

CREATE TABLE refresh_tokens (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    family_id      UUID        NOT NULL,
    token_hash     VARCHAR(64) NOT NULL UNIQUE,
    expires_at     TIMESTAMPTZ NOT NULL,
    revoked_at     TIMESTAMPTZ,
    replaced_by_id BIGINT REFERENCES refresh_tokens (id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX ix_refresh_tokens_family ON refresh_tokens (family_id);

CREATE TABLE password_reset_tokens (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_password_reset_tokens_user_created ON password_reset_tokens (user_id, created_at);

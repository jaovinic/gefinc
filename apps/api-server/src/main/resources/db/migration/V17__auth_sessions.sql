-- Painel administrativo (feature 005), parte 4: sessões de autenticação (uma por família de tokens de
-- renovação). O id é o family_id de refresh_tokens e irá na claim sid do token de acesso. IP e rótulo
-- do dispositivo são dado pessoal: somem com o usuário (ON DELETE CASCADE). Sessões criadas depois
-- desta migração e antes de a aplicação passar a gravar auth_sessions não têm linha.

CREATE TABLE auth_sessions (
    id           UUID        PRIMARY KEY,
    user_id      BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    client_ip    VARCHAR(45),
    device_label VARCHAR(80),
    client_kind  VARCHAR(6)  NOT NULL DEFAULT 'OTHER',
    revoked_at   TIMESTAMPTZ,
    revoked_by   VARCHAR(6),
    CONSTRAINT ck_as_client_kind CHECK (client_kind IN ('WEB', 'MOBILE', 'OTHER')),
    CONSTRAINT ck_as_revoked_by CHECK (revoked_by IN ('USER', 'ADMIN', 'SYSTEM'))
);

-- Sessão aberta = revoked_at IS NULL AND expires_at > now().
CREATE INDEX ix_as_user_open ON auth_sessions (user_id, created_at DESC) WHERE revoked_at IS NULL;

-- Uma linha por família de tokens já existente. IP e dispositivo são desconhecidos (nulos) e o tipo de
-- cliente fica OTHER. A sessão só consta como revogada se todos os tokens da família foram revogados
-- (revogação do sistema, pois a origem não foi registrada).
INSERT INTO auth_sessions (id, user_id, created_at, last_used_at, expires_at, client_kind, revoked_at,
                           revoked_by)
SELECT family_id,
       user_id,
       min(created_at),
       max(created_at),
       max(expires_at),
       'OTHER',
       CASE WHEN count(*) = count(revoked_at) THEN max(revoked_at) END,
       CASE WHEN count(*) = count(revoked_at) THEN 'SYSTEM' END
FROM refresh_tokens
GROUP BY family_id, user_id;

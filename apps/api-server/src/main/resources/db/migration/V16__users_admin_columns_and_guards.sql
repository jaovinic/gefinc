-- Painel administrativo (feature 005), parte 3: colunas administrativas em users, coerência da exclusão,
-- guarda do administrador raiz e extensão de busca sem acento. Ordem interna: colunas, preenchimento,
-- restrições, extensão, índices e, por último, a função e o gatilho.

ALTER TABLE users
    ADD COLUMN role                VARCHAR(5) NOT NULL DEFAULT 'USER',
    ADD COLUMN suspended_at        TIMESTAMPTZ,
    ADD COLUMN last_access_at      TIMESTAMPTZ,
    ADD COLUMN deletion_due_at     TIMESTAMPTZ,
    ADD COLUMN deletion_origin     VARCHAR(5),
    ADD COLUMN deletion_request_id BIGINT REFERENCES account_deletion_requests (id);

-- Exclusões por autoatendimento já pendentes entram no livro-razão e passam a ter vencimento. 720 horas
-- (e não '30 days') para ficar idêntico a Duration.ofDays(30) do Java, sem depender de fuso ou horário
-- de verão. target_ref fica nulo: o HMAC não pode ser calculado aqui; o rótulo anônimo é derivado do
-- user_id na leitura.
WITH legacy AS (
    INSERT INTO account_deletion_requests (user_id, target_ref, origin, mode, grace_days,
                                           requested_at, due_at, status, notice_state)
    SELECT id, NULL, 'USER', 'GRACE', 30, deletion_requested_at,
           deletion_requested_at + INTERVAL '720 hours', 'SCHEDULED', 'NOT_APPLICABLE'
    FROM users
    WHERE deletion_requested_at IS NOT NULL
    RETURNING id, user_id)
UPDATE users u
SET deletion_due_at     = u.deletion_requested_at + INTERVAL '720 hours',
    deletion_origin     = 'USER',
    deletion_request_id = legacy.id
FROM legacy
WHERE u.id = legacy.user_id;

ALTER TABLE users
    ADD CONSTRAINT ck_users_role CHECK (role IN ('USER', 'ADMIN', 'ROOT')),
    ADD CONSTRAINT ck_users_deletion_origin CHECK (deletion_origin IN ('USER', 'ADMIN')),
    -- As quatro colunas da exclusão andam juntas: todas nulas ou todas preenchidas.
    ADD CONSTRAINT ck_users_deletion_consistent CHECK (
        (deletion_requested_at IS NULL AND deletion_due_at IS NULL
            AND deletion_origin IS NULL AND deletion_request_id IS NULL)
        OR (deletion_requested_at IS NOT NULL AND deletion_due_at IS NOT NULL
            AND deletion_origin IS NOT NULL AND deletion_request_id IS NOT NULL
            AND deletion_due_at >= deletion_requested_at)),
    -- O raiz nunca fica suspenso nem em exclusão pelo painel.
    ADD CONSTRAINT ck_users_root_active CHECK (
        role <> 'ROOT' OR (suspended_at IS NULL AND deletion_requested_at IS NULL));

-- Busca sem acento e sem diferenciar caixa na lista de usuários.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- O índice ix_users_deletion_requested_at permanece (migrações são imutáveis).
CREATE INDEX ix_users_deletion_due ON users (deletion_due_at) WHERE deletion_due_at IS NOT NULL;
CREATE INDEX ix_users_role ON users (role) WHERE role <> 'USER';
CREATE INDEX ix_users_created ON users (created_at DESC, id DESC);
CREATE INDEX ix_users_last_access ON users (last_access_at DESC NULLS LAST, id DESC);

-- Guarda do administrador raiz: criar, apagar ou mudar o papel de/para ROOT só com a variável de
-- transação gefinc.allow_root_change = 'on' (roteiro do dono da implantação). Dispara apenas quando o
-- papel muda: o Hibernate grava todas as colunas mapeadas, então a guarda não pode bloquear login,
-- troca de senha ou revogação de sessões do próprio raiz.
CREATE FUNCTION users_root_guard() RETURNS trigger
    LANGUAGE plpgsql
AS
$$
BEGIN
    IF current_setting('gefinc.allow_root_change', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'ROOT' THEN
            RAISE EXCEPTION 'Alteração do administrador raiz não permitida.' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.role IS DISTINCT FROM OLD.role AND (NEW.role = 'ROOT' OR OLD.role = 'ROOT') THEN
            RAISE EXCEPTION 'Alteração do administrador raiz não permitida.' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    ELSE
        IF OLD.role = 'ROOT' THEN
            RAISE EXCEPTION 'Alteração do administrador raiz não permitida.' USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;
END;
$$;

CREATE TRIGGER trg_users_root_guard
    BEFORE INSERT OR UPDATE OF role OR DELETE
    ON users
    FOR EACH ROW
EXECUTE FUNCTION users_root_guard();

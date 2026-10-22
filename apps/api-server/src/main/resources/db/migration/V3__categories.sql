-- Categorias de receita e de despesa de cada usuário.
CREATE TABLE categories (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id   BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name      VARCHAR(60) NOT NULL,
    type      VARCHAR(7)  NOT NULL,
    color_hex VARCHAR(7)  NOT NULL,
    CONSTRAINT ck_categories_type CHECK (type IN ('INCOME', 'EXPENSE')),
    CONSTRAINT ck_categories_color CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    -- Alvo das chaves estrangeiras compostas (categoria e usuário) dos lançamentos.
    CONSTRAINT uq_categories_id_user UNIQUE (id, user_id)
);

-- Nome único por usuário e tipo, sem diferenciar maiúsculas.
CREATE UNIQUE INDEX ux_categories_user_type_name ON categories (user_id, type, lower(name));
CREATE INDEX ix_categories_user ON categories (user_id);

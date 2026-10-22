-- Contas bancárias, dinheiro em espécie e cartões de crédito.
CREATE TABLE accounts (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        VARCHAR(80) NOT NULL,
    type        VARCHAR(12) NOT NULL,
    closing_day SMALLINT,
    due_day     SMALLINT,
    active      BOOLEAN     NOT NULL DEFAULT true,
    version     BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ck_accounts_type CHECK (type IN ('CHECKING', 'CASH', 'CREDIT_CARD')),
    CONSTRAINT ck_accounts_closing_day CHECK (closing_day BETWEEN 1 AND 31),
    CONSTRAINT ck_accounts_due_day CHECK (due_day BETWEEN 1 AND 31),
    -- Dias de fechamento e vencimento: obrigatórios no cartão e proibidos nos demais tipos (FR-012).
    CONSTRAINT ck_accounts_card_days CHECK (
        (type = 'CREDIT_CARD' AND closing_day IS NOT NULL AND due_day IS NOT NULL)
        OR (type <> 'CREDIT_CARD' AND closing_day IS NULL AND due_day IS NULL)),
    -- Alvo das chaves estrangeiras compostas (conta e usuário) usadas pelos lançamentos.
    CONSTRAINT uq_accounts_id_user UNIQUE (id, user_id)
);

-- Nome único por usuário entre as contas ativas, sem diferenciar maiúsculas.
CREATE UNIQUE INDEX ux_accounts_user_name_active ON accounts (user_id, lower(name)) WHERE active;
CREATE INDEX ix_accounts_user ON accounts (user_id);

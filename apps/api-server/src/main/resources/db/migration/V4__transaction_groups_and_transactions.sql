-- Grupos de lançamento (fixo, avulso ou parcelado) e suas ocorrências mensais.
-- As chaves estrangeiras compostas (id, user_id) garantem, no banco, que um lançamento só referencia
-- conta, categoria e grupo do mesmo usuário (Princípio III).

CREATE TABLE transaction_groups (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id            BIGINT         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    description        VARCHAR(120)   NOT NULL,
    recurrence_type    VARCHAR(11)    NOT NULL,
    total_installments SMALLINT       NOT NULL DEFAULT 1,
    total_amount       NUMERIC(19, 2) NOT NULL,
    account_id         BIGINT         NOT NULL,
    category_id        BIGINT         NOT NULL,
    purchase_date      DATE           NOT NULL,
    first_due_date     DATE           NOT NULL,
    end_month          DATE,
    version            BIGINT         NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT ck_groups_recurrence CHECK (recurrence_type IN ('FIXED', 'VARIABLE', 'INSTALLMENT')),
    CONSTRAINT ck_groups_amount CHECK (total_amount > 0),
    CONSTRAINT ck_groups_installments CHECK (
        (recurrence_type = 'INSTALLMENT' AND total_installments BETWEEN 2 AND 120)
        OR (recurrence_type <> 'INSTALLMENT' AND total_installments = 1)),
    -- Mês de encerramento: sempre o primeiro dia do mês, e só para lançamentos fixos.
    CONSTRAINT ck_groups_end_month CHECK (
        end_month IS NULL
        OR (recurrence_type = 'FIXED' AND end_month = end_month - (EXTRACT(DAY FROM end_month)::int - 1))),
    CONSTRAINT fk_groups_account FOREIGN KEY (account_id, user_id) REFERENCES accounts (id, user_id),
    CONSTRAINT fk_groups_category FOREIGN KEY (category_id, user_id) REFERENCES categories (id, user_id),
    CONSTRAINT uq_groups_id_user UNIQUE (id, user_id)
);

CREATE INDEX ix_groups_user ON transaction_groups (user_id);
CREATE INDEX ix_groups_account ON transaction_groups (user_id, account_id);

CREATE TABLE transactions (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id           BIGINT         NOT NULL,
    user_id            BIGINT         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_id         BIGINT         NOT NULL,
    category_id        BIGINT         NOT NULL,
    installment_number SMALLINT       NOT NULL,
    reference_month    DATE           NOT NULL,
    amount             NUMERIC(19, 2) NOT NULL,
    due_date           DATE           NOT NULL,
    payment_date       DATE,
    status             VARCHAR(7)     NOT NULL,
    version            BIGINT         NOT NULL DEFAULT 0,
    CONSTRAINT ck_tx_installment CHECK (installment_number >= 1),
    CONSTRAINT ck_tx_amount CHECK (amount > 0),
    CONSTRAINT ck_tx_status CHECK (status IN ('PENDING', 'PAID')),
    CONSTRAINT ck_tx_payment CHECK ((status = 'PAID') = (payment_date IS NOT NULL)),
    -- Primeiro dia do mês do vencimento, por aritmética de datas (independe de fuso).
    CONSTRAINT ck_tx_reference_month CHECK (
        reference_month = due_date - (EXTRACT(DAY FROM due_date)::int - 1)),
    CONSTRAINT fk_tx_group FOREIGN KEY (group_id, user_id)
        REFERENCES transaction_groups (id, user_id) ON DELETE CASCADE,
    CONSTRAINT fk_tx_account FOREIGN KEY (account_id, user_id) REFERENCES accounts (id, user_id),
    CONSTRAINT fk_tx_category FOREIGN KEY (category_id, user_id) REFERENCES categories (id, user_id),
    CONSTRAINT uq_tx_group_installment UNIQUE (group_id, installment_number),
    -- Adiável: recalcular os vencimentos de um grupo pode trocar meses entre ocorrências na mesma transação.
    CONSTRAINT uq_tx_group_reference UNIQUE (group_id, reference_month) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX ix_tx_user_due ON transactions (user_id, due_date);
CREATE INDEX ix_tx_user_account_due ON transactions (user_id, account_id, due_date);
CREATE INDEX ix_tx_user_category_due ON transactions (user_id, category_id, due_date);
CREATE INDEX ix_tx_user_status_due ON transactions (user_id, status, due_date);
CREATE INDEX ix_tx_user_reference ON transactions (user_id, reference_month);
CREATE INDEX ix_tx_group ON transactions (group_id);

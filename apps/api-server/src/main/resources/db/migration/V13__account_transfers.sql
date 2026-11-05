-- Transferências de saldo entre contas do mesmo usuário (bancária ou dinheiro). Uma linha por
-- transferência: a saída da origem e a entrada no destino são a mesma linha, então não há metade
-- gravada. Não são receita nem despesa e não aparecem em lançamentos, categorias, fluxo de caixa,
-- faturas nem vencimentos; só mudam o saldo por conta (derivado, sem estado gravado).
-- Sem preenchimento retroativo: a tabela nasce vazia.
CREATE TABLE account_transfers (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    from_account_id BIGINT         NOT NULL,
    to_account_id   BIGINT         NOT NULL,
    amount          NUMERIC(19, 2) NOT NULL,
    transfer_date   DATE           NOT NULL,
    description     VARCHAR(120),
    version         BIGINT         NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT ck_at_amount CHECK (amount > 0),
    CONSTRAINT ck_at_distinct CHECK (from_account_id <> to_account_id),
    -- As duas pontas precisam ser contas do mesmo usuário; sem cascata (conta com transferência
    -- não é excluída, é inativada).
    CONSTRAINT fk_at_from FOREIGN KEY (from_account_id, user_id) REFERENCES accounts (id, user_id),
    CONSTRAINT fk_at_to FOREIGN KEY (to_account_id, user_id) REFERENCES accounts (id, user_id),
    CONSTRAINT uq_at_id_user UNIQUE (id, user_id)
);

CREATE INDEX ix_at_user_date ON account_transfers (user_id, transfer_date);
CREATE INDEX ix_at_user_from_date ON account_transfers (user_id, from_account_id, transfer_date);
CREATE INDEX ix_at_user_to_date ON account_transfers (user_id, to_account_id, transfer_date);

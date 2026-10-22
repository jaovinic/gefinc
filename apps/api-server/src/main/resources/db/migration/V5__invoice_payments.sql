-- Pagamentos de fatura de cartão (totais ou parciais). A fatura em si é uma visão derivada (sem tabela).
CREATE TABLE invoice_payments (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_id    BIGINT         NOT NULL,
    invoice_month DATE           NOT NULL,
    amount        NUMERIC(19, 2) NOT NULL,
    paid_at       DATE           NOT NULL,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT ck_ip_amount CHECK (amount > 0),
    -- Primeiro dia do mês do vencimento da fatura, por aritmética de datas.
    CONSTRAINT ck_ip_month CHECK (invoice_month = invoice_month - (EXTRACT(DAY FROM invoice_month)::int - 1)),
    CONSTRAINT fk_ip_account FOREIGN KEY (account_id, user_id) REFERENCES accounts (id, user_id),
    CONSTRAINT uq_ip_id_user UNIQUE (id, user_id)
);

CREATE INDEX ix_ip_user_account_month ON invoice_payments (user_id, account_id, invoice_month);

-- Itens quitados automaticamente por um pagamento de fatura guardam qual pagamento os quitou.
ALTER TABLE transactions ADD COLUMN settled_by_payment_id BIGINT;
ALTER TABLE transactions
    ADD CONSTRAINT fk_tx_settled_by FOREIGN KEY (settled_by_payment_id, user_id)
        REFERENCES invoice_payments (id, user_id);
ALTER TABLE transactions
    ADD CONSTRAINT ck_tx_settled CHECK (settled_by_payment_id IS NULL OR status = 'PAID');

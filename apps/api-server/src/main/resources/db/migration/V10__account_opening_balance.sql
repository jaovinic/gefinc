-- Saldo inicial opcional da conta (parte do saldo acumulado). Cartão de crédito não tem saldo inicial.
ALTER TABLE accounts
    ADD COLUMN opening_balance NUMERIC(19, 2) NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_accounts_opening CHECK (type <> 'CREDIT_CARD' OR opening_balance = 0);

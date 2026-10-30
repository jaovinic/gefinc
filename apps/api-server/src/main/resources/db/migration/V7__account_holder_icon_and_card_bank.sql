-- Tipo de titular (PF/PJ), ícone identificador e vínculo do cartão com uma conta bancária.
ALTER TABLE accounts
    ADD COLUMN holder_type     VARCHAR(2),
    ADD COLUMN icon            VARCHAR(20),
    ADD COLUMN bank_account_id BIGINT;

-- Contas bancárias existentes passam a ser pessoa física; dinheiro e cartões seguem sem titular.
UPDATE accounts SET holder_type = 'PF' WHERE type = 'CHECKING';

ALTER TABLE accounts
    ADD CONSTRAINT ck_accounts_holder_type CHECK (holder_type IN ('PF', 'PJ')),
    -- Titular obrigatório na conta bancária e proibido nos demais tipos.
    ADD CONSTRAINT ck_accounts_holder CHECK (
        (type = 'CHECKING' AND holder_type IS NOT NULL)
        OR (type <> 'CHECKING' AND holder_type IS NULL)),
    -- Chaves do catálogo de ícones (o mesmo do contrato OpenAPI); nulo = ícone padrão do tipo.
    ADD CONSTRAINT ck_accounts_icon CHECK (icon IS NULL OR icon IN (
        'bank', 'building', 'briefcase', 'landmark', 'wallet', 'cash', 'piggy', 'card',
        'card-gold', 'card-platinum', 'card-black', 'shield', 'rocket', 'star', 'globe',
        'shopping-bag')),
    -- Só o cartão tem conta bancária vinculada; cartões anteriores a esta versão ficam sem vínculo.
    ADD CONSTRAINT ck_accounts_bank_link CHECK (bank_account_id IS NULL OR type = 'CREDIT_CARD'),
    -- A conta vinculada precisa ser do mesmo usuário (Princípio III).
    ADD CONSTRAINT fk_accounts_bank_account FOREIGN KEY (bank_account_id, user_id)
        REFERENCES accounts (id, user_id);

CREATE INDEX ix_accounts_bank ON accounts (user_id, bank_account_id) WHERE bank_account_id IS NOT NULL;

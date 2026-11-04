-- Cor personalizada do ícone da conta/cartão (#RRGGBB em maiúsculas). Nulo = visual padrão do tipo,
-- que no cliente é um token de tema (não um hex), por isso não há preenchimento das contas existentes.
ALTER TABLE accounts
    ADD COLUMN color_hex VARCHAR(7),
    ADD CONSTRAINT ck_accounts_color CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9A-F]{6}$');

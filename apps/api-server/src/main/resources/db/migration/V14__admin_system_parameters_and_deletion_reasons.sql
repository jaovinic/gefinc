-- Painel administrativo (feature 005), parte 1: parâmetros do sistema editáveis e motivos de exclusão
-- de conta. Nenhuma das duas tabelas guarda dado financeiro nem dado pessoal. As sementes são
-- espelhadas em AdminSeed (testes): ao mudar uma, mude a outra.

-- Parâmetros editáveis em tempo de execução. Linha ausente = valor padrão (resiliência a TRUNCATE em
-- testes). Parâmetros somente leitura (validade de sessão, limites de login, carência) não são linhas.
CREATE TABLE system_parameters (
    key        VARCHAR(30)  PRIMARY KEY,
    value      VARCHAR(500) NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT ck_sp_key CHECK (key IN ('SIGNUPS_OPEN', 'MAINTENANCE_ENABLED', 'MAINTENANCE_MESSAGE')),
    CONSTRAINT ck_sp_bool CHECK (
        key NOT IN ('SIGNUPS_OPEN', 'MAINTENANCE_ENABLED') OR value IN ('true', 'false'))
);

INSERT INTO system_parameters (key, value) VALUES
    ('SIGNUPS_OPEN', 'true'),
    ('MAINTENANCE_ENABLED', 'false'),
    ('MAINTENANCE_MESSAGE', '');

-- Motivos que o administrador escolhe ao solicitar a exclusão de uma conta. A mensagem é genérica e é
-- a única coisa mostrada ao usuário (nunca a justificativa livre). Nunca há DELETE: motivo usado
-- fica protegido pela chave estrangeira do livro-razão e só é desativado.
CREATE TABLE deletion_reasons (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       VARCHAR(80)  NOT NULL,
    message    VARCHAR(500) NOT NULL,
    active     BOOLEAN      NOT NULL DEFAULT true,
    initial    BOOLEAN      NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_dr_name ON deletion_reasons (lower(name));

INSERT INTO deletion_reasons (name, message, active, initial) VALUES
    ('Solicitação do titular dos dados',
     'A exclusão desta conta foi realizada a pedido do titular dos dados.', true, true),
    ('Violação dos termos de uso',
     'Esta conta foi excluída por descumprimento dos termos de uso do serviço.', true, true),
    ('Determinação legal ou de autoridade',
     'Esta conta foi excluída em cumprimento a uma determinação legal ou de autoridade competente.',
     true, true),
    ('Outros motivos administrativos',
     'Esta conta foi excluída por motivos administrativos. Para mais informações, procure o suporte.',
     true, true);

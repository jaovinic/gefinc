# Operação do GEFINC

Pendências e orientações operacionais que ficam fora do código da primeira versão.

## Retenção de backups após a exclusão de conta

A exclusão de conta tem 30 dias de carência. Depois disso, o job diário apaga o usuário e todos os
seus dados do banco (`DELETE` em cascata). **Backups do banco continuam contendo esses dados** até
expirarem. Decisão operacional recomendada:

- Guardar backups por no máximo **35 dias**. Assim, 5 dias depois da eliminação (30 dias + 5), nenhum
  backup ainda contém os dados do usuário.
- Ao restaurar um backup, **reaplicar as exclusões** já concluídas depois da data do backup (executar o
  job de exclusão antes de reabrir a API ao público).
- Backups devem ficar criptografados e com acesso restrito à operação.

## Limitação de tentativas de login

O login (`/auth/login`) e o cancelamento de exclusão (`/auth/account-deletion/cancel`) compartilham
o mesmo limite de **tentativas que falharam**, em janela de 15 minutos:

- **5 falhas por e-mail** (sem diferenciar maiúsculas; vale igual para e-mail cadastrado ou não, para
  o `429` não revelar quais contas existem);
- **20 falhas por IP**.

Passou do limite, a API responde `429` com `Retry-After` **antes de conferir a senha**, inclusive se
ela estiver certa. Um login bem-sucedido zera a contagem do e-mail (a do IP não). Recuperação de senha
tem limite próprio (3 pedidos por hora por e-mail).

Pontos de atenção:

- **IP real atrás de proxy:** por padrão a API usa o IP da conexão. Atrás de proxy ou balanceador, defina
  `FORWARD_HEADERS_STRATEGY=native` para ler o `X-Forwarded-For`. Com a API exposta direto, mantenha
  `none`: senão o cabeçalho pode ser forjado para escapar do limite por IP. Sem isso, todos os usuários
  atrás do proxy dividiriam o mesmo IP e o limite de 20 falhas pegaria gente inocente.
- **Bloqueio por terceiros:** quem sabe o e-mail de alguém pode gastar as 5 tentativas e travar o login
  dessa pessoa por até 15 minutos. É a troca aceita por proteger contra adivinhação de senha; o
  bloqueio some sozinho.
- **Memória e uma instância:** as contagens ficam na memória da API; reiniciar zera e, com mais de uma
  instância, cada uma conta separado. Para escalar na horizontal, mover o contador para Redis ou tabela.
- Backlog: avisar o titular por e-mail depois de várias falhas seguidas.

## Logs

Os logs são estruturados (JSON em produção) e **não podem conter** e-mail, senha, tokens nem valores
financeiros (FR-003). O teste `LogRedactionIT` cobre isso com o app em TRACE e Spring Web, Spring
Security e SQL em DEBUG. Por isso:

- Não ligar `org.hibernate.orm.jdbc.bind`, `org.hibernate.orm.jdbc.extract` nem `org.postgresql` em
  TRACE em produção: esses loggers imprimem os valores de cada consulta.
- Os DTOs de requisição e resposta têm `toString()` com `[REDACTED]`; ao criar um novo, siga o mesmo padrão.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | Conexão com o PostgreSQL |
| `JWT_SECRET` | Segredo de assinatura dos tokens de acesso (mínimo de 32 caracteres, único por ambiente) |
| `SMTP_HOST`, `SMTP_PORT` | Servidor de e-mail da recuperação de senha |
| `APP_BASE_URL` | Endereço do web, usado nos links de e-mail e no CORS |
| `MAIL_FROM` | Remetente dos e-mails |
| `DB_PORT` | Porta do PostgreSQL local no Docker Compose (padrão 5432) |

Trocar o `JWT_SECRET` encerra todas as sessões abertas (os tokens de acesso deixam de valer).

## Teste de carga

O script `apps/api-server/loadtest/concurrent-users.js` (k6) simula 1.000 usuários simultâneos
(SC-008). Rode sob demanda e antes de releases, contra um ambiente parecido com o de produção; as
instruções estão no cabeçalho do script.

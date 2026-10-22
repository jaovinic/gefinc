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

## Limitação de tentativas de login (backlog)

Hoje só a recuperação de senha tem limite (3 pedidos por hora por e-mail, resposta idêntica para
e-mails desconhecidos). O login **não** limita tentativas; as defesas atuais são a senha forte
(mínimo de 10 caracteres), o BCrypt e a resposta idêntica para e-mail inexistente e senha errada.

Melhoria planejada, ainda sem prazo:

- limite por e-mail e por IP (ex.: 5 falhas em 15 minutos), com `429` e `Retry-After`;
- contador compartilhado (Redis ou tabela) para funcionar com mais de uma instância da API;
- avisar o titular por e-mail depois de várias falhas seguidas.

Enquanto isso não existe, recomenda-se limitar `/auth/login` no proxy ou balanceador (rate limit por IP).

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

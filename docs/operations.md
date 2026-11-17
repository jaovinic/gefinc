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

- **IP real atrás de proxy e isolamento seguro:** por padrão a API usa o IP direto da conexão TCP.
  Atrás de proxies ou túneis (como Cloudflare Tunnel ou Caddy), mantenha `FORWARD_HEADERS_STRATEGY=none`
  para que a API não confie cegamente em `X-Forwarded-For` forjável. A API lê o cabeçalho configurado
  (`CLIENT_IP_HEADER`, padrão `CF-Connecting-IP`) **exclusivamente** quando a conexão física provém de um
  endereço listado em `TRUSTED_PROXY_CIDRS` (ex.: o IP fixo do container `cloudflared` na rede Docker,
  `172.28.0.10/32`). Se a requisição não vier de um proxy confiável, cabeçalhos de encaminhamento são
  ignorados e o IP real da conexão direta é preservado. Sem configurar o proxy confiável, todos os clientes
  compartilhariam o mesmo IP do túnel e o limitador de 20 falhas bloquearia múltiplos usuários legítimos.
- **Bloqueio por terceiros:** quem sabe o e-mail de alguém pode gastar as 5 tentativas e travar o login
  dessa pessoa por até 15 minutos. É a troca aceita por proteger contra adivinhação de senha; o
  bloqueio some sozinho.
- **Memória e uma instância:** as contagens ficam na memória da API; reiniciar zera e, com mais de uma
  instância, cada uma conta separado. Para escalar na horizontal, mover o contador para Redis ou tabela.
- **Retirar o bloqueio pelo painel:** o administrador pode liberar o login de um e-mail na hora (zera só
  a contagem do e-mail, nunca a do IP); a ação é auditada.
- Backlog: avisar o titular por e-mail depois de várias falhas seguidas.

## Sessões de autenticação

Cada login abre uma sessão em `auth_sessions` (uma por família de tokens de renovação) com o IP, um
rótulo grosseiro do dispositivo ("Chrome em Windows") e o tipo de cliente. São dado pessoal: aparecem só
no painel administrativo e somem junto com o usuário. O token de acesso leva a claim `sid`; a API confere
a sessão a cada requisição (uma consulta por chave primária, sem escrita), então encerrar uma sessão, todas
ou suspender a conta vale na requisição seguinte. A validade da sessão desliza a cada renovação. Um job
diário (3h45, America/Sao_Paulo) remove as sessões expiradas ou encerradas há mais de **30 dias**.
Tokens de acesso emitidos antes das sessões existirem (sem `sid`) valem até expirar (15 minutos).

## Logs

Os logs são estruturados (JSON em produção) e **não podem conter** e-mail, senha, tokens nem valores
financeiros (FR-003). O teste `LogRedactionIT` cobre isso com o app em TRACE e Spring Web, Spring
Security e SQL em DEBUG. Por isso:

- Não ligar `org.hibernate.orm.jdbc.bind`, `org.hibernate.orm.jdbc.extract` nem `org.postgresql` em
  TRACE em produção: esses loggers imprimem os valores de cada consulta.
- Os DTOs de requisição e resposta têm `toString()` com `[REDACTED]`; ao criar um novo, siga o mesmo padrão.

## Aplicativo móvel: dados locais, offline, biometria e lembretes

- **Idempotência:** as operações do modo offline aceitam o cabeçalho `Idempotency-Key` (UUID): `POST
  /transaction-groups`, `POST /transactions/{id}/pay` e `/unpay`, `PATCH /transactions/{id}`, `PUT` e `DELETE
  /transaction-groups/{id}` (o `?confirm=true` não faz parte da identidade) e `POST /transaction-groups/{id}/amount-changes`
  e `/end` (estas duas o app ainda não enfileira), além de `POST /transfers` e `PUT`/`DELETE /transfers/{id}`
  (transferências entre contas exigem conexão: o app não as enfileira, mas reenvia a mesma chave). As chaves ficam na tabela `idempotency_keys` por **7 dias** (job
  diário às 3h30) e valem por usuário. Reprocesso de uma chave devolve a resposta original com `Idempotent-Replayed:
  true` (inclusive o `204` da exclusão e o `200` de uma edição, sem `409 STALE_VERSION` nem `404` falsos); a mesma
  chave com outro verbo, caminho ou corpo é `422 IDEMPOTENCY_KEY_REUSED`; reserva sem conclusão há mais de 2
  minutos é considerada abandonada. Uma operação que ficou na fila do aparelho **mais de 7 dias** deixa de ser
  reconhecida como repetição: se a resposta de uma tentativa anterior tiver se perdido, ela pode ser aplicada de novo
  (o app avisa na pendência a partir de 6 dias).
- **Dados no aparelho:** a cópia local das leituras (até 20 MB, IndexedDB) e a fila de operações pendentes
  ficam **cifradas** com AES-GCM; a chave de 256 bits fica no Keystore (Android) ou Keychain (iOS). Sair da
  conta ou excluí-la apaga cópia, fila, preferências, chave e lembretes agendados. Se a sessão expirar sem
  o usuário sair, só a cópia é apagada: a fila e a chave ficam para o mesmo usuário continuar.
- **Consulta sem conexão (cópia local):** toda leitura da API (menos `/auth`) é guardada pela URL completa,
  cifrada e separada por usuário. Sem conexão, a tela usa a cópia e a faixa do topo mostra a data da
  última sincronização. Se a rede estiver "conectada" mas não responder em ~3 s, uma leitura que tem cópia é
  respondida pela cópia e o pedido segue vivo em segundo plano (até 60 s, um por endereço): se chegar, renova a
  cópia e, havendo diferença, as telas recarregam (leitura sem cópia espera a rede; escritas nunca têm esse limite).
- **Aquecimento da cópia:** depois do login, ao voltar ao primeiro plano e ao reconectar (no máximo a cada 15
  min, só com rede, desbloqueado e logado, uma requisição por vez e em ociosidade), o app busca contas
  (inclusive inativas), categorias, saldos, painel, lançamentos (1ª página, 25 itens) e fluxo de caixa do mês
  corrente, e a fatura e a projeção de cada cartão (até 6), com os mesmos parâmetros das telas. Meses e
  filtros que o usuário ainda não abriu só existem sem conexão se ele os abriu antes com rede. A volta da
  conexão também reagenda o envio da fila quando o aparelho segue "conectado" mas a API não responde
  (espera de 2 s, dobrando até 60 s).
- **O que se faz sem conexão:** consultar (cópia local), **lançar** (avulso, fixo e parcelado), **pagar e desfazer**,
  **editar valor e vencimento** de um lançamento que já existe no servidor e **excluir** um lançamento (grupo). Cada
  operação vai para a fila cifrada e sai na ordem em que foi feita, com a mesma `Idempotency-Key` em todas as
  tentativas. O que **não** se faz: contas e categorias (criar, editar, excluir), pagar fatura, alterar valor
  "daqui" e encerrar lançamento fixo, excluir a conta, recuperar senha, e **editar ou excluir um lançamento criado
  sem conexão e ainda não enviado** (os botões ficam desligados até o envio; a edição desses itens é uma evolução
  futura). Essas ações dizem "Esta ação precisa de conexão" e não perdem o que foi digitado.
- **Editar e excluir offline:** a lista mostra o efeito por cima da cópia local (valor, vencimento, pagamento; o
  excluído sai da lista, preservando o que já estava pago, como o servidor) e marca o item com "Pendente de envio".
  Painel, faturas, saldos e fluxo de caixa **não** incluem as pendências (o aviso do topo diz isso). Duas edições
  seguidas do mesmo lançamento, ainda não enviadas, viram uma só (vale a última). Depois de cada edição aplicada, a
  `version` nova devolvida pelo servidor passa às edições seguintes do mesmo registro. Excluir sem conexão não
  consulta o impacto (leitura que precisa de rede): a confirmação avisa que a exclusão "será aplicada quando a
  conexão voltar" e o servidor aplica a regra de sempre. Se o registro mudou em outro aparelho (`409
  STALE_VERSION`) ou o servidor recusar por outro motivo, a operação vai para **Pendências de envio** com o motivo;
  nada sobrescreve dados do servidor em silêncio, e a resolução de conflitos (comparar e escolher) é evolução
  futura. Excluir algo que já não existe (`404`) conta como feito.
- **Envio da fila:** sai quando a conexão volta, ao abrir/voltar ao app, em "Sincronizar agora" e **na hora** em que
  uma escrita é enfileirada por falha de rede com o aparelho ainda "conectado". Cada tentativa tem limite de 30 s: se a
  rede "conectada" não responder, a tentativa é abortada, a operação volta a pendente e o envio é repetido com espera
  de 2 s dobrando até 60 s (a chave de idempotência impede duplicata). Erros 4xx definitivos ficam como recusadas.
- **Mensagens das telas:** *Sem conexão* (ícone de wifi cortado, "Tentar novamente") = sem rede e sem cópia
  daquela tela (`OFFLINE_NO_DATA`). *Sem lançamentos/Nenhuma conta... na última sincronização (dd/MM HH:mm)* =
  a cópia local estava vazia naquele momento; pode haver dados novos em outro aparelho, que só chegam ao
  reconectar. *Sem lançamentos neste mês* (sem data) = dado atual do servidor. "Esta ação precisa de conexão"
  = escrita fora da fila (contas, categorias, pagar fatura etc.). Em *Novo lançamento* sem conexão o aviso é
  "Salvo no aparelho; será enviado quando houver conexão".
- **Avisos às telas (`dataChanged`):** envio da fila, aquecimento e leituras tardias avisam as telas para recarregar; os
  avisos são coalescidos (o primeiro é imediato, os seguintes dentro de 1,5 s viram um só no fim da janela). A recarga
  depois de uma ação do próprio usuário não passa por esse aviso e é imediata.
- **Lembretes:** são notificações **locais**, agendadas no aparelho a partir de `GET /due-summary` (só
  contagens, sem valores nem nomes). Só se atualizam quando o app abre, sincroniza ou muda algo; um item
  pago em outro aparelho continua a avisar até a próxima abertura. Limite de 35 avisos agendados (o iOS
  aceita 64). No Android 12+ usam alarme inexato (pode atrasar alguns minutos). Push remoto (Firebase e
  APNs) exigiria contas externas e não está incluído.
- **Biometria:** só destrava a tela e a sessão já guardada; nunca vai ao servidor. O app não oculta o
  conteúdo na visão de aplicativos recentes nem bloqueia capturas de tela (decisão do usuário).
- **iOS:** o projeto está sincronizado (plugins no `Package.swift`, `NSFaceIDUsageDescription` no
  `Info.plist`), mas **não foi compilado nem testado em aparelho** porque exige um Mac com Xcode: pendência
  conhecida até haver acesso a um Mac.

## Contas PF/PJ, cartões vinculados e marca

- **Migração V7:** acrescenta `holder_type`, `icon` e `bank_account_id` em `accounts`. As contas bancárias
  existentes viram **PF**; cartões existentes ficam **sem conta vinculada** (continuam funcionando, aparecem com o
  aviso "vincule a uma conta bancária" e só exigem o vínculo quando forem editados). Dinheiro e cartões não têm
  titular: o selo PF/PJ do cartão é o da conta vinculada. O teste `AccountMigrationV7IT` migra dados antigos até a V7.
- **Compatibilidade:** os campos novos da API são aditivos; a cópia local de um app desatualizado (sem titular,
  ícone ou vínculo) é lida como PF, ícone padrão do tipo e cartão sem vínculo.
- **Marca:** logo, favicons, manifesto, ícones do Android/iOS e telas de abertura saem de
  `packages/ui-shared/src/brand/gefinc-symbol.svg` por `npm run brand:generate` (Chromium do Playwright). Para trocar
  o logo, substitua os SVG e rode o comando; os arquivos gerados são versionados. O ícone de notificação dos lembretes
  (`ic_stat_gefinc`) continua sendo o sino monocromático. No iOS, só o `AppIcon-512@2x.png` e as imagens de abertura
  são gerados; o build em iPhone segue pendente de um Mac.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | Conexão com o PostgreSQL |
| `JWT_SECRET` | Segredo de assinatura dos tokens de acesso (mínimo de 32 caracteres, único por ambiente) |
| `PSEUDONYM_SECRET` | Segredo HMAC para pseudonimização de identificadores (mínimo de 32 bytes, obrigatório em produção, único por ambiente; não rotacionar) |
| `FORWARD_HEADERS_STRATEGY` | Estratégia de cabeçalhos de rede (`none` em produção isolada atrás de túnel/proxy fixo) |
| `TRUSTED_PROXY_CIDRS` | Lista de faixas CIDR de proxies confiáveis autorizados a repassar o IP do cliente (ex.: `172.28.0.10/32`) |
| `CLIENT_IP_HEADER` | Cabeçalho HTTP do IP real repassado pelo proxy confiável (padrão `CF-Connecting-IP`) |
| `SMTP_HOST`, `SMTP_PORT` | Servidor de e-mail da recuperação de senha (padrão de dev: `localhost:1025`, Mailpit) |
| `SMTP_USER`, `SMTP_PASSWORD` | Login e chave SMTP do provedor (segredos: só no `.env` do servidor, nunca versionados nem em logs) |
| `SMTP_AUTH` | `true` para autenticar no servidor SMTP (padrão `false`; o compose de produção usa `true`) |
| `SMTP_STARTTLS` | `true` para exigir STARTTLS (padrão `false`; o compose de produção usa `true`). Ligado, o envio falha em vez de seguir sem TLS |
| `APP_BASE_URL` | URL pública do front, **sem barra final**; usada nos links de e-mail e no CORS. Obrigatória em produção |
| `MAIL_FROM` | Remetente dos e-mails. Obrigatório em produção; precisa ser um remetente validado no provedor |
| `DB_PORT` | Porta do PostgreSQL local no Docker Compose (padrão 5432) |

Trocar o `JWT_SECRET` encerra todas as sessões abertas (os tokens de acesso deixam de valer).

### E-mail de redefinição de senha em produção (Brevo)

> **Atenção, mudança incompatível (migração obrigatória).** `SMTP_HOST`, `MAIL_FROM` e `APP_BASE_URL` passaram a
> ser **obrigatórios** no `docker-compose.selfhost.yml` (e no compose do guia da Oracle): sem eles o
> `docker compose up` aborta. Antes do próximo `docker compose up` (ou `up -d --build`), atualize o `.env` do
> servidor com `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASSWORD`,
> `SMTP_AUTH=true`, `SMTP_STARTTLS=true`, `MAIL_FROM` e `APP_BASE_URL`. Os padrões antigos (`localhost:1025`
> e remetente `no-reply@gefinc.local`) não existem mais em produção; sem a atualização o deploy não sobe.
> Apenas o ambiente de desenvolvimento continua usando os padrões de Mailpit (sem login nem TLS).

O `docker-compose.selfhost.yml` exige `SMTP_HOST`, `MAIL_FROM` e `APP_BASE_URL` (o `docker compose` aborta se
faltarem) e não usa mais `localhost` nem `meudominio.com` como padrão. Configuração no `.env` do servidor:

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<login SMTP gerado no painel do Brevo>
SMTP_PASSWORD=<chave SMTP gerada no painel do Brevo>
SMTP_AUTH=true
SMTP_STARTTLS=true
MAIL_FROM=<remetente validado no Brevo>
APP_BASE_URL=<URL pública do front, sem barra final>
```

- O login e a chave SMTP vêm do painel do Brevo (SMTP & API > SMTP); não são o e-mail da conta nem a chave de API.
- Sem `SMTP_USER`/`SMTP_PASSWORD`/`SMTP_AUTH=true`, o Brevo recusa o envio com `530 Authentication required`.
- O domínio do remetente precisa estar autenticado no Brevo (registros SPF, DKIM e DMARC no DNS) e o remetente
  validado; caso contrário o e-mail é recusado ou cai em spam.
- A API responde `202` ao pedido de redefinição mesmo quando o envio falha (evita revelar quais e-mails existem).
- O e-mail é enviado **de forma assíncrona, depois do commit** da transação que grava o link: a resposta não
  espera o SMTP e, se a transação desfizer, nada é enviado. O envio roda num executor dedicado (2 threads, fila
  de 100; se a fila encher, o e-mail é descartado com um aviso no log).
- **O envio é best-effort.** E-mails em fila ou em re-tentativa podem se perder em reinício, deploy ou queda do
  servidor (a fila é só em memória). Nesse caso basta o usuário solicitar a redefinição novamente (limite de 3
  pedidos por hora por e-mail). O serviço `api-server` usa `stop_grace_period: 40s` nos composes, para o
  encerramento aguardar até 30 s pelos envios pendentes antes de o Docker enviar `SIGKILL`; ainda assim não há
  garantia de entrega.
- **Descartes**: quando a fila está cheia ou o servidor está encerrando, o e-mail é descartado com um WARN
  (`E-mail descartado: fila de envio cheia` ou `E-mail descartado: servidor em encerramento`), sem e-mail nem
  token no log. Cada descarte também incrementa o contador interno `gefinc.mail.dropped` (rótulo `reason`:
  `queue_full` ou `shutdown`) e cada falha final de envio incrementa `gefinc.mail.failed` (rótulo `reason`:
  `permanent_rejection`, `authentication`, `retries_exhausted`, `other` ou `interrupted`). Os contadores são
  Micrometer, sem dependência nova, e **não são expostos**: o actuator publica apenas `health` e `info`. Use os
  logs (WARN/ERROR) para alertas.
- Falhas transitórias de envio (`MailSendException`, como timeout ou conexão recusada) são re-tentadas até 3
  vezes, com espera crescente (1 s, 2 s); falha de autenticação (`MailAuthenticationException`, chave SMTP errada)
  e rejeição permanente do destinatário ou do servidor (resposta SMTP 5xx, como `550 mailbox unavailable`) não
  são re-tentadas, e respostas 4xx continuam sendo re-tentadas. Há timeouts de 10 s de conexão, leitura e escrita no SMTP.
- A resposta é sempre `202` com o mesmo corpo, exista a conta ou não. Resta uma diferença de tempo de
  milissegundos entre conta existente (que grava o link no banco) e inexistente; ela é conhecida e aceita,
  porque o envio do e-mail é assíncrono, fora da requisição, e não depende do SMTP.
- As falhas ficam só no log da aplicação (`docker compose logs api-server`): procure por
  `Falha ao enviar e-mail de redefinição de senha após N tentativa(s)` (nível ERROR, uma por pedido), que traz a
  classe da exceção e a causa raiz resumida, sem o e-mail do destinatário, o link nem segredos. As tentativas
  intermediárias aparecem como `Falha transitória ao enviar e-mail de redefinição de senha` (WARN).

## Segredo de pseudonimização (`PSEUDONYM_SECRET`)

O segredo de pseudonimização é uma chave simétrica usada para derivar HMACs (SHA-256) de identificadores
pseudonimizados persistidos em logs de auditoria e tabelas de conformidade:
- Identificadores de contas anonimizadas pós-exclusão (`anônimo-<8 hex>`);
- Hashes de rastreabilidade de dispositivos e clientes (`client_ref`);
- Hashes transitórios de validação de códigos (como os de troca de e-mail).

Diretrizes operacionais obrigatórias:
- **Tamanho mínimo:** deve ter **pelo menos 32 bytes** de entropia (recomendado: 48 bytes em base64, gerado
  com `openssl rand -base64 48`). A API recusa iniciar se o segredo for mais curto ou ausente.
- **Armazenamento:** guarde junto às credenciais de banco e ao `JWT_SECRET` no arquivo `.env` do servidor
  (permissão `600`), nunca em controle de versão nem em logs.
- **Não rotacionar:** o segredo **não deve ser rotacionado** em operação normal. A rotação altera o hash HMAC
  gerado para um mesmo titular ou requisição, desvinculando novos registros de auditoria dos eventos passados
  e quebrando a correlação legítima exigida por auditorias.
- **Procedimento em caso de vazamento:** se o `PSEUDONYM_SECRET` for comprometido juntamente com acesso de leitura
  à base de dados, um invasor que possua uma lista externa de e-mails de titulares pode recalcular os hashes e
  reidentificar contas no histórico de auditoria. Caso ocorra vazamento comprovado:
  1. Gere imediatamente uma nova chave (`openssl rand -base64 48`);
  2. Atualize o `.env` no servidor de produção e reinicie o contêiner `api-server`;
  3. Registre formalmente o incidente na governança de segurança, ciente de que as novas ações pseudonimizadas
     passarão a ter identificadores gerados sob a nova chave, preservando os registros antigos inalterados no banco.

## Administrador raiz e recuperação de acesso

O papel `ROOT` possui salvaguardas invioláveis pelo painel administrativo (não pode ser suspenso, rebaixado,
excluído, ter e-mail alterado nem ter sessões encerradas por outros administradores). Não existe endpoint na
API para criar ou promover o primeiro administrador raiz: ele nasce **direto no banco de dados**, garantindo que
a concessão de privilégio máximo exija acesso direto à infraestrutura do servidor.

### Procedimento para criar o primeiro administrador raiz

1. Crie uma conta comum através da tela de cadastro (`/register` ou `POST /auth/register`).
2. Acesse o servidor e execute o script operacional seguro:
   ```bash
   tools/ops/promote-root.sh dono@exemplo.com
   ```
   O script confere a existência da conta, exibe o usuário e papel atual, solicita confirmação (`--yes` dispensa)
   e roda a transação protegida.

3. Alternativamente, execute via SQL nativo no cliente `psql` (o banco possui um gatilho de proteção que exige
   a variável local de transação `gefinc.allow_root_change`):
   ```bash
   docker compose exec -T postgres psql -U gefinc -d gefinc -v ON_ERROR_STOP=1 -v email='dono@exemplo.com' <<'SQL'
   BEGIN;
   SET LOCAL gefinc.allow_root_change = 'on';
   UPDATE users SET role = 'ROOT' WHERE lower(email) = lower(:'email') RETURNING id;
   COMMIT;
   SQL
   ```
   > Tentativas de alterar a coluna `role` para/de `ROOT` sem `SET LOCAL gefinc.allow_root_change = 'on'` são
   > bloqueadas pelo gatilho do banco (`trg_protect_root_user`) com erro `42501 (permissão negada)`.

### Procedimento para recuperação de acesso de administrador

Se um administrador for suspenso por engano ou tiver o acesso bloqueado e não houver outro administrador
ativo para reativá-lo pelo painel, o titular com acesso ao servidor pode recuperar a conta via banco:
```bash
docker compose exec -T postgres psql -U gefinc -d gefinc -v ON_ERROR_STOP=1 -v email='admin@exemplo.com' <<'SQL'
BEGIN;
SET LOCAL gefinc.allow_root_change = 'on';
UPDATE users SET suspended_at = NULL, token_version = token_version + 1 WHERE lower(email) = lower(:'email') RETURNING id;
COMMIT;
SQL
```
O incremento de `token_version` invalida tokens residuais e exige novo login com as credenciais válidas.

## Políticas de retenção de dados e expurgo

O sistema aplica políticas rigorosas de retenção e expurgo programado para atender ao princípio de minimização
de dados da LGPD (Lei Geral de Proteção de Dados):

- **Contas excluídas:** carência de 1 a 30 dias (ou modo imediato solicitado por administrador com confirmação).
  O `AccountDeletionJob` remove todos os dados do usuário em cascata e substitui identificadores por
  `anônimo-<8 hex>` nos registros de auditoria mantidos.
- **Backups do banco de dados:** guardados por no máximo **35 dias**, garantindo que nenhum backup contenha
  dados pessoais 5 dias após a exclusão de uma conta com carência de 30 dias.
- **Histórico de envios de e-mail (`email_deliveries`):** mantido por **90 dias**. O job diário
  `EmailDeliveryPurgeJob` remove registros mais antigos sem afetar comunicações pendentes.
- **IPs de visitantes em logs de auditoria (`audit_log_client.ip`):** mantidos por **90 dias**. O job diário
  `AuditClientPurgeJob` zera o IP em claro de tentativas anônimas/visitantes, preservando a linha de auditoria
  e o hash `client_ref` (SC-021).
- **Endereço retido de comunicações pendentes (`pending_communications.retained_email`):** mantido por no máximo
  **30 dias** após a remoção física da conta. O job diário `PendingCommunicationExpiryJob` descarta o endereço retido.
- **Sessões de autenticação (`auth_sessions`):** mantidas por **30 dias** após encerramento ou expiração.
  O job diário `AuthSessionCleanupJob` remove as sessões vencidas.

## Rotinas agendadas (os 6 jobs do sistema)

A API executa 6 jobs periódicos agendados via Spring `@Scheduled` para garantir a integridade dos dados e o cumprimento das políticas de retenção:

| Job | Frequência | Horário / Expressão Cron | Função Principal |
|---|---|---|---|
| `AccountDeletionJob` | A cada 5 minutos | `0 */5 * * * *` | Executa exclusões de contas vencidas (`due_at <= now()`), remoção em cascata e anonimização em `audit_log`. |
| `InvitationExpiryJob` | A cada hora | `0 0 * * * *` | Transiciona convites pendentes vencidos (> 7 dias) para `EXPIRED` e zera o e-mail em claro (`ck_inv_email`). |
| `EmailDeliveryPurgeJob` | Diário | `0 0 3 * * *` (3h00) | Expurga do histórico de envios (`email_deliveries`) registros com mais de 90 dias de retenção. |
| `AuditClientPurgeJob` | Diário | `0 15 3 * * *` (3h15) | Zera o IP em claro em `audit_log_client` de registros de visitantes com mais de 90 dias, mantendo o `client_ref`. |
| `PendingCommunicationExpiryJob` | Diário | `0 30 3 * * *` (3h30) | Descarta comunicações pendentes de contas já excluídas retidas há mais de 30 dias, limpando o e-mail retido. |
| `AuthSessionCleanupJob` | Diário | `0 45 3 * * *` (3h45) | Remove registros de sessões expiradas ou revogadas há mais de 30 dias em `auth_sessions`. |

*(Nota: fora do módulo administrativo, o sistema mantém ainda `IdempotencyCleanupJob` às 3h30 para expurgo de chaves offline com mais de 7 dias e `FixedRecurrenceJob` para lançamentos recorrentes).*

## Limitadores de taxa em memória (instância única, R13)

Os limites de taxa protegem o sistema contra força bruta e abusos:
- **Tentativas de login:** 5 falhas por e-mail, 20 falhas por IP (janela deslizante de 15 minutos).
- **Ações administrativas destrutivas:** 10 requisições por 15 minutos por administrador (exclusão de usuários, revogação global de sessões).
- **Recuperação de senha:** 3 solicitações por hora por e-mail.
- **Operação em instância única (R13):** os limitadores são gerenciados em memória (`PerKeyRateLimiter`) via
  `ConcurrentHashMap` com limpeza periódica de entradas expiradas. O estado é volátil e zera em reinícios da API.
  Em arquiteturas de alta disponibilidade com múltiplas instâncias distribuídas, a coordenação de taxa deve ser
  migrada para Redis ou tabela com expiração atômica.

## Modo de manutenção e fechamento de cadastros

Parâmetros operacionais configuráveis no painel administrativo (`/admin/parameters`) ou via endpoint:
- **`MAINTENANCE_ENABLED` (`true`/`false`):** ativa o modo de manutenção global. Quando ativo, o filtro servlet
  `MaintenanceFilter` intercepta todas as requisições de usuários comuns (`ROLE_USER`) e visitantes, respondendo
  imediatamente `503 Service Unavailable` RFC 7807 (`code=MAINTENANCE`, cabeçalho `Retry-After: 300` e mensagem
  em `extras.message`).
  - **Isenções:** administradores (`ADMIN` e `ROOT`) operam normalmente em todas as rotas; requisições CORS
    preflight (`OPTIONS`), `/actuator/health/**`, `/system/status`, `/auth/password-reset/**` e `/auth/logout`
    permanecem sempre abertas.
  - **Comportamento cliente:** a web exibe banner informativo; o aplicativo móvel exibe a barra de aviso no topo e
    preserva integralmente as operações da fila offline em modo `PENDING` sem descartar alterações.
- **`MAINTENANCE_MESSAGE` (até 280 caracteres):** mensagem explicativa customizada exibida para os usuários.
- **`SIGNUPS_OPEN` (`true`/`false`):** quando desativado, recusa novos cadastros por conta própria (`POST /auth/register`
  responde `403 SIGNUPS_CLOSED`), mas preserva a possibilidade de aceitar convites emitidos por administradores.

## Teste de carga

O script `apps/api-server/loadtest/concurrent-users.js` (k6) simula 1.000 usuários simultâneos
(SC-008). Rode sob demanda e antes de releases, contra um ambiente parecido com o de produção; as
instruções estão no cabeçalho do script.

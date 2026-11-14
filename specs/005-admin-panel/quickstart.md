# Quickstart: painel administrativo

Roteiro para validar a feature depois de implementada. O ambiente base é o da feature 001 (`specs/001-personal-finance-management/quickstart.md`) e o do
app, o da 002. Não há tela nem endpoint para criar o primeiro administrador: ele nasce **no banco** (FR-003).

## Pré-requisitos

- Node 24, Java 21, Docker; para o app, Android SDK e aparelho com depuração USB.
- **Infraestrutura de e-mail da branch `fix/smtp-brevo-async-reset-mail` já mesclada na `main`** e esta branch atualizada (`git merge main`); ver `research.md` D1.
  Em desenvolvimento o Mailpit (`localhost:8025`) recebe tudo; não precisa de Brevo.
- Variáveis novas (já com valores de desenvolvimento no `application-local.yml`/`.env.example`): `PSEUDONYM_SECRET` (≥ 32 bytes, **obrigatório em produção**),
  `TRUSTED_PROXY_CIDRS` (vazio em desenvolvimento = nunca confia no cabeçalho de IP), `CLIENT_IP_HEADER` (padrão `CF-Connecting-IP`).
- Banco e API (`DB_PORT=5433` se a 5432 estiver ocupada):

```bash
DB_PORT=5433 docker compose up -d postgres mailpit
cd apps/api-server && DB_PORT=5433 ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
npx nx serve web-app
```

## Criar o administrador raiz (roteiro do dono da implantação)

1. Cadastre uma conta normalmente em `http://localhost:4200/register` (ex.: `dono@exemplo.com`).
2. Marque-a como raiz **no banco** (única forma; a transação precisa do `SET LOCAL`, senão o gatilho recusa):

```bash
docker compose exec -T postgres psql -U gefinc -d gefinc -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL gefinc.allow_root_change = 'on';
UPDATE users SET role = 'ROOT' WHERE lower(email) = lower('dono@exemplo.com');
COMMIT;
SQL
```

   (ou `tools/ops/promote-root.sh dono@exemplo.com`). Na próxima requisição a conta vê o grupo **Administração** no menu lateral. O mesmo roteiro, com `suspended_at = NULL` e
   `token_version = token_version + 1`, recupera um administrador comum suspenso por engano (`docs/operations.md`, seção "Administrador raiz e recuperação de acesso").
3. Prova de que a trava existe: repetir o `UPDATE` **sem** o `SET LOCAL` deve falhar com `permissão negada` (`42501`).

## Produção (Cloudflare Tunnel)

`docker-compose.selfhost.yml`: `FORWARD_HEADERS_STRATEGY=none`, sub-rede fixa em `gefinc-net`, IP fixo do `cloudflared` e `TRUSTED_PROXY_CIDRS=<ip do cloudflared>/32`. Conferir no painel
(Auditoria) que um acesso negado de teste registra o **seu IP real** e que `curl -H 'CF-Connecting-IP: 1.2.3.4' http://api:8080/...` de dentro de outro contêiner **não** muda o IP gravado.

## Testes automatizados

```bash
npx nx run-many -t lint test build
cd apps/api-server && DB_PORT=5433 ./mvnw test      # inclui os ITs do painel (lista em plan.md), de isolamento e de migração V14-V20
npx nx e2e web-app-e2e                               # suítes admin-*.spec.ts + axe + teclado
npx nx e2e mobile-app-e2e                            # aviso de exclusão administrativa e manutenção com fila offline preservada
```

Os E2E do painel criam o raiz com o mesmo comando do roteiro (`promoteToRoot(email)` em `apps/web-app-e2e/src/support.ts`) e leem e-mails no Mailpit.

## Roteiro manual (web; app onde indicado)

1. **Acesso restrito (US1)**: com usuário comum, não há menu de administração; abrir `/admin` redireciona para `/`; chamar `GET /api/v1/admin/users` com o token dele responde `403`. Sem login, `401`.
   Em **Auditoria**, aparece **um** registro `ACCESS_DENIED` por janela de 15 min (repita várias vezes: não multiplica). Conceder o perfil a outro usuário (pede senha) e retirá-lo; tentar rebaixar o raiz,
   suspendê-lo, excluí-lo, trocar o e-mail, forçar redefinição ou encerrar sessões: todas recusadas, com a recusa na auditoria. Com um único administrador, retirar o próprio perfil é recusado.
2. **Usuários (US2)**: lista paginada, busca por parte do e-mail/nome sem acento (`joao` encontra `João`), filtros por situação, ordenação; abrir o detalhe (a abertura aparece na auditoria; a lista não);
   nenhum dado financeiro em lugar nenhum; não há botão de exportar.
3. **Suspender/sessões (US3)**: logar o usuário de teste em dois navegadores; suspender com motivo; a próxima requisição dele cai e o login mostra "procure o suporte" (sem opção de reativar); a lista de sessões
   mostra início, último uso, IP e dispositivo. Reativar. Encerrar **uma** sessão: só ela cai. Errar a senha 5 vezes e usar "Retirar bloqueio".
4. **Redefinição (US4)**: reenviar e forçar redefinição; o e-mail chega só ao usuário (Mailpit); a senha antiga deixa de valer. Derrubar o SMTP (`docker compose stop mailpit`) e repetir: o painel mostra a falha e a ação não conclui.
5. **Auditoria (US5)**: filtros por período, administrador, ação e alvo; abrir um registro (motivo e resumo, sem senha/token/link/código); não há editar/apagar.
6. **Saúde e uso (US6)**: visão geral abre em < 3 s; "Operacional" para aplicação e banco; contagens por dia; "Atualizar" muda a hora da leitura; nenhum valor em reais.
7. **E-mail (US7)**: configuração sem senha; e-mail de teste ao próprio administrador; histórico dos últimos 90 dias com filtros; reenviar uma redefinição que falhou. Com o SMTP fora do ar, cancelar uma exclusão gera
   **alerta permanente** em todas as telas; subir o SMTP, reenviar (alerta some) ou descartar (auditado).
8. **Parâmetros/manutenção (US8)**: fechar cadastros (cadastro recusado; convite pendente ainda aceita); ativar manutenção com mensagem: usuário comum vê o aviso e é barrado na próxima requisição, o raiz continua;
   **redefinição de senha segue**, aceite de convite é recusado; no **app**, com alterações offline pendentes, a faixa de manutenção aparece e a fila é enviada depois. Encerrar todas as sessões (digitar `ENCERRAR` + senha): o raiz e
   o administrador que acionou permanecem.
9. **Convites e edição (US9)**: convidar, abrir o link (Mailpit), definir a senha e entrar; reenviar invalida o link anterior; convite expirado mostra a mensagem. Editar o nome (imediato). **Trocar o e-mail**: o código de 6 dígitos
   chega ao **novo** endereço (Mailpit), é digitado na tela do painel; antes disso o e-mail antigo continua entrando; código errado 5 vezes invalida; cancelar descarta; o código nunca aparece na tela, auditoria ou histórico.
10. **Exclusão (US10)**: com motivo, justificativa (aviso para não escrever dados pessoais), prazo (imediato ou 1–30 dias), digitando o e-mail e a senha. Com prazo: usuário recebe o e-mail (prazo + mensagem genérica, **sem** a
    justificativa) e vê o aviso ao tentar entrar, **sem** botão de cancelar; o administrador cancela e o usuário vê o aviso de cancelamento uma única vez. Antecipar uma exclusão agendada pelo usuário e cancelar a antecipação: a conta
    volta à data original dele. Conta suspensa continua suspensa após cancelar. Imediata com SMTP fora do ar: a exclusão prossegue e surge o alerta permanente. Após executar: nenhum e-mail/nome/IP do usuário na auditoria nem no
    histórico de envios (só `anônimo-…`), e a justificativa permanece.
11. **Motivos (US11)**: criar motivo (mensagem com e-mail ou número de documento é recusada), editar sem alterar exclusões em andamento, desativar/reativar; o último ativo não desativa; não existe apagar.
12. **Aviso no app (US12)**: no web e no app (mesma tela de entrada), exclusão com prazo pedida pelo administrador mostra prazo + motivo genérico + suporte, sem cancelar; imediata não tem janela; aviso de cancelamento aparece uma vez.

## Verificações operacionais

- **Retenção**: com `MutableClock`/dados antigos, `EmailDeliveryPurgeJob` apaga envios > 90 dias sem tocar pendências; `AuditClientPurgeJob` zera IP em claro de **visitantes** > 90 dias e mantém a linha e o
  `client_ref` (SC-021). Rodar manualmente: `curl`-free, via teste `AuditRetentionIT`.
- **Imutabilidade**: `psql -c "UPDATE audit_log SET result='SUCCESS'"` falha pelo gatilho (só um superusuário que desabilite o gatilho consegue).
- **Segredo de pseudonimização**: gerar com `openssl rand -base64 48`; guardar com as demais credenciais; não rotacionar sem necessidade (novos identificadores deixam de casar com os antigos).
- **Aviso de privacidade**: `/privacidade` informa IP e dispositivo, finalidade, visibilidade para administradores e os dois prazos (FR-061).

## Critérios de aceitação

SC-001 a SC-021 do `spec.md`. Verificação do app em iPhone segue pendente de um Mac (como nas features anteriores).

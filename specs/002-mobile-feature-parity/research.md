# Research: Paridade de funcionalidades nos aplicativos Android e iOS

Decisões técnicas (D1–D11) que resolvem as incógnitas do plano. Os números continuam a série da
feature 001 apenas por referência; aqui valem os desta pasta.

## D1. Como levar as telas do web ao mobile

- **Decisão**: mover as telas de funcionalidade de `apps/web-app` (contas, categorias, lançamentos,
  faturas, fluxo de caixa, painel, configurações) para `packages/ui-shared` como componentes
  responsivos, usados pelos dois apps. Cada tela escolhe a apresentação por um serviço de
  viewport (`Viewport.compact()`, baseado em `matchMedia`): tabela no desktop, lista de cartões no
  celular. O web mantém só o shell e as rotas; o mobile ganha um shell com barra de abas.
- **Racional**: a constituição (Princípio I) manda componentes comuns viverem em `ui-shared`, e
  uma única implementação de comportamento garante o SC-002 (valores idênticos). O código das
  páginas é pequeno (cerca de 1.400 linhas) e as chamadas de API já estão em `ui-shared`.
- **Alternativas rejeitadas**: duplicar as páginas em `apps/mobile-app` (diverge com o tempo e
  dobra os testes); embutir o site em WebView (sem experiência móvel, sem offline); esconder a
  versão de tabela com CSS (duplica o DOM e quebra a acessibilidade).

## D2. Cache de leitura offline

- **Decisão**: um interceptor HTTP só do mobile (`offlineInterceptor`) com estratégia "rede
  primeiro": GET com sucesso grava a resposta no cache; GET que falha por rede (status 0 ou
  aparelho offline) responde do cache, com a data da última sincronização exposta por sinal. O
  cache fica em IndexedDB, cifrado com AES-GCM (WebCrypto); a chave de 256 bits fica no
  armazenamento seguro do aparelho (Keystore no Android, Keychain no iOS). Chave de cache:
  usuário + URL com parâmetros. Limite de 20 MB, descartando as entradas mais antigas.
- **Racional**: dados financeiros no aparelho precisam de proteção (Princípio III); WebCrypto e
  IndexedDB já existem no WebView e não exigem plugin novo; o cache pode ser descartado pelo
  sistema sem perda de dado do usuário.
- **Alternativas rejeitadas**: SQLite com SQLCipher (plugin nativo pesado e manutenção nas duas
  plataformas); Capacitor Preferences para o cache (o Android carrega o arquivo inteiro na
  memória; ruim para megabytes); cache sem cifra (expõe dados em backup ou aparelho com root).

## D3. Fila de operações offline

- **Decisão**: só entram na fila `POST /transaction-groups`, `POST /transactions/{id}/pay` e
  `POST /transactions/{id}/unpay` (FR-029). Cada operação guarda um `Idempotency-Key` (UUID),
  método, caminho, corpo, data de criação e estado (`PENDING`, `SENDING`, `REJECTED`). A fila
  fica em Capacitor Preferences (nativo, durável, sem risco de despejo do WebView), cifrada com a
  mesma chave de D2. O envio é sequencial e na ordem; para ao primeiro erro de rede e tenta de
  novo quando a conexão volta ou o app volta ao primeiro plano; resposta 4xx (exceto 401 e 429)
  marca a operação como `REJECTED` com a mensagem do servidor; 401 dispara a renovação de sessão;
  429 e 5xx seguem tentando com espera crescente.
- **Sobreposição na lista**: ao ler `GET /transactions` do cache, as operações pendentes são
  aplicadas por cima (lançamentos novos como linhas "pendente de envio", calculadas pelas mesmas
  funções de `utils`; pagamentos alternam o status). Painel, faturas e fluxo de caixa não são
  recalculados no aparelho: mostram o aviso de que não incluem as operações pendentes.
- **Regra de simplicidade**: item ainda "pendente de envio" não pode ser pago, editado nem
  excluído até sincronizar (evita dependência entre operações e IDs provisórios).
- **Alternativas rejeitadas**: resolução automática de conflitos (decide dinheiro do usuário em
  silêncio); fila genérica para todas as operações (explode a superfície e os conflitos).

## D4. Idempotência no servidor

- **Decisão**: cabeçalho opcional `Idempotency-Key` (UUID) nas três operações acima. Um filtro
  grava a chave com `user_id`, método, caminho, status e corpo da resposta na tabela
  `idempotency_keys` (migração V6). Repetição da mesma chave devolve a resposta original com o
  cabeçalho `Idempotent-Replayed: true`; a mesma chave em outro caminho ou com outro corpo
  responde 422; chave em processamento responde 409. Registros com mais de 7 dias são apagados
  por um job diário. A chave é escopada por usuário (Princípio III).
- **Racional**: pagar duas vezes devolve 409 "já pago", o que o aplicativo não conseguiria
  distinguir de um conflito real depois de um envio interrompido; criar lançamento duas vezes
  duplicaria dinheiro.
- **Alternativas rejeitadas**: deduplicar por conteúdo (falso positivo em compras iguais);
  chave no corpo (mistura transporte com domínio).

## D5. Biometria

- **Decisão**: plugin `@aparajita/capacitor-biometric-auth` (mesmo autor do plugin de
  armazenamento seguro já usado) e um `AppLockService` no mobile: bloqueio opcional, com tempo
  de 0, 1 ou 5 minutos em segundo plano, tela de bloqueio sobre todo o app
  (`LockScreen`) e alternativa "Entrar com senha", que encerra a sessão. Preferências guardadas em
  Capacitor Preferences por usuário. Se a biometria deixar de estar disponível, o bloqueio é
  desligado e a senha é pedida. A biometria só destrava a UI e a sessão já guardada: não vai ao
  servidor e não substitui a senha onde ela é exigida (FR-037).
- **Visão de apps recentes**: `@capacitor-community/privacy-screen` (Android `FLAG_SECURE`, iOS
  cobertura ao ir para segundo plano), ligado enquanto o bloqueio estiver ativo. Efeito colateral
  documentado: no Android a captura de tela fica bloqueada com o bloqueio ligado.
- **Alternativas rejeitadas**: guardar a credencial atrás da biometria no Keystore (mais
  complexo, e a sessão já está em armazenamento seguro); só um overlay em JavaScript (corrida com
  o sistema que tira a miniatura).

## D6. Lembretes locais

- **Decisão**: `@capacitor/local-notifications`. Um endpoint novo e pequeno, `GET /due-summary`
  (contagem por dia de itens fora de cartão e de faturas com saldo, mais o atrasado), alimenta a
  função pura `planReminders` de `packages/utils`, que devolve a lista de avisos num horizonte de
  14 dias: "vencem amanhã" na véspera e "vencem hoje" no dia, no horário escolhido, mais um
  resumo diário de atrasados por até 7 dias. No máximo 35 avisos (o iOS limita 64 agendados).
  Reagendamento total (cancela tudo e agenda de novo, com IDs determinísticos) ao abrir o app,
  ao sincronizar, ao pagar ou desfazer e ao mudar as preferências. Texto só com quantidade e tipo
  (FR-041). Toque abre `/transactions?status=PENDING` filtrado para a data.
- **Limitação aceita**: sem push remoto, os avisos só se atualizam quando o app abre; um item
  pago em outro aparelho continua a avisar até a próxima abertura. No Android 12+ usa-se alarme
  inexato (a permissão de alarme exato é restrita), com margem de até 15 minutos.
- **Alternativas rejeitadas**: push remoto via Firebase e APNs (exige contas e chaves externas
  que o projeto não tem; fica como evolução); calcular no aparelho a partir do cache de listas
  (regra de fatura duplicada fora do servidor, risco de divergir do painel).

## D7. Rede e ciclo de vida

- **Decisão**: `@capacitor/network` para o estado online/offline (com o status 0 do HTTP como
  verdade final) e `@capacitor/app` (já instalado) para detectar retorno ao primeiro plano.
  Sincronização ao voltar a conexão, ao voltar ao primeiro plano e por botão "Sincronizar agora".

## D8. Navegação mobile

- **Decisão**: shell próprio com barra de abas inferior (Painel, Lançamentos, Faturas, Contas,
  Mais) e a aba "Mais" com Fluxo de caixa, Categorias e Minha conta; o botão "+ Nova despesa"
  (lançamento rápido) continua acessível a partir do Painel em 1 toque, preservando o limite de
  3 toques. Sem Ionic Tabs (evita o roteador próprio do Ionic); usa o roteador do Angular e áreas
  seguras via `env(safe-area-inset-*)`.

## D9. Estratégia de testes

- **Unitários (Jest)**: `planReminders`, sobreposição da fila, política de cache, estado de
  bloqueio, cifra do cache.
- **Integração (Testcontainers)**: idempotência (repetição, corrida, isolamento entre usuários,
  limpeza) e `GET /due-summary` (regras de fatura, atrasado, isolamento).
- **E2E (Playwright, perfil Pixel 7)**: fluxos de cada história; offline com
  `context.setOffline`; plugins nativos substituídos por dublês injetados pelo teste.
- **Aparelho real (S21, via ADB e depuração do WebView)**: roteiro de fumaça (login, offline,
  lembrete agendado conferido por `dumpsys notification`, bloqueio). A confirmação da digital em
  si é manual.
- **iOS**: sem Mac, só `cap sync` e testes do código compartilhado; o build e a verificação em
  iPhone ficam pendentes de um Mac (já registrado na spec).

## D10. Contrato e tipos

- **Decisão**: o contrato OpenAPI de `packages/core-models` ganha `Idempotency-Key`,
  `Idempotent-Replayed` e `GET /due-summary`; os tipos TypeScript são regenerados no mesmo PR
  (constituição, Fluxo de Desenvolvimento).

## D11. Segurança dos dados locais

- **Decisão**: ao sair da conta, ao ter a sessão revogada ou ao excluir a conta, cache, fila,
  preferências e avisos agendados são apagados (FR-033); a fila com itens não enviados exige
  confirmação antes. Nada disso entra em logs (FR-003 da feature 001).

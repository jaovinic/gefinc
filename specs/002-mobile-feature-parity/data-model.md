# Data Model: Paridade de funcionalidades nos aplicativos Android e iOS

Esta feature só acrescenta **uma tabela** no servidor e estruturas **locais** no aparelho. As
entidades de negócio (usuário, conta, categoria, lançamento, fatura, pagamento) não mudam e estão
em `specs/001-personal-finance-management/data-model.md`.

## Servidor

### `idempotency_keys` (migração `V6__idempotency_keys.sql`)

| Coluna | Tipo | Regras |
|---|---|---|
| `user_id` | `BIGINT NOT NULL` | FK para `users(id)` com `ON DELETE CASCADE` (exclusão de conta apaga as chaves) |
| `key` | `UUID NOT NULL` | valor do cabeçalho `Idempotency-Key` |
| `method` | `VARCHAR(8) NOT NULL` | `POST` |
| `path` | `VARCHAR(200) NOT NULL` | caminho sem o prefixo `/api/v1` |
| `request_hash` | `CHAR(64) NOT NULL` | SHA-256 do corpo; detecta reutilização da chave com outro corpo |
| `state` | `VARCHAR(12) NOT NULL` | `CHECK (state IN ('IN_PROGRESS','COMPLETED'))` |
| `response_status` | `INT NULL` | preenchido em `COMPLETED` |
| `response_body` | `TEXT NULL` | JSON da resposta (já sem dados de outros usuários) |
| `created_at` | `TIMESTAMPTZ NOT NULL` | usado pela limpeza (7 dias) |

- Chave primária `(user_id, key)`: escopo por usuário, sem vazamento entre contas (Princípio III).
- Índice em `created_at` para o job de limpeza.
- Ciclo: o filtro insere `IN_PROGRESS` antes de executar; ao terminar com resposta 2xx ou 4xx
  grava `COMPLETED`; falha inesperada (5xx) remove a linha para permitir nova tentativa.
- Corpo da resposta fica na tabela por até 7 dias; nunca vai a logs (FR-003).

### Resumo de vencimentos (leitura, sem tabela)

`GET /due-summary?from=YYYY-MM-DD&to=YYYY-MM-DD` é calculado a partir de `transactions` e
`invoice_payments` já existentes, pelas mesmas regras do painel (feature 001, FR-031 e FR-035):

- itens **fora de cartão**: despesas pendentes, uma contagem por data de vencimento;
- **cartão**: uma contagem por fatura com saldo restante maior que zero, na data de vencimento da
  fatura (um item de cartão quitado por pagamento de fatura não conta);
- **atrasado**: itens fora de cartão pendentes e faturas com saldo restante, com vencimento antes
  de hoje (fuso do sistema), em contagens separadas.

## Aparelho (nada disso vai ao servidor)

### Cópia local (`CacheEntry`)

IndexedDB `gefinc-cache`, objeto `entries`:

| Campo | Descrição |
|---|---|
| `key` | `userId` + `\|` + URL com parâmetros ordenados |
| `iv` | vetor de inicialização de 12 bytes (novo a cada gravação) |
| `payload` | resposta JSON cifrada com AES-GCM de 256 bits |
| `syncedAt` | data e hora da gravação (exibida como "dados de ...") |
| `size` | bytes, para o limite de 20 MB (descarta os mais antigos primeiro) |

A chave AES é gerada na primeira gravação e guardada no armazenamento seguro; se for perdida, o
cache é apagado e refeito (sem perda de dado do usuário).

### Operação pendente (`PendingOperation`)

Capacitor Preferences, chave `gefinc.pending-ops.<userId>`, lista cifrada em JSON:

| Campo | Descrição |
|---|---|
| `id` | UUID, também enviado como `Idempotency-Key` |
| `kind` | `CREATE_GROUP`, `PAY`, `UNPAY` |
| `path` / `body` | requisição a reenviar |
| `createdAt` | ordem de envio |
| `state` | `PENDING` → `SENDING` → (removida ao confirmar) ou `REJECTED` |
| `error` | mensagem do servidor, quando `REJECTED` |
| `label` | descrição curta para a lista (sem valores em logs) |

Transições: `PENDING → SENDING → removida` (sucesso); `SENDING → PENDING` (erro de rede);
`SENDING → REJECTED` (4xx que não seja 401 ou 429); `REJECTED → removida` (usuário descarta) ou
`REJECTED → PENDING` (usuário corrige e reenvia com a mesma chave só se o corpo não mudou; se mudou,
gera nova chave).

### Preferências do aparelho (`DevicePreferences`)

Capacitor Preferences, chave `gefinc.prefs.<userId>`:

| Campo | Padrão | Observação |
|---|---|---|
| `lock.enabled` | `false` | bloqueio por biometria |
| `lock.timeoutMinutes` | `1` | 0, 1 ou 5 |
| `reminders.dueTomorrow` | `false` | |
| `reminders.dueToday` | `false` | |
| `reminders.overdue` | `false` | no máximo um resumo por dia |
| `reminders.hour` | `9` | hora local (0 a 23) |

### Plano de lembretes (`ReminderPlan`, derivado)

Lista calculada por `planReminders(summary, preferences, now)`; não é persistida (as notificações
agendadas no sistema são a única cópia):

| Campo | Descrição |
|---|---|
| `id` | inteiro determinístico: `AAAAMMDD * 10 + tipo` (1 amanhã, 2 hoje, 3 atrasado) |
| `at` | data e hora local do aviso |
| `kind` | `DUE_TOMORROW`, `DUE_TODAY`, `OVERDUE` |
| `count` | quantidade de itens e faturas |
| `title` / `body` | texto sem valores nem nomes (FR-041) |
| `route` | destino ao tocar (`/transactions` com filtros) |

Limites: horizonte de 14 dias; no máximo 35 avisos.

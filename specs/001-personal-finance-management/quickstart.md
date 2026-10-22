# Quickstart: GEFINC

**Feature**: `001-personal-finance-management` | **Date**: 2026-10-22

Guia para subir o ambiente de desenvolvimento e validar a feature de ponta a ponta. Os caminhos
abaixo descrevem o estado **após o scaffolding** (primeira fase do `tasks.md`).

## Pré-requisitos

- Node.js LTS e npm
- JDK 21
- Docker e Docker Compose (PostgreSQL 16 e Mailpit; também usado pelo Testcontainers)
- Para o app móvel: Android Studio e/ou Xcode (apenas para rodar em emulador/dispositivo)

Maven não precisa estar instalado: o projeto usa o Maven Wrapper (`./mvnw`).

## 1. Instalar e subir tudo

```bash
npm install
npm run dev
```

`npm run dev` executa, em ordem (os itens 2 a 4 rodam em paralelo):

1. `docker compose up -d` (PostgreSQL em `localhost:5432` e Mailpit em `localhost:8025`);
2. `nx run api-server:serve` (API em `http://localhost:8080/api/v1`, migrações Flyway aplicadas
   no boot);
3. `nx run web-app:serve` (web em `http://localhost:4200`);
4. `nx run mobile-app:serve` (app móvel no navegador, em `http://localhost:8100`).

Variáveis de ambiente locais ficam em `.env` (não versionado; modelo em `.env.example`):
`DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `APP_BASE_URL`.

## 2. Rodar os testes

```bash
npx nx run-many -t test            # unitários e integração (Testcontainers sobe o PostgreSQL)
npx nx run api-server:test         # só o backend
npx nx run utils:test              # cálculo de parcelas e dinheiro (vetores compartilhados)
npx nx run web-app:e2e             # Playwright: fluxos críticos no navegador
npx nx run mobile-app:e2e          # Playwright em viewport de celular (limite de 3 toques)
```

## 3. Aplicativo móvel

```bash
npx nx run mobile-app:serve                 # no navegador, para desenvolvimento
npx nx run mobile-app:sync                  # copia o build para os projetos nativos
npx nx run mobile-app:open -- android       # abre no Android Studio (ou ios)
```

No emulador Android, a API local é acessada por `http://10.0.2.2:8080/api/v1`.

## 4. Roteiro de validação manual (cobre as histórias P1 a P7)

1. **Acesso (P1)**: em `http://localhost:4200`, crie a conta `ana@example.com`. Em
   `http://localhost:8025` (Mailpit), teste "Esqueci a senha" e abra o link recebido. Troque a
   senha e confirme que a sessão anterior deixa de funcionar na hora. Solicite a exclusão da conta,
   tente entrar e cancele a exclusão.
2. **Contas (P2)**: cadastre "Nubank" (cartão, fecha dia 10, vence dia 17) e "Carteira" (dinheiro).
   Inative a "Carteira" e confirme que um novo lançamento nela é recusado.
3. **Lançamentos (P3)**: cadastre "Salário" (receita fixa, R$ 5.000,00, vence dia 5) e "Internet"
   (despesa fixa). Marque um item como pago e desfaça. No Nubank, cadastre a assinatura fixa "Streaming"
   e altere o dia de vencimento do cartão: as próximas ocorrências pendentes passam a vencer no novo dia.
4. **Parcelado (P4)**: no Nubank, registre R$ 100,00 em 3 parcelas com compra no dia 12.
   Esperado: parcelas de 33,33 / 33,33 / 33,34, a primeira vencendo no dia 17 do mês seguinte.
   Registre também um carnê de R$ 300,00 em 3 parcelas na conta corrente.
5. **Faturas (P5)**: abra a projeção de faturas do Nubank. Pague R$ 30,00 da fatura (restante
   R$ 70,00); tente pagar R$ 80,00 (deve ser recusado); use "pagar fatura" pelo restante e
   confirme que os itens ficam pagos; desfaça um pagamento e veja os itens voltarem a pendentes.
6. **Painel (P6)**: confira Total do Mês, Total a Vencer, Total Pago e os dois gráficos; troque
   de mês e confirme que a compra do dia 12 aparece no mês do vencimento.
7. **Celular (P7)**: no app móvel, a partir da tela inicial toque em "Nova despesa", digite o
   valor e toque em "Salvar" (2 toques mais a digitação).

## 5. Verificações de contrato

- Validar o contrato: `npx @redocly/cli lint specs/001-personal-finance-management/contracts/openapi.yaml`.
- Regenerar os tipos: `npx nx run core-models:generate` (gera TypeScript a partir do OpenAPI).
- Os testes de integração do backend falham se uma resposta divergir do contrato.

## 6. Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| API não sobe: erro de conexão | PostgreSQL ainda iniciando | Aguarde o healthcheck ou rode `docker compose ps` |
| Testes de integração não iniciam | Docker parado | Inicie o Docker (Testcontainers precisa dele) |
| `401` constante no web | Cookie de refresh bloqueado | Use `http://localhost:4200` (mesmo site) e confira CORS em `application-local.yml` |
| E-mail de recuperação não chega | Mailpit parado | Verifique `http://localhost:8025` e as variáveis `SMTP_*` |

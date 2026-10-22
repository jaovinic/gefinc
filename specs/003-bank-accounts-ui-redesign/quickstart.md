# Quickstart: contas PF/PJ, cartões vinculados, receita no app e identidade visual

Roteiro para validar a feature depois de implementada. O ambiente base é o da feature 001
(`specs/001-personal-finance-management/quickstart.md`) e o do app, o da 002.

## Pré-requisitos

- Node 24, Java 21, Docker; para o app, Android SDK e aparelho com depuração USB.
- Banco e API (`DB_PORT=5433` se a 5432 estiver ocupada):

```bash
DB_PORT=5433 docker compose up -d postgres mailpit
cd apps/api-server && DB_PORT=5433 ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

## Gerar os arquivos da marca (logo, favicons, ícones do app)

```bash
npm run brand:generate   # lê packages/ui-shared/src/brand/*.svg e grava favicons, manifesto, mipmap e AppIcon
```

## Testes automatizados

```bash
npx nx run-many -t lint test build
cd apps/api-server && DB_PORT=5433 ./mvnw test      # inclui AccountHolderIT, CardBankLinkIT e AccountMigrationV7IT
npx nx e2e web-app-e2e                               # menu lateral, contas PF/PJ, cartões vinculados, identidade
npx nx e2e mobile-app-e2e                            # receita em até 3 toques, picker com ícones, identidade
```

## Roteiro manual (web e app)

1. **Contas PF/PJ (US1)**: cadastrar uma conta bancária PF e uma PJ com ícones; filtrar por PF e por PJ; alterar o tipo; inativar.
2. **Cartões (US2)**: sem conta bancária, o cadastro de cartão orienta a criar uma; com conta, criar um cartão em cada uma com ícone e nome; abrir o lançamento e conferir ícone, nome, conta vinculada e selo; trocar o vínculo e ver que valores e vencimentos não mudam; inativar a conta e ler o aviso dos cartões.
3. **Cartão antigo**: com dados anteriores, o cartão sem vínculo mostra "vincule a uma conta bancária" e continua funcionando.
4. **Receita no app (US3)**: na tela inicial, "Nova despesa" e "Nova receita" lado a lado; registrar receita em até 3 toques (contar); repetir sem conexão.
5. **Menu lateral (US4)**: web em tela larga (menu com logo, ícones, item ativo), recolher e recarregar (lembra), janela estreita (gaveta), navegar só por teclado.
6. **Identidade (US5)**: conferir fundo, cores, fonte, logo nas telas de entrada, favicon na aba, ícone do app no aparelho, estados vazio/erro com ícone, toast com Desfazer ao pagar, movimento reduzido ligado nas preferências do sistema.

## Critérios de aceitação

SC-001 a SC-010 do `spec.md`. Verificação em iPhone segue pendente de um Mac.

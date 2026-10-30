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
4. **Novo lançamento no app (US3)**: na tela inicial há um único botão "Novo lançamento" (`/novo`; `/quick-expense` e `/quick-income` redirecionam para `/novo?tipo=despesa|receita`). Na tela se escolhe Despesa ou Receita e se preenche o valor em destaque; despesa em 2 toques (abrir e salvar), receita em 3 (abrir, escolher Receita, salvar); repetir sem conexão. Receita nunca lista cartão (ao trocar para Receita com um cartão escolhido a conta é trocada e a tela avisa). Receita de hoje ou anterior aparece como "Recebido"; receita futura fica "A receber" e pode ser antecipada em Lançamentos.
4c. **Parcelamento no cartão (app)**: em Novo lançamento, escolher um cartão (ex.: fecha dia 10, vence dia 17), "Parcelas" = 10x e digitar 100,00 em "Valor da parcela": o resumo mostra "10 × R$ 100,00 = R$ 1.000,00" e a prévia lista "1/10 · fatura de nov/2026 · vence 17/11" até "10/10 · fatura de ago/2027 · vence 17/08" (miolo em "Ver todas as parcelas"). Compra no dia 11 em diante entra na fatura seguinte. Alternar para "Valor total" não converte o número digitado e mostra o resto de centavos. Salvar e conferir em Lançamentos (e nas Faturas) uma parcela por mês; o campo Parcelas não aparece em conta bancária, dinheiro nem receita. No formulário completo (web e Lançamentos do app), tipo Parcelado tem "Valor total" | "Valor da parcela".
4a. **Saldo por conta**: o painel mostra o "Saldo geral" (soma das contas, até hoje) e uma linha por conta; informar "Saldo inicial (opcional)" no cadastro de uma conta bancária ou de dinheiro (cartão não tem), positivo ou negativo ("Negativo (devendo)"); o saldo atual de cada conta aparece também na tela de Contas; conferir que receita futura só soma ao chegar a data (ou ao antecipar) e que pagamento de cartão vinculado debita a conta.
4b. **Campos de digitação**: ao focar descrição, valor, data ou categoria o contorno é cinza-azulado (nunca verde nem ciano); botões e links mantêm o anel de foco da marca.
5. **Menu lateral (US4)**: web em tela larga (menu com logo, ícones, item ativo), recolher e recarregar (lembra), janela estreita (gaveta), navegar só por teclado.
5b. **Atalho Minha conta**: no desktop, a barra superior mostra à direita o avatar com a inicial e o nome (sem nome, a parte do e-mail antes do @); no celular (320px), a barra com a logo mantém o atalho fixo à direita, com o nome cortado em reticências se for longo (abaixo de 360px fica só o avatar); tocar abre Minha conta e o atalho fica destacado; salvar um novo nome atualiza o atalho na hora; sem conexão cai em "Minha conta" com ícone.
6. **Identidade (US5)**: conferir fundo, cores, fonte, logo nas telas de entrada, favicon na aba, ícone do app no aparelho, estados vazio/erro com ícone, toast com Desfazer ao pagar, movimento reduzido ligado nas preferências do sistema.

## Critérios de aceitação

SC-001 a SC-010 do `spec.md`. Verificação em iPhone segue pendente de um Mac.

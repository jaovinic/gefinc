# Quickstart: Paridade nos aplicativos Android e iOS

Roteiro para validar a feature depois de implementada. O ambiente base (PostgreSQL, API, web) é o
da feature 001 (`specs/001-personal-finance-management/quickstart.md`).

## Pré-requisitos

- Node 24, Java 21, Docker; para Android: Android SDK (plataforma 36 e build-tools) e um aparelho
  com depuração USB. Para iOS: um Mac com Xcode (sem ele, só os testes do código compartilhado).
- Subir banco e API (use `DB_PORT=5433` se a 5432 estiver ocupada):

```bash
DB_PORT=5433 docker compose up -d postgres mailpit
cd apps/api-server && DB_PORT=5433 ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

## Testes automatizados

```bash
npx nx run-many -t lint test build            # tudo, inclusive utils e ui-shared
cd apps/api-server && DB_PORT=5433 ./mvnw test # inclui IdempotencyIT e DueSummaryIT
npx nx e2e web-app-e2e                         # web continua verde depois da mudança de telas
npx nx e2e mobile-app-e2e                      # perfil Pixel 7: fluxos, offline e dublês de plugins
```

## Roteiro no Android (aparelho real)

```bash
npx nx run mobile-app:sync                     # gera o web e sincroniza o projeto Android
cd apps/mobile-app/android && ANDROID_HOME=$HOME/Android/Sdk ./gradlew assembleDebug
adb -s <serial> reverse tcp:8080 tcp:8080
adb -s <serial> install -r app/build/outputs/apk/debug/app-debug.apk
```

1. **Paridade (US1 a US4)**: criar conta bancária, cartão e categoria; cadastrar despesa avulsa,
   fixa e parcelada no cartão (prévia 33,33 / 33,33 / 33,34); pagar e desfazer; pagar parte da
   fatura (R$ 30 de R$ 100) e recusar R$ 80; abrir painel, projeção e fluxo de caixa. Conferir os
   mesmos valores no web.
2. **Conta (US5)**: pedir recuperação de senha; solicitar exclusão com senha e cancelar ao entrar.
3. **Conforto (US6)**: nenhuma tela com conteúdo sob a barra de status, a de gestos ou o teclado.
4. **Offline (US7)**: sincronizar; ativar modo avião; abrir painel e lançamentos (aviso com data da
   sincronização); registrar uma despesa e pagar um item; ver "pendente de envio"; desligar o modo
   avião e conferir que cada operação aparece **uma vez** no web; repetir com o envio interrompido.
5. **Biometria (US8)**: ativar em Minha conta (confirmação manual da digital); mandar o app ao
   segundo plano por mais que o tempo escolhido; conferir bloqueio, miniatura sem conteúdo em apps
   recentes e a alternativa "Entrar com senha".
6. **Lembretes (US9)**: ligar "vencem amanhã", com um item vencendo amanhã; conferir o aviso
   agendado com `adb shell dumpsys notification | grep -i gefinc` e, ao pagar o item, que o aviso
   sumiu; tocar no aviso abre a lista.

## Critérios de aceitação

SC-001 a SC-013 do `spec.md`. As confirmações em iPhone ficam pendentes de acesso a um Mac.

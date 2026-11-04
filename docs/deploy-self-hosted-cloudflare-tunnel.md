# Guia de Hospedagem Self-Hosted: PC Sobressalente + Cloudflare Tunnel + Cloudflare Pages

Este documento estabelece o guia de arquitetura e operação para executar a infraestrutura completa do **GEFINC** aproveitando um computador sobressalente (desktop ou notebook em ambiente local/caseiro) em conjunto com a rede de borda da **Cloudflare**.

Essa abordagem adota a **Arquitetura Híbrida (Opção 1)**: a interface web estática roda na CDN global da Cloudflare (alta disponibilidade e baixa latência), enquanto o processamento do backend Spring Boot e a soberania dos dados no PostgreSQL 16 permanecem sob seu controle absoluto no hardware local, expostos com segurança por meio de um **Cloudflare Tunnel (`cloudflared`)**.

---

## 1. Topologia da Arquitetura Híbrida

### 1.1. Por que a Arquitetura Híbrida foi Escolhida?

Hospedar todas as camadas em um computador caseiro tradicionalmente enfrenta gargalos: banda de upload residencial limitada, conexões sob **CGNAT** (sem IPv4 público dedicado) e lentidão na entrega de assets estáticos da aplicação web.

A arquitetura híbrida resolve cada um desses pontos:

1. **Frontend no Cloudflare Pages:**
   - Os arquivos estáticos compilados da aplicação Angular (HTML, JS, CSS, fontes e ícones) são distribuídos em mais de 300 data centers ao redor do mundo.
   - O tráfego de navegação web comum não consome a largura de banda de upload residencial.
   - Se o computador sobressalente for desligado ou reiniciar para manutenção, a página web continua respondendo instantaneamente (apenas exibindo estado desconectado ou aguardando reconexão da API).
2. **Backend e Banco de Dados no Computador Sobressalente:**
   - O **Java 21**, o **Spring Boot 3.5** e o **PostgreSQL 16** contam com os recursos brutos do hardware (CPU e memória RAM física), sem restrições de planos gratuitos em nuvem e sem custos de instâncias pagas.
   - Os dados financeiros ficam armazenados exclusivamente no disco do seu dispositivo.
3. **Cloudflare Tunnel (`cloudflared`):**
   - Conecta o backend caseiro à rede mundial de forma direta e criptografada sem a necessidade de expor o IP da residência ou realizar configurações arriscadas de *port forwarding* no roteador.

### 1.2. Diagrama de Comunicação

```text
                                       +-----------------------------------+
                                       |      Borda Global Cloudflare      |
                                       +-----------------------------------+
                                         |                               |
       Acesso Web                        |                               | Requisições de API
 (app.meudominio.com)                    |                               | (api.meudominio.com)
          |                              |                               |
          v                              v                               v
+-------------------+          +-------------------+           +-------------------+
|  Navegador Web    |          | Cloudflare Pages  |           | Cloudflare Edge   |
|   (Desktop/Cel)   | <------> |  (Angular 22 SPA) |           |  (Terminação TLS) |
+-------------------+          +-------------------+           +-------------------+
          |                              |                               |
          | Chamadas diretas a api.<dominio> (CORS + cookie)              | Túnel Seguro Outbound
          +---------------------------------------------------------------+ (HTTP/2 ou QUIC)
                                                                         v
=========================================================== | =======================
REDE LOCAL RESIDENCIAL (Atrás de CGNAT / Roteador Doméstico) |  Túnel Criptografado
=========================================================== v
                                               +---------------------------+
                                               |   Container cloudflared   |
                                               +---------------------------+
                                                             | Rede Docker interna
                                                             v (gefinc-net)
                                               +---------------------------+
                                               |   Container api-server    |
                                               |     (Spring Boot 3.5)     |
                                               +---------------------------+
                                                             |
                                                             v Porta 5432 interna
                                               +---------------------------+
                                               |    Container postgres     |
                                               |      (PostgreSQL 16)      |
                                               +---------------------------+
```

---

## 2. Como Funciona o Cloudflare Tunnel

O **Cloudflare Tunnel** (executado pelo daemon leve `cloudflared`) revoluciona a hospedagem self-hosted:

- **Conexões Apenas de Saída (*Outbound-only*):** O daemon `cloudflared` inicia conexões seguras de dentro da sua rede local em direção aos servidores da Cloudflare via portas 7844 (UDP/QUIC) ou 443 (TCP/HTTP2).
- **Sem Port Forwarding:** Nenhuma porta precisa ser aberta no roteador residencial (dispensando DMZ, UPnP ou NAT redirection).
- **Transposição Completa de CGNAT:** Funciona perfeitamente em conexões de banda larga com IP dinâmico ou sob redes CGNAT (*Carrier-Grade NAT*), onde a operadora compartilha um mesmo IPv4 público entre múltiplos clientes e impede a abertura de portas convencionais.
- **Terminação TLS Automática:** Os certificados HTTPS válidos são emitidos e gerenciados pela própria Cloudflare na borda. Clientes web e móveis comunicam-se via TLS moderno sem você precisar rodar servidores ACME ou se preocupar com renovação de certificados.
- **Proteção de IP e Mitigação de Ataques:** O endereço de IP residencial nunca é revelado nos registros DNS públicos, protegendo a rede doméstica contra varreduras de portas e ataques de negação de serviço (DDoS).

---

## 3. Preparação do Computador Sobressalente

### 3.1. Ajustes de Hardware na BIOS/UEFI

Para garantir que o computador funcione como um servidor autônomo (*headless*), acesse a BIOS/UEFI durante a inicialização (teclas `F2`, `Del` ou `F10` dependendo do fabricante):

1. **Recuperação de Energia (*AC Power Loss Recovery*):**
   - Procure por *Restore AC Power Loss*, *After Power Loss* ou *State After G3*.
   - Altere para **Power On** (ou **Always On**). Caso ocorra uma falta de energia elétrica no local, o computador ligará automaticamente assim que a eletricidade retornar.
2. **Desativar Suspensão Automática de Hardware:**
   - Desative recursos de economia de energia agressivos como *Deep Sleep (C-States)* excessivos se causarem instabilidade em interfaces de rede.
3. **Boot Headless:**
   - Certifique-se de que a opção *Halt on Errors* não esteja configurada para travar caso não haja monitor ou teclado conectados.

### 3.2. Preparação do Sistema Operacional (Ubuntu Server / Debian)

Recomenda-se a instalação de **Ubuntu 24.04 LTS**, **Ubuntu 22.04 LTS** ou **Debian 12** (versões Server, sem interface gráfica de desktop, para economizar recursos).

#### Desativar Hibernação e Suspensão no systemd

Servidores nunca devem entrar em estado de suspensão ou espera:

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

#### Se o hardware for um Notebook sobressalente (Tampa Fechada)

Caso esteja reaproveitando um notebook, configure o sistema para ignorar o fechamento da tampa:

Edite `/etc/systemd/logind.conf`:

```bash
sudo sed -i 's/#HandleLidSwitch=suspend/HandleLidSwitch=ignore/' /etc/systemd/logind.conf
sudo sed -i 's/#HandleLidSwitchExternalPower=suspend/HandleLidSwitchExternalPower=ignore/' /etc/systemd/logind.conf
sudo systemctl restart systemd-logind
```

#### Fixação de IP Local na LAN

Defina um endereço IP estático para o servidor local (exemplo: `192.168.1.150`). A maneira mais simples e recomendada é via **reserva de endereço MAC no servidor DHCP do seu roteador residencial**.

### 3.3. Instalação do Docker e Docker Compose

Instale a versão oficial do Docker Engine:

```bash
# 1. Atualizar repositórios e instalar pacotes básicos
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ca-certificates gnupg lsb-release

# 2. Configurar a chave GPG do repositório Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# 3. Adicionar repositório estável
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 4. Instalar Docker e plugins
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. Adicionar o usuário atual ao grupo docker (dispensa uso de sudo no dia a dia)
sudo usermod -aG docker $USER
newgrp docker
```

---

## 4. Configuração do Cloudflare Tunnel no Dashboard

Antes de subir os containers no computador local, crie o túnel na Cloudflare:

1. Acesse o **Cloudflare Zero Trust Dashboard**: [https://one.dash.cloudflare.com](https://one.dash.cloudflare.com).
2. Vá em **Networks** > **Tunnels** > clique em **Create a Tunnel**.
3. Selecione o tipo de conector **Cloudflare (`cloudflared`)** e clique em **Next**.
4. Dê um nome ao túnel (exemplo: `gefinc-selfhost-tunnel`).
5. Na tela seguinte (*Install and run a connector*), localize a seção **Docker**. Você verá um comando contendo um token longo:

   ```bash
   docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <SEU_TUNNEL_TOKEN>
   ```

   **Copie apenas o token** (a sequência alfanumérica longa após `--token`). Guarde-o para o arquivo `.env`.
6. Na aba **Public Hostnames** do túnel:
   - Clique em **Add a public hostname**.
   - **Subdomain:** `api`
   - **Domain:** selecione seu domínio registrado na Cloudflare (ex: `meudominio.com`).
   - **Path:** deixe vazio.
   - **Service:**
     - **Type:** `HTTP`
     - **URL:** `api-server:8080` *(este é o nome do container da API e sua porta dentro da rede Docker)*.
7. Salve o hostname. A Cloudflare criará automaticamente a entrada CNAME necessária no seu DNS apontando `api.meudominio.com` para a rota interna do túnel.

---

## 5. Preparação da Aplicação e Docker Compose Local

No computador local sobressalente, clone o repositório do GEFINC:

```bash
cd ~
git clone https://github.com/seu-usuario/gefinc.git
cd gefinc
```

### 5.1. Dockerfile Otimizado Multi-Stage (Java 21 / Spring Boot)

Antes de executar a compilação dos containers, certifique-se de que o arquivo `apps/api-server/Dockerfile` existe na sua árvore de código. Caso ainda não tenha sido criado, crie-o com a estrutura multi-stage baseada na imagem oficial Eclipse Temurin:

```dockerfile
# Estágio 1: Build da aplicação com Maven e JDK 21
FROM eclipse-temurin:21-jdk-jammy AS builder
WORKDIR /workspace

# Instalar Maven nativo para evitar timeouts do wrapper
RUN apt-get update && apt-get install -y maven && rm -rf /var/lib/apt/lists/*

# Copiar apenas o descritor de dependências primeiro (otimização de cache)
COPY apps/api-server/pom.xml .

# Baixar dependências
RUN mvn dependency:go-offline -B

# Copiar o código-fonte e compilar o .jar
COPY apps/api-server/src src
RUN mvn clean package -DskipTests -B

# Estágio 2: Imagem final enxuta com JRE 21
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# Usuário de sistema não privilegiado
RUN groupadd -r gefinc && useradd -r -g gefinc gefinc

COPY --from=builder /workspace/target/*.jar app.jar
RUN chown -R gefinc:gefinc /app

USER gefinc

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
```

### 5.2. Arquivo `docker-compose.selfhost.yml`

Crie o arquivo `docker-compose.selfhost.yml` na raiz do repositório:

```yaml
name: gefinc-selfhost

services:
  postgres:
    image: postgres:16-alpine
    container_name: gefinc-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-gefinc}
      POSTGRES_USER: ${DB_USER:-gefinc}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - gefinc-pgdata:/var/lib/postgresql/data
    healthcheck:
      test:
        ['CMD-SHELL', 'pg_isready -U ${DB_USER:-gefinc} -d ${POSTGRES_DB:-gefinc}']
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - gefinc-net

  api-server:
    build:
      context: .
      dockerfile: apps/api-server/Dockerfile
    container_name: gefinc-api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DB_URL: jdbc:postgresql://postgres:5432/${POSTGRES_DB:-gefinc}
      DB_USER: ${DB_USER:-gefinc}
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      APP_BASE_URL: ${APP_BASE_URL}
      FORWARD_HEADERS_STRATEGY: native
      SMTP_HOST: ${SMTP_HOST:-localhost}
      SMTP_PORT: ${SMTP_PORT:-1025}
      MAIL_FROM: ${MAIL_FROM:-no-reply@meudominio.com}
      JAVA_TOOL_OPTIONS: '-Xms512m -Xmx1536m -XX:+UseG1GC'
    expose:
      - '8080'
    networks:
      - gefinc-net

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: gefinc-tunnel
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - api-server
    networks:
      - gefinc-net

volumes:
  gefinc-pgdata:

networks:
  gefinc-net:
    driver: bridge
```

> [!IMPORTANT]
> **Segurança de Rede:** Observe que nenhum serviço mapeia portas para o host (`ports:` foi intencionalmente omitido). O banco de dados e a API comunicam-se exclusivamente na rede isolada `gefinc-net`. Nem mesmo outros dispositivos na rede Wi-Fi local conseguem conectar diretamente na porta 5432 ou 8080; todo o tráfego externo passa obrigatoriamente autenticado através da borda da Cloudflare pelo container `cloudflared`.

> [!NOTE]
> **Preservação de IP Real:** A variável `FORWARD_HEADERS_STRATEGY=native` instrui o Spring Boot a interpretar o cabeçalho `X-Forwarded-For` repassado pela Cloudflare. Isso garante que o limitador de tentativas de login contra ataques de força bruta (máximo de 20 falhas por IP) opere com precisão para cada visitante.

### 5.3. Arquivo de Variáveis de Ambiente (`.env`)

Gere senhas e segredos criptograficamente seguros e monte seu arquivo `.env`:

```bash
# Gerar segredos seguros
JWT_KEY=$(openssl rand -hex 32)
DB_PASS=$(openssl rand -hex 16)

cat <<EOF > .env
# Configurações do Banco de Dados
POSTGRES_DB=gefinc
DB_USER=gefinc_admin
DB_PASSWORD=${DB_PASS}

# Segurança da API
JWT_SECRET=${JWT_KEY}
APP_BASE_URL=https://app.meudominio.com

# Token de autenticação do Cloudflare Tunnel
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...seu_token_gerado_no_painel_aqui...

# Cloudflare R2 - Backups Offsite
R2_ACCOUNT_ID=seu_account_id_cloudflare_aqui
R2_BUCKET_NAME=gefinc-db-backups

# E-mail e Notificações (opcional / produção)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
MAIL_FROM=no-reply@meudominio.com
EOF

# Proteger leitura do arquivo
chmod 600 .env
```

### 5.4. Inicialização e Monitoramento dos Containers

Inicie a pilha local:

```bash
docker compose -f docker-compose.selfhost.yml up -d --build
```

Acompanhe os logs da conexão do túnel e inicialização da API:

```bash
# Verificar conexão do túnel Cloudflare
docker compose -f docker-compose.selfhost.yml logs -f cloudflared

# Verificar logs do Spring Boot
docker compose -f docker-compose.selfhost.yml logs -f api-server
```

Assim que o container `cloudflared` registrar mensagens como `Connection registered`, a API estará acessível mundialmente em `https://api.meudominio.com`.

---

## 6. Deploy do Frontend Web no Cloudflare Pages

A aplicação web Angular (`apps/web-app`) será hospedada de forma estática no Cloudflare Pages.

### 6.1. Configuração do Projeto no Cloudflare Dashboard

1. No painel da Cloudflare, navegue até **Workers & Pages** > **Overview** > **Create application** > **Pages** > **Connect to Git**.
2. Selecione o repositório do GEFINC no GitHub/GitLab.
3. Defina as configurações de compilação:
   - **Project name:** `gefinc-web`
   - **Production branch:** `main` (ou a sua branch padrão)
   - **Framework preset:** `None`
   - **Build command:** `npx nx build web-app --configuration=production`
   - **Build output directory:** `dist/apps/web-app/browser`
4. Em **Environment variables** (Variáveis de ambiente do build):
   - Adicione: `NODE_VERSION` = `22`
5. Clique em **Save and Deploy**.

### 6.2. Fallback SPA (`_redirects`), Headers (`_headers`) e CORS

Os arquivos colocados na pasta `apps/web-app/public/` são copiados diretamente para a raiz do pacote de build final.

#### Arquivo `apps/web-app/public/_redirects`

Crie o arquivo `apps/web-app/public/_redirects` apenas com o fallback das rotas internas do Angular:

```text
/*  /index.html  200
```

> [!NOTE]
> O Cloudflare Pages **não** faz proxy para outro host: a regra de status `200` (rewrite) só vale para caminhos do mesmo site, e uma regra como `/api/* https://api.meudominio.com/... 200` é ignorada (a rota cai no fallback e devolve o `index.html`; um `POST` de login retorna 405). Por isso o web chama a API **diretamente** em `https://api.meudominio.com/api/v1`.
>
> - O build de produção (`--configuration=production`) troca `environment.ts` por `apps/web-app/src/environments/environment.prod.ts`, que contém `apiUrl: 'https://api.meudominio.com/api/v1'`. Ajuste esse valor para o seu domínio. Em desenvolvimento, `environment.ts` mantém `/api/v1` e o `proxy.conf.json` encaminha `/api` para `localhost:8080`.
> - `APP_BASE_URL` no backend deve ser exatamente `https://app.meudominio.com`, **sem barra final**: é a origem liberada no CORS e a base dos links enviados por e-mail.
> - O cookie `gefinc_refresh` (`Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`) funciona porque `app.` e `api.` pertencem ao mesmo *site* (mesmo domínio registrável); o front usa `withCredentials`.
> - Não funcionam contra a API de produção: previews `*.pages.dev` e `localhost:4200` (o CORS responde 403 e o cookie seria cross-site).

#### Arquivo `apps/web-app/public/_headers`

Crie o arquivo `apps/web-app/public/_headers` para aplicar cabeçalhos defensivos de HTTP e regras de cache. Os arquivos gerados pelo build (`main-*.js`, `chunk-*.js`, `polyfills-*.js`, `styles-*.css` e as fontes em `media/`) têm hash no nome e podem ser cacheados por um ano; o `index.html` deve sempre ser revalidado. O Cloudflare Pages aceita apenas um `*` (splat) por regra, por isso as regras são por prefixo:

```text
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

/main-*.js
  Cache-Control: public, max-age=31536000, immutable

/chunk-*.js
  Cache-Control: public, max-age=31536000, immutable

/polyfills-*.js
  Cache-Control: public, max-age=31536000, immutable

/styles-*.css
  Cache-Control: public, max-age=31536000, immutable

/media/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache

/
  Cache-Control: no-cache
```

> [!NOTE]
> Por causa do fallback SPA, um `.js` inexistente devolve o `index.html` com status 200 (*soft 404*) em vez de 404. Após o deploy, confirme no painel/`curl -I` que os cabeçalhos de cache foram aplicados aos arquivos `.js` e `.css`.

### 6.3. Associação de Domínio Personalizado

No Cloudflare Pages, vá na aba **Custom domains** do projeto e configure seu subdomínio preferido, por exemplo: `app.meudominio.com`.

---

## 7. Configuração e Conexão do Mobile App

O aplicativo móvel compilado com **Capacitor** roda nativamente no smartphone (Android/iOS) sob o esquema local (`https://localhost` no Android, padrão do Capacitor 8, e `capacitor://localhost` no iOS). Assim como o web, ele consome diretamente o endpoint público HTTPS do Cloudflare Tunnel.

### 7.1. Configuração do Endpoint de Produção

Edite o arquivo `apps/mobile-app/src/environments/environment.prod.ts`:

```typescript
export const environment = {
  // Aponte para a URL pública do Cloudflare Tunnel com o context-path /api/v1
  apiUrl: 'https://api.meudominio.com/api/v1',
};
```

> [!WARNING]
> A URL da API deve ser `https://`. O build de produção troca `environment.ts` (desenvolvimento, `http://localhost:8080`) por `environment.prod.ts` (fileReplacements), e é esse valor que vai para o APK. Um build antigo permanece em `apps/mobile-app/android/app/src/main/assets/public` até que um novo `sync` seja executado; depois de alterar o endereço, sincronize novamente antes de gerar o APK.

### 7.2. Compilação e Sincronização do Capacitor

No seu computador de desenvolvimento, na raiz do repositório:

```bash
# Build de produção do frontend móvel (usa environment.prod.ts) + cap sync (já executa com o diretório correto, apps/mobile-app)
npx nx run mobile-app:sync
```

O `sync` já é de produção. Para desenvolver contra a API local (com `adb reverse tcp:8080 tcp:8080`), use o build de dev:

```bash
npx nx build mobile-app --configuration=development
cd apps/mobile-app && npx cap sync android
```

Depois de um build de dev, rode `npx nx run mobile-app:sync --skip-nx-cache` para voltar o asset local ao de produção antes de gerar o APK para o celular.

> [!NOTE]
> Qualquer comando `cap` executado diretamente (ex.: `npx cap sync android`) precisa ser rodado dentro de `apps/mobile-app` (`cd apps/mobile-app`), onde está o `capacitor.config.ts`.

### 7.3. Geração do APK e Instalação no Smartphone

Pré-requisitos:

- JDK 21 e Android SDK com a plataforma 36 (*platform 36*).
- `ANDROID_HOME` apontando para o SDK, ou o arquivo `apps/mobile-app/android/local.properties` (já ignorado pelo Git) com `sdk.dir=/caminho/Android/Sdk`.
- Node 22 e dependências instaladas (`npm ci`).

Conecte o smartphone Android com a **Depuração USB** habilitada:

```bash
# Verificar aparelho conectado
adb devices

# Compilar o APK de depuração
cd apps/mobile-app/android
./gradlew assembleDebug

# Instalar no aparelho conectado
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

O APK fica em `apps/mobile-app/android/app/build/outputs/apk/debug/app-debug.apk`. Sem cabo, copie o arquivo para o celular e instale-o manualmente (é preciso liberar a instalação de fontes desconhecidas).

*(Ou utilize o utilitário integrado do Capacitor: `cd apps/mobile-app && npx cap run android`)*.

> [!WARNING]
> A tarefa `assembleRelease` não tem `signingConfigs` configurado: o APK de release sai sem assinatura e não instala. Para testes, use `assembleDebug`.

> [!TIP]
> Ao usar flags do Nx como `--skip-nx-cache`, passe-as **sem** `--` (ex.: `npx nx run mobile-app:sync --skip-nx-cache`); com `--` a flag é repassada ao `cap sync` e o comando falha. Para validar o bundle sincronizado, o comando abaixo deve imprimir `0` para cada arquivo. O script `tools/check-prod-bundle.mjs` faz a verificação completa do build (`node tools/check-prod-bundle.mjs --dist dist/apps/mobile-app/browser --env apps/mobile-app/src/environments/environment.prod.ts`):
>
> ```bash
> grep -c "localhost:8080" apps/mobile-app/android/app/src/main/assets/public/main-*.js
> ```

---

## 8. Rotina Automatizada de Backup Offsite (Regra de 35 Dias)

Hospedar em um computador sobressalente exige precaução contra danos de hardware no disco rígido local, oscilações severas de energia ou perdas físicas. Um backup offsite é obrigatório.

Conforme estabelecido na política de governança de dados do GEFINC (`docs/operations.md`):

- A exclusão de contas tem 30 dias de carência antes do expurgo permanente.
- Para assegurar que nenhum dado de usuário excluído persista indefinidamente, **a retenção máxima dos backups do banco deve ser de 35 dias**.

### 8.1. Criação do Bucket no Cloudflare R2 ou AWS S3

1. No dashboard da Cloudflare, vá em **R2 Object Storage** > **Create bucket**.
2. Nomeie o bucket (ex: `gefinc-db-backups`).
3. Gere um par de credenciais de API R2 (*Access Key ID* e *Secret Access Key*) com permissão de leitura e escrita.
4. Opcionalmente, crie uma **Lifecycle Rule** no bucket para deletar objetos com mais de 35 dias, ou deixe que o script abaixo faça o expurgo.

### 8.2. Script de Backup Diário (`/opt/gefinc/backup.sh`)

Instale o utilitário `rclone` ou `awscli` no computador local para transferir arquivos para o bucket S3/R2:

```bash
sudo apt install -y awscli
```

Configure as credenciais do bucket:

```bash
aws configure --profile cloudflare-r2
# Informe Access Key, Secret Key e Endpoint do R2 (ex: https://<account_id>.r2.cloudflarestorage.com)
```

Crie o diretório `/opt/gefinc` e o script operacional em `/opt/gefinc/backup.sh`:

```bash
sudo mkdir -p /opt/gefinc
```

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Carregar variáveis de ambiente do GEFINC (.env)
ENV_FILE="${GEFINC_ENV_FILE:-/opt/gefinc/.env}"
if [[ ! -f "${ENV_FILE}" && -f "${HOME}/gefinc/.env" ]]; then
    ENV_FILE="${HOME}/gefinc/.env"
fi

if [[ -f "${ENV_FILE}" ]]; then
    # Exportar variáveis do .env de forma segura
    set -a
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    set +a
fi

# 2. Definições e validação de variáveis obrigatórias
POSTGRES_DB="${POSTGRES_DB:-gefinc}"
DB_USER="${DB_USER:-gefinc_admin}"
DB_PASSWORD="${DB_PASSWORD:-}"
R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-}"
R2_BUCKET="s3://${R2_BUCKET_NAME:-gefinc-db-backups}"
RETENTION_DAYS=35

if [[ -z "${DB_PASSWORD}" ]]; then
    echo "ERRO: A variável DB_PASSWORD não está definida nem no ambiente nem em ${ENV_FILE}." >&2
    exit 1
fi

if [[ -z "${R2_ACCOUNT_ID}" ]]; then
    echo "ERRO: A variável R2_ACCOUNT_ID não está definida nem no ambiente nem em ${ENV_FILE}." >&2
    exit 1
fi

BACKUP_DIR="/tmp/gefinc-backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="gefinc_backup_${TIMESTAMP}.sql.gz"
LOCAL_FILE="${BACKUP_DIR}/${FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Iniciando backup do banco de dados GEFINC (${POSTGRES_DB})..."

# 3. Executar pg_dump com autenticação não-interativa via PGPASSWORD e compactar em gzip
docker exec -e PGPASSWORD="${DB_PASSWORD}" gefinc-postgres \
  pg_dump -U "${DB_USER}" -d "${POSTGRES_DB}" | gzip > "${LOCAL_FILE}"

# 4. Enviar arquivo para o bucket Cloudflare R2
echo "[$(date)] Enviando ${FILENAME} para ${R2_BUCKET}..."
aws s3 cp "${LOCAL_FILE}" "${R2_BUCKET}/${FILENAME}" \
  --profile cloudflare-r2 \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# 5. Remover arquivo temporário local
rm -f "${LOCAL_FILE}"

# 6. Excluir backups remotos mais antigos que 35 dias no bucket R2
echo "[$(date)] Aplicando política de retenção estrita de ${RETENTION_DAYS} dias..."
EXPIRY_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d)

aws s3 ls "${R2_BUCKET}/" \
  --profile cloudflare-r2 \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" | while read -r line; do
    FILE_DATE=$(echo "$line" | awk '{print $4}' | grep -oE '[0-9]{8}' | head -n1 || true)
    FILE_NAME=$(echo "$line" | awk '{print $4}')
    if [[ -n "${FILE_DATE}" && "${FILE_DATE}" -lt "${EXPIRY_DATE}" ]]; then
        echo "Excluindo backup expirado: ${FILE_NAME}"
        aws s3 rm "${R2_BUCKET}/${FILE_NAME}" \
          --profile cloudflare-r2 \
          --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    fi
done

echo "[$(date)] Backup concluído com sucesso."
```

Torne o script executável:

```bash
sudo chmod +x /opt/gefinc/backup.sh
```

### 8.3. Agendamento via Cron

Configure a execução automática diária nas madrugadas (ex: às 03:30 da manhã):

```bash
crontab -e
```

Adicione a seguinte linha:

```text
30 3 * * * /opt/gefinc/backup.sh >> /var/log/gefinc-backup.log 2>&1
```

---

## 9. Checklist de Validação Ponta a Ponta

Execute este checklist prático para assegurar que todo o ecossistema está operante e resiliente:

- [ ] **1. Teste de Acesso Externo à API (Cloudflare Tunnel):**
  De um dispositivo fora da rede Wi-Fi local (ex: via dados 4G/5G do celular):

  ```bash
  curl -i https://api.meudominio.com/api/v1/actuator/health
  # Deve retornar: HTTP/2 200 com {"status":"UP"}
  ```
- [ ] **2. Validação do Web App no Cloudflare Pages:**
  - Acesse `https://app.meudominio.com` pelo navegador.
  - Verifique se a aplicação Angular carrega sem erros de console.
  - Realize um cadastro e login de usuário.
  - Verifique na aba *Network* das Ferramentas de Desenvolvedor se as requisições `/api/v1/...` são enviadas para `https://api.meudominio.com/api/v1/...` (e não para `app.meudominio.com`), recebem status `200` e que as respostas de login trazem `Set-Cookie: gefinc_refresh` com CORS válido.
- [ ] **3. Validação do App Mobile no Smartphone:**
  - Abra o aplicativo instalado via APK.
  - Faça login com a conta recém-criada.
  - Adicione uma transação com valor e categoria.
  - Ative o **Modo Avião** no celular e faça um novo lançamento (validação do modo offline com IndexedDB criptografado).
  - Desative o Modo Avião e confirme a sincronização automática na API local.
- [ ] **4. Teste de Resiliência a Falhas de Energia (Auto-Recovery):**
  - Remova deliberadamente o cabo de força da tomada do computador sobressalente.
  - Reconecte o cabo de força à tomada.
  - **Critério de sucesso:** O computador deve ligar sozinho (BIOS AC Power Loss), inicializar o Linux e os containers Docker `postgres`, `api-server` e `cloudflared` devem subir automaticamente sem qualquer intervenção manual (`unless-stopped`). Em menos de 2 minutos, o endpoint `https://api.meudominio.com` deve voltar a responder normalmente.
- [ ] **5. Teste de Execução do Backup:**
  - Rode `/opt/gefinc/backup.sh` manualmente.
  - Verifique a criação do arquivo no bucket Cloudflare R2 ou AWS S3.
  - Simule uma restauração de teste em um banco local temporário para atestar a integridade do dump.

---

## 10. Boas Práticas Operacionais e Manutenção

1. **No-break (UPS) Básico:**
   - Embora o computador ligue sozinho após a volta da energia, desligamentos abruptos frequentes podem corromper blocos no sistema de arquivos do PostgreSQL. Um no-break simples de 600VA oferece 15 a 30 minutos de autonomia para que o servidor atravesse oscilações rápidas sem interrupções.
2. **Atualizações Automáticas de Segurança do SO:**
   - Habilite o pacote `unattended-upgrades` no Ubuntu/Debian para instalar patches críticos de segurança do kernel e pacotes de rede sem necessidade de manutenção manual frequente:

     ```bash
     sudo apt install -y unattended-upgrades
     sudo dpkg-reconfigure --priority=low unattended-upgrades
     ```
3. **Monitoramento de Saúde do Disco (`smartctl`):**
   - Computadores sobressalentes antigos podem possuir discos rígidos ou SSDs com muitas horas de uso. Instale o pacote `smartmontools` e agende verificações periódicas para antecipar falhas de hardware:

     ```bash
     sudo apt install -y smartmontools
     sudo smartctl -H /dev/sda
     ```
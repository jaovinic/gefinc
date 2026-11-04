# Guia de Deploy e Testes: API no Oracle Cloud Free Tier (VM.Standard.A1.Flex) + App Mobile no Celular

Este guia detalha o passo a passo completo para hospedar o backend do **GEFINC** (Spring Boot 3.5 + PostgreSQL 16) na nuvem gratuita da Oracle Cloud Infrastructure (OCI) utilizando a arquitetura ARM Ampere (`VM.Standard.A1.Flex`), protegê-lo com HTTPS automático via Caddy e conectar o aplicativo móvel Capacitor/Angular diretamente de um smartphone físico.

---

## 1. Especificações da Instância A1.Flex (ARM64)

O programa **OCI Always Free** oferece recursos excepcionalmente generosos na família de processadores ARM Ampere Altra:

- **Cota Total Gratuita:** Até 4 OCPUs e 24 GB de memória RAM por tenancy (mês inteiro sem custo).
- **Dimensionamento Recomendado:**
  - **Opção Dedicada (Recomendada):** 1 instância única com **4 OCPUs** e **24 GB de RAM**, com 50 GB a 100 GB de volume de inicialização (Boot Volume).
  - **Opção Particionada:** 1 instância com **2 OCPUs** e **12 GB de RAM** (deixando metade da cota livre para outros projetos).
- **Sistema Operacional:** Ubuntu 24.04 LTS (ou 22.04 LTS) — arquitetura `aarch64 / arm64`.

### Por que a A1.Flex é ideal para o GEFINC?
A maioria dos provedores em modalidade gratuita restringe as instâncias a 1 vCPU e 512 MB a 1 GB de RAM (x86 micro), tornando a execução do ecossistema Java/Spring inviável sem arquivos de swap lentos e alto risco de congelamento por *Out Of Memory* (OOM).

Com **12 GB a 24 GB de memória real e 4 núcleos ARM**:
1. O **Java 21**, o **Spring Boot 3.5** e o **PostgreSQL 16** rodam com ampla folga de heap e cache de banco.
2. É possível realizar compilações e builds de containers Docker diretamente na VPS sem medo de travamento.
3. Não há necessidade de swap agressivo ou otimizações restritivas que degradam o tempo de resposta das transações.

---

## 2. Configuração de Rede e Segurança na OCI

A liberação do tráfego na Oracle Cloud exige a configuração em **duas camadas independentes**:
1. **OCI VCN (Virtual Cloud Network) Security List** (Firewall de Borda da Nuvem).
2. **iptables nativo do sistema operacional** (Firewall Interno do Ubuntu).

> [!WARNING]
> As imagens oficiais de Ubuntu na OCI vêm com regras rígidas de `iptables` ativas por padrão que rejeitam qualquer conexão de entrada diferente da porta 22 (SSH). Apenas liberar as portas na interface web da OCI **não** abrirá o acesso à sua VPS.

### 2.1. Regras de Entrada na VCN da OCI (Console Web)
No console da Oracle Cloud:
1. Vá em **Networking** > **Virtual Cloud Networks**.
2. Clique na sua VCN e abra a **Default Security List** (ou a lista vinculada à sua sub-rede pública).
3. Em **Ingress Rules**, adicione as seguintes regras:

| Protocolo | Source CIDR | Destination Port Range | Descrição |
|---|---|---|---|
| TCP | `0.0.0.0/0` | `80` | HTTP (Desafio ACME Let's Encrypt / Caddy) |
| TCP | `0.0.0.0/0` | `443` | HTTPS (Tráfego seguro da API para o Celular) |
| TCP | `0.0.0.0/0` | `22` | SSH (Acesso administrativo) |

*(Nota: Mantenha a porta `8080` fechada para a internet pública; todo o tráfego externo passará pelo proxy reverso Caddy na 443).*

### 2.2. Liberação no Firewall Nativo do Ubuntu (iptables)
Conecte-se na VPS via SSH e execute os seguintes comandos para permitir o tráfego nas portas 80 e 443 antes da regra de descarte padrão:

```bash
# Inserir regras para portas 80 e 443 no iptables nativo do Ubuntu na OCI
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT

# Persistir as regras para reinicializações futuras
sudo apt update && sudo apt install -y netfilter-persistent iptables-persistent
sudo netfilter-persistent save
sudo netfilter-persistent reload
```

---

## 3. Instalação e Preparação da VPS

### 3.1. Atualização do Sistema e Utilitários
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw ca-certificates gnupg lsb-release
```

### 3.2. Instalação do Docker e Docker Compose (ARM64)
Instale o Docker utilizando o repositório oficial da Docker para garantir suporte otimizado ao kernel ARM64:

```bash
# Adicionar chave GPG oficial da Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Configurar o repositório da Docker para arm64
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker Engine e plugins
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Permitir executar docker sem sudo
sudo usermod -aG docker $USER
newgrp docker
```

Valide a instalação:
```bash
docker --version
docker compose version
```

### 3.3. Clonagem do Repositório do GEFINC
```bash
cd ~
git clone https://github.com/seu-usuario/gefinc.git
cd gefinc
```

---

## 4. Configuração da Aplicação

### 4.1. Dockerfile Otimizado Multi-Stage (ARM64 / Java 21)
Caso ainda não possua um Dockerfile dedicado para a API, crie o arquivo `apps/api-server/Dockerfile`:

```dockerfile
# Estágio 1: Build da aplicação com Maven e JDK 21
FROM eclipse-temurin:21-jdk-jammy AS builder
WORKDIR /workspace

# Copiar arquivos de dependências do Maven
COPY apps/api-server/.mvn .mvn
COPY apps/api-server/mvnw .
COPY apps/api-server/pom.xml .

# Baixar dependências para cache
RUN ./mvnw dependency:go-offline -B

# Copiar o código fonte e gerar o pacote
COPY apps/api-server/src src
RUN ./mvnw clean package -DskipTests -B

# Estágio 2: Imagem final enxuta com JRE 21
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# Usuário de sistema não privilegiado
RUN groupadd -r gefinc && useradd -r -g gefinc gefinc

COPY --from=builder /workspace/target/gefinc-api-server-*.jar app.jar
RUN chown -R gefinc:gefinc /app

USER gefinc

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
```

### 4.2. Docker Compose para Produção / OCI (`docker-compose.oracle.yml`)
Crie na raiz do repositório o arquivo `docker-compose.oracle.yml`:

```yaml
name: gefinc-prod

services:
  postgres:
    image: postgres:16
    container_name: gefinc-postgres
    restart: always
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-gefinc}
      POSTGRES_USER: ${DB_USER:-gefinc}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - gefinc-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-gefinc} -d ${POSTGRES_DB:-gefinc}"]
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
    restart: always
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
      MAIL_FROM: ${MAIL_FROM:-no-reply@gefinc.local}
      JAVA_TOOL_OPTIONS: "-Xms512m -Xmx2g -XX:+UseG1GC"
    expose:
      - "8080"
    networks:
      - gefinc-net

  caddy:
    image: caddy:2.9-alpine
    container_name: gefinc-caddy
    restart: always
    depends_on:
      - api-server
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - gefinc-caddy-data:/data
      - gefinc-caddy-config:/config
    networks:
      - gefinc-net

volumes:
  gefinc-pgdata:
  gefinc-caddy-data:
  gefinc-caddy-config:

networks:
  gefinc-net:
    driver: bridge
```

> [!IMPORTANT]
> A variável `FORWARD_HEADERS_STRATEGY=native` é obrigatória ao rodar atrás do Caddy. Ela instrui o Spring Boot a extrair o IP real do cabeçalho `X-Forwarded-For`, permitindo que a proteção contra força bruta de login (limite de 20 falhas por IP) opere corretamente.

### 4.3. Variáveis de Ambiente Seguras (`.env`)
Gere uma chave segura para o JWT e configure o `.env` na VPS:

```bash
# Gerar chave JWT segura com 64 caracteres hexadecimais
JWT_KEY=$(openssl rand -hex 32)
DB_PASS=$(openssl rand -hex 16)

cat <<EOF > .env
POSTGRES_DB=gefinc
DB_USER=gefinc_admin
DB_PASSWORD=${DB_PASS}
JWT_SECRET=${JWT_KEY}
APP_BASE_URL=https://gefinc-api.duckdns.org
SMTP_HOST=localhost
SMTP_PORT=1025
MAIL_FROM=no-reply@gefinc.duckdns.org
EOF

chmod 600 .env
```

---

## 5. Exposição Segura via HTTPS com Caddy e DuckDNS

### 5.1. Por que o HTTPS é Mandatório?
A partir do Android 9 (API 28), as conexões HTTP em texto puro (*Cleartext*) são bloqueadas por padrão pelo sistema operacional e pelo WebView do Capacitor. Conexões sem TLS geram o erro:
`net::ERR_CLEARTEXT_NOT_PERMITTED`

Além disso, certificados autoassinados são rejeitados pelo Android sem configurações manuais complexas de confiança de certificados. O **Caddy** resolve isso emitindo certificados válidos e reconhecidos mundialmente da **Let's Encrypt** de forma totalmente automatizada.

### 5.2. Configurando o DuckDNS (DNS Dinâmico Gratuito)
1. Acesse [https://www.duckdns.org](https://www.duckdns.org) e autentique-se com sua conta (ex: GitHub).
2. Na seção **domains**, crie um subdomínio (exemplo: `gefinc-api`).
3. No campo **current ip**, informe o **IP Público reservado da sua instância OCI**.
4. Clique em **update ip**. Seu domínio será `gefinc-api.duckdns.org`.

### 5.3. Criando o `Caddyfile`
Na raiz do projeto na VPS, crie o arquivo `Caddyfile`:

```caddy
gefinc-api.duckdns.org {
    # Redireciona todas as requisições para a API Spring Boot
    reverse_proxy api-server:8080 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    # Cabeçalhos recomendados de segurança
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }

    # Logs de acesso
    log {
        output stdout
        format console
    }
}
```

### 5.4. Subindo o Ambiente na VPS
Com todos os arquivos preparados, inicie os containers:

```bash
docker compose -f docker-compose.oracle.yml up -d --build
```

Acompanhe os logs da inicialização e da emissão do certificado TLS:
```bash
docker compose -f docker-compose.oracle.yml logs -f caddy
docker compose -f docker-compose.oracle.yml logs -f api-server
```

---

## 6. Conexão do App Mobile

Com a API remota rodando sob HTTPS com certificado válido, você pode compilar o app mobile na sua máquina de desenvolvimento local e instalá-lo no celular físico.

### 6.1. Alterando o Endpoint da API no Mobile
Edite o arquivo [apps/mobile-app/src/environments/environment.ts](file:///home/xiriu/Projetos/jvtech/gefinc/apps/mobile-app/src/environments/environment.ts):

```typescript
export const environment = {
  // Exemplo: aponte para o seu subdomínio HTTPS com o context-path da API
  apiUrl: 'https://gefinc-api.duckdns.org/api/v1',
};
```

> O mobile não tem `environment.prod`: o valor de `environment.ts` vai direto para o APK. O build antigo em `apps/mobile-app/android/app/src/main/assets/public` persiste até um novo sync.

### 6.2. Fluxo de Build e Sincronização do Capacitor
No seu computador local, execute os comandos do Nx e Capacitor:

```bash
# Build do frontend móvel + cap sync (com o diretório correto, apps/mobile-app)
npx nx run mobile-app:sync
```

Qualquer comando `cap` executado diretamente precisa de `cd apps/mobile-app` antes.

### 6.3. Compilação do APK de Debug e Instalação via ADB

Conecte o seu smartphone Android ao computador via cabo USB, ative as **Opções do Desenvolvedor** e a **Depuração USB**.

Verifique se o aparelho foi detectado:
```bash
adb devices
# Deve listar: <ID_DO_DISPOSITIVO>    device
```

Compile e instale o APK diretamente no dispositivo:
```bash
# Navegar até a pasta do projeto nativo Android
cd apps/mobile-app/android

# Compilar o APK de desenvolvimento
./gradlew assembleDebug

# Instalar no celular conectado
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

*(Como alternativa: `cd apps/mobile-app && npx cap run android`)*.

O `assembleRelease` não tem assinatura configurada (o APK não instala); para testes use `assembleDebug`.

---

## 7. Checklist de Teste e Validação do Fluxo Completo

Execute o seguinte checklist para validar a integridade de ponta a ponta:

- [ ] **1. Teste de Conectividade HTTPS Externa:**
  No seu computador ou navegador do celular, consulte o endpoint de health check:
  ```bash
  curl -i https://gefinc-api.duckdns.org/api/v1/actuator/health
  # Resposta esperada: HTTP/2 200 com {"status":"UP"}
  ```

- [ ] **2. Validação do Certificado SSL:**
  Verifique se o navegador reconhece o cadeado seguro sem emitir alertas de autoridade desconhecida.

- [ ] **3. Cadastro e Login no Celular:**
  - Abra o app **GEFINC** no smartphone.
  - Crie uma nova conta com e-mail e senha válida.
  - Verifique na VPS se a transação foi registrada no banco:
    ```bash
    docker compose -f docker-compose.oracle.yml exec postgres psql -U gefinc_admin -d gefinc -c "SELECT email, created_at FROM users;"
    ```

- [ ] **4. Lançamento Financeiro e Idempotência:**
  - Crie uma nova despesa ou receita no aplicativo.
  - Marque como paga/recebida.
  - Verifique na VPS se a tabela `idempotency_keys` registrou a chave enviada pelo cabeçalho `Idempotency-Key`.

- [ ] **5. Teste do Modo Offline:**
  - Ative o **Modo Avião** (desconecte Wi-Fi e dados móveis) no smartphone.
  - Crie uma nova transação financeira no app.
  - Verifique que o app salva localmente na fila segura (cifrada com AES-GCM via Keystore).
  - Desative o Modo Avião.
  - Observe a fila sendo processada e os dados sincronizados automaticamente com o servidor Oracle Cloud.

- [ ] **6. Verificação de Logs e Redação de Dados Sensíveis:**
  Inspecione os logs da API na VPS para garantir que senhas, tokens e valores financeiros não estão vazando nos logs:
  ```bash
  docker compose -f docker-compose.oracle.yml logs --tail=100 api-server
  ```

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

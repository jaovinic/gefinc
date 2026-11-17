package com.jvtech.gefinc.common.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;

/** FR-003: e-mail, senha, tokens e valores financeiros nunca aparecem nos logs, nem nos de erro. */
class LogRedactionIT extends IntegrationTestBase {

  private static final List<String> LOGGERS_RAISED =
      List.of(
          "com.jvtech.gefinc",
          "org.springframework.web",
          "org.springframework.security",
          "org.hibernate.SQL",
          "org.hibernate.validator");

  private static final String EMAIL = "privacidade.logs@example.com";
  private static final String PASSWORD = "senha-secreta-987";
  private static final String AMOUNT = "7654.32";
  private static final String TRANSFER_AMOUNT = "3210.98";
  private static final String TRANSFER_NOTE = "Reserva confidencial do mes";

  private ListAppender<ILoggingEvent> appender;
  private Logger root;
  private Level previousLevel;

  @BeforeEach
  void captureLogs() {
    root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
    previousLevel = root.getLevel();
    // Cenário de investigação: app em TRACE e Spring Web/Security e SQL em DEBUG. O TRACE de bind
    // do
    // Hibernate e do driver imprime valores por natureza e não deve ser ligado
    // (docs/operations.md).
    root.setLevel(Level.INFO);
    for (String name : LOGGERS_RAISED) {
      ((Logger) LoggerFactory.getLogger(name))
          .setLevel(name.equals("com.jvtech.gefinc") ? Level.TRACE : Level.DEBUG);
    }
    appender = new ListAppender<>();
    appender.start();
    root.addAppender(appender);
  }

  @AfterEach
  void releaseLogs() {
    root.detachAppender(appender);
    root.setLevel(previousLevel);
    LOGGERS_RAISED.forEach(name -> ((Logger) LoggerFactory.getLogger(name)).setLevel(null));
  }

  @Test
  void fluxosDeAcessoELancamentoNaoVazamDadosSensiveisNosLogs() throws Exception {
    TestApi api = new TestApi(mockMvc, objectMapper);
    String credentials =
        objectMapper.writeValueAsString(Map.of("email", EMAIL, "password", PASSWORD));

    mockMvc.perform(
        post("/auth/register").contentType(MediaType.APPLICATION_JSON).content(credentials));
    String loginBody =
        mockMvc
            .perform(
                post("/auth/login").contentType(MediaType.APPLICATION_JSON).content(credentials))
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode tokens = objectMapper.readTree(loginBody);
    String access = tokens.get("accessToken").asText();
    String refresh = tokens.get("refreshToken").asText();
    TestUser user = new TestUser(1L, EMAIL, access);

    // lançamento com valor financeiro
    long checking = api.checking(user, "Conta corrente");
    long category = api.category(user, "Alimentação");
    api.createGroup(
        user,
        api.variableBody("Compra grande", AMOUNT, checking, category, "2026-11-08", "2026-11-15"));

    // transferência entre contas: valor e descrição também não podem aparecer, nem nos erros
    long wallet = api.cash(user, "Carteira");
    Map<String, Object> transfer =
        api.transferBody(checking, wallet, TRANSFER_AMOUNT, "2026-11-09");
    transfer.put("description", TRANSFER_NOTE);
    api.call(user, HttpMethod.POST, "/transfers", transfer);
    api.call(
        user,
        HttpMethod.POST,
        "/transfers",
        api.transferBody(checking, checking, TRANSFER_AMOUNT, "2026-11-09"));
    api.call(user, HttpMethod.GET, "/transfers?month=2026-11", null);
    api.call(user, HttpMethod.GET, "/balances", null);

    // caminhos de erro: senha errada, e-mail duplicado, token inválido, recuperação de senha
    mockMvc.perform(
        post("/auth/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                objectMapper.writeValueAsString(
                    Map.of("email", EMAIL, "password", PASSWORD + "x"))));
    mockMvc.perform(
        post("/auth/register").contentType(MediaType.APPLICATION_JSON).content(credentials));
    mockMvc.perform(get("/accounts").header("Authorization", "Bearer " + access + "corrompido"));
    mockMvc.perform(
        post("/auth/password-reset/request")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("email", EMAIL))));
    mockMvc.perform(
        post("/auth/refresh")
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("refreshToken", refresh))));
    awaitPendingMails();

    assertThat(appender.list).as("o teste precisa ter capturado logs para ser válido").isNotEmpty();
    List<String> forbidden =
        List.of(
            EMAIL.toLowerCase(),
            PASSWORD,
            access,
            refresh,
            AMOUNT,
            "7654,32",
            TRANSFER_AMOUNT,
            "3210,98",
            TRANSFER_NOTE);
    List<String> leaks =
        appender.list.stream()
            // GreenMail é o servidor de e-mail falso dos testes, não código da aplicação.
            .filter(event -> !event.getLoggerName().startsWith("com.icegreen"))
            .filter(
                event ->
                    forbidden.stream()
                        .anyMatch(f -> textOf(event).toLowerCase().contains(f.toLowerCase())))
            .map(event -> event.getLoggerName() + " -> " + abbreviate(event.getFormattedMessage()))
            .distinct()
            .toList();
    assertThat(leaks).as("linhas de log com dado sensível").isEmpty();
  }

  @Test
  void fluxosDeConviteERenomeacaoNaoVazamDadosSensiveisNosLogs() throws Exception {
    String adminEmail = "adm.logredaction@example.com";
    String inviteeEmail = "convidado.logredaction@example.com";
    String inviteePassword = "senha-convidado-987";
    String initialName = "Nome Convidado Secreto";
    String updatedName = "Nome Atualizado Muito Secreto";

    seed.createAdmin(adminEmail);
    String loginBody =
        mockMvc
            .perform(
                post("/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        objectMapper.writeValueAsString(
                            Map.of(
                                "email",
                                adminEmail,
                                "password",
                                com.jvtech.gefinc.support.TestUsers.PASSWORD))))
            .andReturn()
            .getResponse()
            .getContentAsString();
    String adminToken = objectMapper.readTree(loginBody).get("accessToken").asText();

    // 1. Criar convite
    mockMvc
        .perform(
            post("/admin/invitations")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", inviteeEmail))))
        .andExpect(
            org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isCreated());

    awaitPendingMails();
    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    jakarta.mail.internet.MimeMessage[] msgs = GREEN_MAIL.getReceivedMessages();
    String mailBody =
        String.valueOf(msgs[msgs.length - 1].getContent()).replace("=\r\n", "").replace("=\n", "");
    java.util.regex.Matcher m =
        java.util.regex.Pattern.compile("/invitations/([A-Za-z0-9_-]+)").matcher(mailBody);
    assertThat(m.find()).isTrue();
    String token = m.group(1);

    // 2. Consulta pública
    mockMvc
        .perform(get("/auth/invitations/" + token))
        .andExpect(
            org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());

    // 3. Aceite público
    String acceptBody =
        mockMvc
            .perform(
                post("/auth/invitations/" + token + "/accept")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        objectMapper.writeValueAsString(
                            Map.of("password", inviteePassword, "name", initialName))))
            .andExpect(
                org.springframework.test.web.servlet.result.MockMvcResultMatchers.status()
                    .isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    long createdUserId = objectMapper.readTree(acceptBody).get("id").asLong();

    // 4. Renomeação pelo admin
    mockMvc
        .perform(
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(
                    "/admin/users/" + createdUserId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("name", updatedName))))
        .andExpect(
            org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());

    List<String> forbidden =
        List.of(inviteeEmail.toLowerCase(), inviteePassword, token, initialName, updatedName);

    List<String> leaks =
        appender.list.stream()
            // GreenMail é o servidor de e-mail falso dos testes, não código da aplicação.
            .filter(event -> !event.getLoggerName().startsWith("com.icegreen"))
            // FilterChainProxy em DEBUG registra a URI da requisição recebida (caminho público)
            .filter(
                event ->
                    !event
                        .getLoggerName()
                        .equals("org.springframework.security.web.FilterChainProxy"))
            .filter(
                event ->
                    forbidden.stream()
                        .anyMatch(f -> textOf(event).toLowerCase().contains(f.toLowerCase())))
            .map(event -> event.getLoggerName() + " -> " + abbreviate(event.getFormattedMessage()))
            .distinct()
            .toList();
    assertThat(leaks).as("linhas de log com dado sensível de convite/renomeação").isEmpty();
  }

  @Test
  void fluxosDeTrocaDeEmailEExclusaoNaoVazamDadosSensiveisNosLogs() throws Exception {
    String adminEmail = "adm.redaction2@example.com";
    String targetEmail = "alvo.redaction@example.com";
    String newEmail = "novo.redaction@example.com";
    String justification = "Justificativa ultrassecreta 9876543210 com motivo confidencial";
    String clientIp = "198.51.100.99";

    seed.createAdmin(adminEmail);
    String loginBody =
        mockMvc
            .perform(
                post("/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        objectMapper.writeValueAsString(
                            Map.of(
                                "email",
                                adminEmail,
                                "password",
                                com.jvtech.gefinc.support.TestUsers.PASSWORD))))
            .andReturn()
            .getResponse()
            .getContentAsString();
    String adminToken = objectMapper.readTree(loginBody).get("accessToken").asText();

    com.jvtech.gefinc.support.TestUsers users =
        new com.jvtech.gefinc.support.TestUsers(mockMvc, objectMapper);
    TestUser target = users.registerAndLogin(targetEmail);

    // 1. Troca de e-mail: solicitação
    mockMvc
        .perform(
            post("/admin/users/" + target.id() + "/email-change")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("newEmail", newEmail))))
        .andExpect(
            org.springframework.test.web.servlet.result.MockMvcResultMatchers.status()
                .isAccepted());

    awaitPendingMails();
    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    jakarta.mail.internet.MimeMessage[] msgs = GREEN_MAIL.getReceivedMessages();
    String mailBody = String.valueOf(msgs[msgs.length - 1].getContent());
    java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\b(\\d{6})\\b").matcher(mailBody);
    assertThat(m.find()).isTrue();
    String code = m.group(1);

    // Confirmação da troca de e-mail
    mockMvc
        .perform(
            post("/admin/users/" + target.id() + "/email-change/confirm")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("code", code))))
        .andExpect(
            org.springframework.test.web.servlet.result.MockMvcResultMatchers.status()
                .isNoContent());

    awaitPendingMails();

    // 2. Exclusão com justificativa livre
    Long reasonId =
        jdbc.queryForObject(
            "SELECT id FROM deletion_reasons WHERE active = true LIMIT 1", Long.class);

    var deletionBody =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            justification,
            "mode",
            "IMMEDIATE",
            "confirmEmail",
            newEmail,
            "password",
            com.jvtech.gefinc.support.TestUsers.PASSWORD);

    mockMvc
        .perform(
            post("/admin/users/" + target.id() + "/deletion")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .with(
                    request -> {
                      request.setRemoteAddr(clientIp);
                      return request;
                    })
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(deletionBody)))
        .andExpect(
            org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());

    awaitPendingMails();

    List<String> forbidden =
        List.of(
            targetEmail.toLowerCase(),
            newEmail.toLowerCase(),
            code,
            justification,
            com.jvtech.gefinc.support.TestUsers.PASSWORD,
            clientIp);

    List<String> leaks =
        appender.list.stream()
            .filter(event -> !event.getLoggerName().startsWith("com.icegreen"))
            .filter(
                event ->
                    !event
                        .getLoggerName()
                        .equals("org.springframework.security.web.FilterChainProxy"))
            .filter(
                event ->
                    forbidden.stream()
                        .anyMatch(f -> textOf(event).toLowerCase().contains(f.toLowerCase())))
            .map(event -> event.getLoggerName() + " -> " + abbreviate(event.getFormattedMessage()))
            .distinct()
            .toList();
    assertThat(leaks).as("linhas de log com dado sensível de troca de e-mail e exclusão").isEmpty();
  }

  private static String abbreviate(String text) {
    String oneLine = text.replace('\n', ' ');
    return oneLine.length() > 160 ? oneLine.substring(0, 160) + "…" : oneLine;
  }

  private static String textOf(ILoggingEvent event) {
    StringBuilder text = new StringBuilder(event.getFormattedMessage()).append('\n');
    event.getMDCPropertyMap().values().forEach(v -> text.append(v).append('\n'));
    for (IThrowableProxy t = event.getThrowableProxy(); t != null; t = t.getCause()) {
      text.append(t.getMessage()).append('\n');
    }
    return text.toString();
  }
}

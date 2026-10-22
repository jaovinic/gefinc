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

    assertThat(appender.list).as("o teste precisa ter capturado logs para ser válido").isNotEmpty();
    List<String> forbidden =
        List.of(EMAIL.toLowerCase(), PASSWORD, access, refresh, AMOUNT, "7654,32");
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

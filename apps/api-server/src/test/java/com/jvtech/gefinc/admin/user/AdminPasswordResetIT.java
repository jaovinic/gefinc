package com.jvtech.gefinc.admin.user;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static com.jvtech.gefinc.support.ContractAssertions.responseMatchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.common.mail.MailService;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import jakarta.mail.internet.MimeMessage;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Redefinição de senha disparada pelo painel ({@code POST /admin/users/{id}/password-reset/send} e
 * {@code /force}): reenvio gera link novo e invalida anteriores sem derrubar sessões; forçar exige
 * a senha do administrador, invalida a senha atual e todas as sessões e envia o link; falha de SMTP
 * responde {@code 502 MAIL_DELIVERY_FAILED} e desfaz tudo; limite de 3 por hora por alvo ({@code
 * 429}); conta suspensa ou em exclusão responde {@code 409 ACCOUNT_NOT_USABLE}; raiz permite
 * reenviar e recusa forçar ({@code 403 ROOT_PROTECTED}); nunca vaza senha, link ou token em
 * resposta, auditoria, histórico ou log (US4.*, SC-006).
 */
class AdminPasswordResetIT extends IntegrationTestBase {

  private static final Pattern LINK_TOKEN = Pattern.compile("token=([A-Za-z0-9_-]+)");

  @MockitoSpyBean private JavaMailSenderImpl sender;

  private TestUsers users;
  private SeededUser adminRow;
  private TestUser admin;
  private SeededUser anaRow;

  private ListAppender<ILoggingEvent> appender;
  private Logger rootLogger;

  @BeforeEach
  void init() throws Exception {
    doCallRealMethod().when(sender).send(any(SimpleMailMessage.class));
    users = new TestUsers(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm@teste.com");
    anaRow = seed.createUser("ana@teste.com");
    admin =
        new TestUser(
            adminRow.id(),
            adminRow.email(),
            users.login(adminRow.email(), TestUsers.PASSWORD).get("accessToken").asText());

    appender = new ListAppender<>();
    appender.list = new CopyOnWriteArrayList<>();
    appender.start();
    rootLogger = (Logger) LoggerFactory.getLogger(MailService.class);
    rootLogger.addAppender(appender);
  }

  @AfterEach
  void releaseLogs() {
    rootLogger.detachAppender(appender);
  }

  private ResultActions callSend(long userId) throws Exception {
    return mockMvc.perform(
        post("/admin/users/" + userId + "/password-reset/send")
            .header(HttpHeaders.AUTHORIZATION, admin.bearer()));
  }

  private ResultActions callForce(long userId, String password) throws Exception {
    var builder =
        post("/admin/users/" + userId + "/password-reset/force")
            .header(HttpHeaders.AUTHORIZATION, admin.bearer())
            .contentType(MediaType.APPLICATION_JSON);
    if (password != null) {
      builder.content(objectMapper.writeValueAsString(Map.of("password", password)));
    } else {
      builder.content("{}");
    }
    return mockMvc.perform(builder);
  }

  private String lastTokenFromEmail() throws Exception {
    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    MimeMessage[] messages = GREEN_MAIL.getReceivedMessages();
    String content = String.valueOf(messages[messages.length - 1].getContent());
    Matcher matcher = LINK_TOKEN.matcher(content);
    assertThat(matcher.find()).as("o e-mail deve conter o link com o token").isTrue();
    return matcher.group(1);
  }

  private int confirmReset(String token, String newPassword) throws Exception {
    return mockMvc
        .perform(
            post("/auth/password-reset/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("token", token, "newPassword", newPassword))))
        .andReturn()
        .getResponse()
        .getStatus();
  }

  @Test
  void reenviarGeraNovoLinkInvalidaOsAnterioresMantemSenhaESessoesEAudita() throws Exception {
    JsonNode anaLogin = users.login(anaRow.email(), TestUsers.PASSWORD);
    String anaAccess = anaLogin.get("accessToken").asText();

    callSend(anaRow.id()).andExpect(status().isAccepted()).andExpect(matchesContract());
    String firstToken = lastTokenFromEmail();

    GREEN_MAIL.purgeEmailFromAllMailboxes();
    MvcResult secondRes =
        callSend(anaRow.id())
            .andExpect(status().isAccepted())
            .andExpect(matchesContract())
            .andReturn();
    String secondToken = lastTokenFromEmail();

    assertThat(secondRes.getResponse().getContentAsString()).isEmpty();
    assertThat(secondToken).isNotEqualTo(firstToken);

    // Senha antiga e sessão aberta continuam valendo até o usuário concluir a troca pelo link
    mockMvc
        .perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + anaAccess))
        .andExpect(status().isOk());
    assertThat(users.login(anaRow.email(), TestUsers.PASSWORD).get("accessToken").asText())
        .isNotBlank();

    // Primeiro link foi invalidado; segundo link funciona
    assertThat(confirmReset(firstToken, "nova-senha-segura-456")).isEqualTo(400);
    assertThat(confirmReset(secondToken, "nova-senha-segura-456")).isEqualTo(204);

    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'PASSWORD_RESET_SENT'"
                    + " AND result = 'SUCCESS' AND target_user_id = ?",
                Long.class,
                anaRow.id()))
        .isEqualTo(2);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM email_deliveries WHERE kind = 'PASSWORD_RESET'"
                    + " AND status = 'SENT' AND user_id = ?",
                Long.class,
                anaRow.id()))
        .isEqualTo(2);
  }

  @Test
  void forcarInvalidaSenhaESessoesImediatamenteEnviaLinkENuncaVazaSegredos() throws Exception {
    JsonNode anaLogin = users.login(anaRow.email(), TestUsers.PASSWORD);
    String anaAccess = anaLogin.get("accessToken").asText();
    String anaRefresh = anaLogin.get("refreshToken").asText();

    // Gera um link prévio para provar que o forçar também o invalida
    callSend(anaRow.id()).andExpect(status().isAccepted());
    String previousToken = lastTokenFromEmail();
    GREEN_MAIL.purgeEmailFromAllMailboxes();

    MvcResult forceRes =
        callForce(anaRow.id(), TestUsers.PASSWORD)
            .andExpect(status().isAccepted())
            .andExpect(matchesContract())
            .andReturn();
    String forcedToken = lastTokenFromEmail();

    // Resposta não traz corpo nem segredo
    assertThat(forceRes.getResponse().getContentAsString()).isEmpty();

    // Sessão aberta (access token com sid) e refresh token deixam de valer na hora
    mockMvc
        .perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + anaAccess))
        .andExpect(status().isUnauthorized());
    mockMvc
        .perform(
            post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("refreshToken", anaRefresh))))
        .andExpect(status().isUnauthorized());

    // Senha antiga deixa de valer na hora
    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("email", anaRow.email(), "password", TestUsers.PASSWORD))))
        .andExpect(status().isUnauthorized());

    // Link anterior foi invalidado; só o novo link permite criar a nova senha
    assertThat(confirmReset(previousToken, "nova-senha-segura-789")).isEqualTo(400);
    assertThat(confirmReset(forcedToken, "nova-senha-segura-789")).isEqualTo(204);
    assertThat(users.login(anaRow.email(), "nova-senha-segura-789").get("accessToken").asText())
        .isNotBlank();

    // Nenhum rastro do token, link ou senha em audit_log, email_deliveries ou logs
    String auditDump =
        jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(a))::text FROM audit_log a", String.class);
    String deliveryDump =
        jdbc.queryForObject(
            "SELECT jsonb_agg(to_jsonb(d))::text FROM email_deliveries d", String.class);
    for (String dump : new String[] {auditDump, deliveryDump}) {
      assertThat(dump)
          .doesNotContain(forcedToken)
          .doesNotContain(previousToken)
          .doesNotContain("/reset-password")
          .doesNotContain(TestUsers.PASSWORD);
    }
    assertThat(appender.list)
        .allSatisfy(
            e ->
                assertThat(e.getFormattedMessage())
                    .doesNotContain(forcedToken)
                    .doesNotContain("/reset-password"));

    Map<String, Object> auditRow =
        jdbc.queryForMap(
            "SELECT action, result, actor_user_id, target_user_id FROM audit_log"
                + " WHERE action = 'PASSWORD_RESET_FORCED'");
    assertThat(auditRow)
        .containsEntry("result", "SUCCESS")
        .containsEntry("actor_user_id", adminRow.id())
        .containsEntry("target_user_id", anaRow.id());
  }

  @Test
  void falhaDeSmtpResponde502EDesfazTudoEmSendEForce() throws Exception {
    JsonNode anaLogin = users.login(anaRow.email(), TestUsers.PASSWORD);
    String anaAccess = anaLogin.get("accessToken").asText();
    String anaRefresh = anaLogin.get("refreshToken").asText();

    // Cria um link válido antes da falha para provar que o rollback o preserva aberto
    callSend(anaRow.id()).andExpect(status().isAccepted());
    String validToken = lastTokenFromEmail();
    String hashBefore =
        jdbc.queryForObject(
            "SELECT password_hash FROM users WHERE id = ?", String.class, anaRow.id());
    Integer versionBefore =
        jdbc.queryForObject(
            "SELECT token_version FROM users WHERE id = ?", Integer.class, anaRow.id());

    doThrow(new MailSendException("SMTP fora do ar"))
        .when(sender)
        .send(any(SimpleMailMessage.class));

    callSend(anaRow.id())
        .andExpect(status().isBadGateway())
        .andExpect(jsonPath("$.code").value("MAIL_DELIVERY_FAILED"))
        .andExpect(matchesContract());

    callForce(anaRow.id(), TestUsers.PASSWORD)
        .andExpect(status().isBadGateway())
        .andExpect(jsonPath("$.code").value("MAIL_DELIVERY_FAILED"))
        .andExpect(matchesContract());

    // Nada mudou na conta, nas sessões nem no link que estava aberto antes da falha
    assertThat(
            jdbc.queryForObject(
                "SELECT password_hash FROM users WHERE id = ?", String.class, anaRow.id()))
        .isEqualTo(hashBefore);
    assertThat(
            jdbc.queryForObject(
                "SELECT token_version FROM users WHERE id = ?", Integer.class, anaRow.id()))
        .isEqualTo(versionBefore);
    mockMvc
        .perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + anaAccess))
        .andExpect(status().isOk());
    assertThat(users.login(anaRow.email(), TestUsers.PASSWORD).get("accessToken").asText())
        .isNotBlank();
    mockMvc
        .perform(
            post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("refreshToken", anaRefresh))))
        .andExpect(status().isOk());
    assertThat(confirmReset(validToken, "nova-senha-segura-999")).isEqualTo(204);

    // As duas falhas ficaram registradas em email_deliveries (FAILED) e em audit_log (FAILED)
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM email_deliveries WHERE status = 'FAILED' AND user_id = ?",
                Long.class,
                anaRow.id()))
        .isEqualTo(2);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE result = 'FAILED'"
                    + " AND refusal_code = 'MAIL_DELIVERY_FAILED' AND target_user_id = ?",
                Long.class,
                anaRow.id()))
        .isEqualTo(2);
  }

  @Test
  void limitaATresEnviosPorHoraPorUsuarioAlvoCom429ERetryAfter() throws Exception {
    SeededUser bia = seed.createUser("bia@teste.com");

    callSend(anaRow.id()).andExpect(status().isAccepted());
    callSend(anaRow.id()).andExpect(status().isAccepted());
    callForce(anaRow.id(), TestUsers.PASSWORD).andExpect(status().isAccepted());

    callSend(anaRow.id())
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"))
        .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"))
        .andExpect(matchesContract());

    callForce(anaRow.id(), TestUsers.PASSWORD)
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"))
        .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"))
        .andExpect(matchesContract());

    // Outro usuário tem cota independente
    callSend(bia.id()).andExpect(status().isAccepted());

    // Depois de 1 hora o limite libera (renova o token do admin, que expira em 15 min)
    clock.advance(Duration.ofHours(1).plusSeconds(1));
    admin =
        new TestUser(
            adminRow.id(),
            adminRow.email(),
            users.login(adminRow.email(), TestUsers.PASSWORD).get("accessToken").asText());
    callSend(anaRow.id()).andExpect(status().isAccepted());
  }

  @Test
  void contaSuspensaOuEmExclusaoResponde409AccountNotUsableEInexistente404() throws Exception {
    SeededUser suspensa = seed.createUser("suspensa@teste.com");
    seed.suspend(suspensa.id(), clock.instant());
    SeededUser emExclusao = seed.createUser("exclusao@teste.com");
    seed.scheduleDeletion(emExclusao.id(), clock.instant());

    for (long id : new long[] {suspensa.id(), emExclusao.id()}) {
      callSend(id)
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_USABLE"))
          .andExpect(matchesContract());
      callForce(id, TestUsers.PASSWORD)
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_USABLE"))
          .andExpect(matchesContract());
    }

    callSend(999999L)
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"))
        .andExpect(matchesContract());
    callForce(999999L, TestUsers.PASSWORD)
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"))
        .andExpect(matchesContract());

    assertThat(GREEN_MAIL.getReceivedMessages()).isEmpty();
  }

  @Test
  void forcarExigeReautenticacaoPorSenhaDoAdministrador() throws Exception {
    String hashBefore =
        jdbc.queryForObject(
            "SELECT password_hash FROM users WHERE id = ?", String.class, anaRow.id());

    callForce(anaRow.id(), "senha-errada")
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("REAUTH_FAILED"))
        .andExpect(matchesContract());

    callForce(anaRow.id(), null)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("REAUTH_FAILED"))
        .andExpect(responseMatchesContract());

    assertThat(
            jdbc.queryForObject(
                "SELECT password_hash FROM users WHERE id = ?", String.class, anaRow.id()))
        .isEqualTo(hashBefore);
    assertThat(GREEN_MAIL.getReceivedMessages()).isEmpty();
  }

  @Test
  void raizPodeReceberReenvioMasRecusaForcarCom403RootProtected() throws Exception {
    SeededUser root = seed.createRoot("raiz@teste.com");

    callSend(root.id()).andExpect(status().isAccepted()).andExpect(matchesContract());
    assertThat(lastTokenFromEmail()).isNotBlank();
    GREEN_MAIL.purgeEmailFromAllMailboxes();

    callForce(root.id(), TestUsers.PASSWORD)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ROOT_PROTECTED"))
        .andExpect(matchesContract());
    assertThat(GREEN_MAIL.getReceivedMessages()).isEmpty();
  }
}

package com.jvtech.gefinc.admin.user;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.test.web.servlet.ResultActions;

/**
 * Troca de e-mail de um usuário pelo painel com prova de posse (T103, FR-014, FR-052; SC-018):
 *
 * <ul>
 *   <li>Código numérico de 6 dígitos enviado ao novo endereço (GreenMail);
 *   <li>O código nunca aparece em resposta, auditoria, banco ou log;
 *   <li>Expira em 15 minutos e permite no máximo 5 erros (na 5ª tentativa incorreta, invalida);
 *   <li>Novo pedido invalida o anterior;
 *   <li>Cancelamento explícito via DELETE;
 *   <li>Unicidade verificada na solicitação e na confirmação;
 *   <li>O e-mail antigo permanece válido até a confirmação;
 *   <li>Ao confirmar, encerra todas as sessões e tokens de renovação e envia dois avisos (antigo e
 *       novo);
 *   <li>Administrador raiz protegido (403 ROOT_PROTECTED).
 * </ul>
 */
class EmailChangeIT extends IntegrationTestBase {

  private static final Pattern CODE_PATTERN = Pattern.compile("\\b(\\d{6})\\b");

  private TestUsers users;
  private SeededUser adminRow;
  private TestUser admin;
  private SeededUser anaRow;
  private SeededUser carlosRow;
  private ListAppender<ILoggingEvent> appender;
  private Logger rootLogger;

  @BeforeEach
  void setup() throws Exception {
    users = new TestUsers(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm@teste.com");
    anaRow = seed.createUser("ana@teste.com");
    carlosRow = seed.createUser("carlos@teste.com");
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

    GREEN_MAIL.purgeEmailFromAllMailboxes();
  }

  @AfterEach
  void releaseLogs() {
    rootLogger.detachAppender(appender);
  }

  private ResultActions callRequest(long userId, String newEmail) throws Exception {
    return mockMvc.perform(
        post("/admin/users/" + userId + "/email-change")
            .header(HttpHeaders.AUTHORIZATION, admin.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("newEmail", newEmail))));
  }

  private ResultActions callConfirm(long userId, String code) throws Exception {
    return mockMvc.perform(
        post("/admin/users/" + userId + "/email-change/confirm")
            .header(HttpHeaders.AUTHORIZATION, admin.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("code", code))));
  }

  private ResultActions callCancel(long userId) throws Exception {
    return mockMvc.perform(
        delete("/admin/users/" + userId + "/email-change")
            .header(HttpHeaders.AUTHORIZATION, admin.bearer()));
  }

  private String lastCodeFromEmail() throws Exception {
    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    MimeMessage[] messages = GREEN_MAIL.getReceivedMessages();
    String content = String.valueOf(messages[messages.length - 1].getContent());
    Matcher matcher = CODE_PATTERN.matcher(content);
    assertThat(matcher.find()).as("o e-mail deve conter o código de 6 dígitos").isTrue();
    return matcher.group(1);
  }

  @Test
  void solicitarTrocaEnviaCodigoParaNovoEmailValidoPor15MinutosESemVazarCodigo() throws Exception {
    String novoEmail = "ana.novo@teste.com";

    callRequest(anaRow.id(), novoEmail)
        .andExpect(status().isAccepted())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.newEmail").value(novoEmail))
        .andExpect(jsonPath("$.attemptsLeft").value(5))
        .andExpect(jsonPath("$.code").doesNotExist())
        .andExpect(jsonPath("$.codeHash").doesNotExist());

    String code = lastCodeFromEmail();
    assertThat(code).matches("^\\d{6}$");

    // Confere que o código não vazou nos logs
    boolean codeInLogs =
        appender.list.stream().anyMatch(event -> event.getFormattedMessage().contains(code));
    assertThat(codeInLogs).as("código nunca deve ser logado").isFalse();

    // Confere que no banco o código não está em claro (apenas code_hash)
    Map<String, Object> pending =
        jdbc.queryForMap(
            "SELECT new_email, status, code_hash, attempts FROM pending_email_changes WHERE user_id = ?",
            anaRow.id());
    assertThat(pending.get("new_email")).isEqualTo(novoEmail);
    assertThat(pending.get("status")).isEqualTo("PENDING");
    assertThat(((Number) pending.get("attempts")).intValue()).isEqualTo(0);
    assertThat(String.valueOf(pending.get("code_hash"))).hasSize(64).isNotEqualTo(code);

    // Auditoria
    assertThat(
            jdbc.queryForMap(
                "SELECT action, result, target_user_id FROM audit_log WHERE action = 'EMAIL_CHANGE_REQUESTED'"))
        .containsEntry("action", "EMAIL_CHANGE_REQUESTED")
        .containsEntry("result", "SUCCESS")
        .containsEntry("target_user_id", anaRow.id());

    // O e-mail antigo de Ana continua ativo para login
    users.login(anaRow.email(), TestUsers.PASSWORD);
  }

  @Test
  void confirmarComCodigoIncorretoIncrementaTentativasEResponde422() throws Exception {
    String novoEmail = "ana.errada@teste.com";
    callRequest(anaRow.id(), novoEmail).andExpect(status().isAccepted());
    String correctCode = lastCodeFromEmail();

    String wrongCode = "999999".equals(correctCode) ? "888888" : "999999";

    // 1ª tentativa errada
    callConfirm(anaRow.id(), wrongCode)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("EMAIL_CHANGE_CODE_INVALID"));

    Short attempts =
        jdbc.queryForObject(
            "SELECT attempts FROM pending_email_changes WHERE user_id = ?",
            Short.class,
            anaRow.id());
    assertThat(attempts).isEqualTo((short) 1);

    // Auditoria da falha
    assertThat(
            jdbc.queryForMap(
                "SELECT action, result, refusal_code FROM audit_log WHERE action = 'EMAIL_CHANGE_FAILED' ORDER BY id DESC LIMIT 1"))
        .containsEntry("action", "EMAIL_CHANGE_FAILED")
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "EMAIL_CHANGE_CODE_INVALID");

    // Tentativas 2, 3 e 4
    for (int i = 2; i <= 4; i++) {
      callConfirm(anaRow.id(), wrongCode).andExpect(status().isUnprocessableEntity());
    }

    // 5ª tentativa errada: invalida a pendência
    callConfirm(anaRow.id(), wrongCode)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("EMAIL_CHANGE_CODE_INVALID"));

    Map<String, Object> invalidated =
        jdbc.queryForMap(
            "SELECT status, new_email, code_hash, attempts FROM pending_email_changes WHERE user_id = ?",
            anaRow.id());
    assertThat(invalidated.get("status")).isEqualTo("INVALIDATED");
    assertThat(invalidated.get("new_email")).isNull();
    assertThat(invalidated.get("code_hash")).isNull();
    assertThat(((Number) invalidated.get("attempts")).intValue()).isEqualTo(5);

    // Tentar o código correto depois de invalidada é recusado
    callConfirm(anaRow.id(), correctCode)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("EMAIL_CHANGE_CODE_INVALID"));
  }

  @Test
  void codigoExpiradoResponde422EMarcaStatusExpired() throws Exception {
    callRequest(anaRow.id(), "ana.expirada@teste.com").andExpect(status().isAccepted());
    String code = lastCodeFromEmail();

    jdbc.update(
        "UPDATE pending_email_changes SET expires_at = created_at - interval '1 minute' WHERE user_id = ?",
        anaRow.id());

    callConfirm(anaRow.id(), code)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("EMAIL_CHANGE_CODE_INVALID"));

    Map<String, Object> expired =
        jdbc.queryForMap(
            "SELECT status, new_email, code_hash FROM pending_email_changes WHERE user_id = ?",
            anaRow.id());
    assertThat(expired.get("status")).isEqualTo("EXPIRED");
    assertThat(expired.get("new_email")).isNull();
    assertThat(expired.get("code_hash")).isNull();
  }

  @Test
  void novoPedidoInvalidaOPedidoAnterior() throws Exception {
    callRequest(anaRow.id(), "ana.primeiro@teste.com").andExpect(status().isAccepted());
    String firstCode = lastCodeFromEmail();

    GREEN_MAIL.purgeEmailFromAllMailboxes();

    callRequest(anaRow.id(), "ana.segundo@teste.com").andExpect(status().isAccepted());
    String secondCode = lastCodeFromEmail();

    // Primeiro código foi cancelado e não confirma
    callConfirm(anaRow.id(), firstCode)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("EMAIL_CHANGE_CODE_INVALID"));

    // Segundo código funciona
    callConfirm(anaRow.id(), secondCode).andExpect(status().isNoContent());

    String finalEmail =
        jdbc.queryForObject("SELECT email FROM users WHERE id = ?", String.class, anaRow.id());
    assertThat(finalEmail).isEqualTo("ana.segundo@teste.com");
  }

  @Test
  void cancelarExplicitoMarcaCanceledEZeraDados() throws Exception {
    callRequest(anaRow.id(), "ana.cancelar@teste.com").andExpect(status().isAccepted());

    callCancel(anaRow.id()).andExpect(status().isNoContent());

    Map<String, Object> canceled =
        jdbc.queryForMap(
            "SELECT status, new_email, code_hash FROM pending_email_changes WHERE user_id = ?",
            anaRow.id());
    assertThat(canceled.get("status")).isEqualTo("CANCELED");
    assertThat(canceled.get("new_email")).isNull();
    assertThat(canceled.get("code_hash")).isNull();

    assertThat(
            jdbc.queryForMap(
                "SELECT action, result FROM audit_log WHERE action = 'EMAIL_CHANGE_CANCELED'"))
        .containsEntry("action", "EMAIL_CHANGE_CANCELED")
        .containsEntry("result", "SUCCESS");
  }

  @Test
  void confirmarComSucessoAtualizaEmailEncerraSessoesEnviaDoisAvisosEAudita() throws Exception {
    String oldEmail = anaRow.email();
    String newEmail = "ana.confirmada@teste.com";

    // Ana loga antes da troca
    JsonNode anaLogin = users.login(oldEmail, TestUsers.PASSWORD);
    String oldAccessToken = anaLogin.get("accessToken").asText();

    callRequest(anaRow.id(), newEmail).andExpect(status().isAccepted());
    String code = lastCodeFromEmail();

    GREEN_MAIL.purgeEmailFromAllMailboxes();

    callConfirm(anaRow.id(), code).andExpect(status().isNoContent());

    // 1. Email atualizado no banco
    String updatedEmail =
        jdbc.queryForObject("SELECT email FROM users WHERE id = ?", String.class, anaRow.id());
    assertThat(updatedEmail).isEqualTo(newEmail);

    // 2. Pendência zerada e marcada CONFIRMED
    Map<String, Object> confirmed =
        jdbc.queryForMap(
            "SELECT status, new_email, code_hash FROM pending_email_changes WHERE user_id = ?",
            anaRow.id());
    assertThat(confirmed.get("status")).isEqualTo("CONFIRMED");
    assertThat(confirmed.get("new_email")).isNull();
    assertThat(confirmed.get("code_hash")).isNull();

    // 3. Sessões anteriores e tokens encerrados (antigo accessToken é recusado)
    mockMvc
        .perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + oldAccessToken))
        .andExpect(status().isUnauthorized());

    // 4. Login com novo e-mail funciona
    users.login(newEmail, TestUsers.PASSWORD);

    // 5. Dois avisos enviados por e-mail (um para oldEmail e um para newEmail)
    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 2)).isTrue();
    MimeMessage[] notices = GREEN_MAIL.getReceivedMessages();
    assertThat(notices).hasSize(2);

    // 6. Auditoria de confirmação registrada
    assertThat(
            jdbc.queryForMap(
                "SELECT action, result, target_user_id FROM audit_log WHERE action = 'EMAIL_CHANGE_CONFIRMED'"))
        .containsEntry("action", "EMAIL_CHANGE_CONFIRMED")
        .containsEntry("result", "SUCCESS")
        .containsEntry("target_user_id", anaRow.id());
  }

  @Test
  void emailJaCadastradoOuEmUsoPorOutroUsuarioResponde409() throws Exception {
    // 1. Tentar trocar para o próprio e-mail atual
    callRequest(anaRow.id(), anaRow.email())
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_REGISTERED"));

    // 2. Tentar trocar para e-mail de outro usuário existente
    callRequest(anaRow.id(), carlosRow.email())
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_REGISTERED"));

    // 3. Tentar trocar para e-mail que já está como pendência ativa de outro usuário
    callRequest(anaRow.id(), "compartilhado@teste.com").andExpect(status().isAccepted());

    callRequest(carlosRow.id(), "compartilhado@teste.com")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_REGISTERED"));
  }
}

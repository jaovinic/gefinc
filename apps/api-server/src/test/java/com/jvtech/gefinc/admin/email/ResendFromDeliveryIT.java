package com.jvtech.gefinc.admin.email;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.common.mail.MailFailureReason;
import com.jvtech.gefinc.common.mail.MailKind;
import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import jakarta.mail.internet.MimeMessage;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.ResultActions;

/**
 * {@code POST /admin/email/deliveries/{deliveryId}/resend}: reenvia somente registros {@code
 * PASSWORD_RESET} com {@code status = FAILED} e conta ainda existente e utilizável, gerando um novo
 * link, respeitando o limite de 3 por hora por usuário-alvo e respondendo {@code 502} se o SMTP
 * falhar novamente (T090, US4, US7).
 */
class ResendFromDeliveryIT extends IntegrationTestBase {

  private static final Pattern LINK_TOKEN = Pattern.compile("token=([A-Za-z0-9_-]+)");

  @Autowired private EmailDeliveryRepository deliveries;
  @Autowired private Pseudonymizer pseudonymizer;
  @MockitoSpyBean private JavaMailSenderImpl sender;

  private TestUsers users;
  private SeededUser adminRow;
  private TestUser admin;
  private SeededUser anaRow;

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
  }

  private long insertDelivery(
      MailKind kind, String email, Long userId, boolean sent, MailFailureReason reason) {
    EmailDelivery saved =
        deliveries.save(
            new EmailDelivery(
                clock.instant(),
                kind,
                email,
                pseudonymizer.emailRef(email),
                userId,
                sent,
                reason,
                1));
    return saved.getId();
  }

  private ResultActions callResend(long deliveryId) throws Exception {
    return mockMvc.perform(
        post("/admin/email/deliveries/" + deliveryId + "/resend")
            .header(HttpHeaders.AUTHORIZATION, admin.bearer()));
  }

  private String lastTokenFromEmail() throws Exception {
    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    MimeMessage[] messages = GREEN_MAIL.getReceivedMessages();
    String content = String.valueOf(messages[messages.length - 1].getContent());
    Matcher matcher = LINK_TOKEN.matcher(content);
    assertThat(matcher.find()).isTrue();
    return matcher.group(1);
  }

  @Test
  void reenviaPasswordResetComFalhaEContaAtivaGerandoNovoLinkEAuditando() throws Exception {
    long failedId =
        insertDelivery(
            MailKind.PASSWORD_RESET,
            anaRow.email(),
            anaRow.id(),
            false,
            MailFailureReason.TRANSIENT_EXHAUSTED);

    callResend(failedId).andExpect(status().isAccepted()).andExpect(matchesContract());

    String token = lastTokenFromEmail();
    mockMvc
        .perform(
            post("/auth/password-reset/confirm")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("token", token, "newPassword", "nova-senha-segura-123"))))
        .andExpect(status().isNoContent());

    Map<String, Object> auditRow =
        jdbc.queryForMap(
            "SELECT action, result, actor_user_id, target_user_id FROM audit_log"
                + " WHERE action = 'PASSWORD_RESET_SENT'");
    assertThat(auditRow)
        .containsEntry("result", "SUCCESS")
        .containsEntry("actor_user_id", adminRow.id())
        .containsEntry("target_user_id", anaRow.id());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM email_deliveries WHERE status = 'SENT' AND user_id = ?",
                Long.class,
                anaRow.id()))
        .isEqualTo(1);
  }

  @Test
  void idInexistenteResponde404() throws Exception {
    callResend(999999L)
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"))
        .andExpect(matchesContract());
  }

  @Test
  void recusaCom409AccountNotUsableQuandoNaoEhPasswordResetComFalhaEContaAtiva() throws Exception {
    // 1. PASSWORD_RESET que já foi SENT
    long sentId = insertDelivery(MailKind.PASSWORD_RESET, anaRow.email(), anaRow.id(), true, null);
    // 2. Outro tipo (TEST) com falha
    long testFailedId =
        insertDelivery(
            MailKind.TEST,
            anaRow.email(),
            anaRow.id(),
            false,
            MailFailureReason.TRANSIENT_EXHAUSTED);
    // 3. Sem userId
    long noUserId =
        insertDelivery(
            MailKind.PASSWORD_RESET,
            "visitante@teste.com",
            null,
            false,
            MailFailureReason.TRANSIENT_EXHAUSTED);
    // 4. Conta já removida (userId órfão)
    long deletedUserId =
        insertDelivery(
            MailKind.PASSWORD_RESET,
            "excluida@teste.com",
            888888L,
            false,
            MailFailureReason.TRANSIENT_EXHAUSTED);
    // 5. Conta suspensa
    SeededUser suspensa = seed.createUser("suspensa@teste.com");
    seed.suspend(suspensa.id(), clock.instant());
    long suspendedId =
        insertDelivery(
            MailKind.PASSWORD_RESET,
            suspensa.email(),
            suspensa.id(),
            false,
            MailFailureReason.TRANSIENT_EXHAUSTED);
    // 6. Conta aguardando exclusão
    SeededUser exclusao = seed.createUser("exclusao@teste.com");
    seed.scheduleDeletion(exclusao.id(), clock.instant());
    long deletionPendingId =
        insertDelivery(
            MailKind.PASSWORD_RESET,
            exclusao.email(),
            exclusao.id(),
            false,
            MailFailureReason.TRANSIENT_EXHAUSTED);

    for (long id :
        new long[] {
          sentId, testFailedId, noUserId, deletedUserId, suspendedId, deletionPendingId
        }) {
      callResend(id)
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("ACCOUNT_NOT_USABLE"))
          .andExpect(matchesContract());
    }

    assertThat(GREEN_MAIL.getReceivedMessages()).isEmpty();
  }

  @Test
  void respeitaOLimiteDeTresEnviosPorHoraPorAlvoCom429() throws Exception {
    long failedId =
        insertDelivery(
            MailKind.PASSWORD_RESET,
            anaRow.email(),
            anaRow.id(),
            false,
            MailFailureReason.TRANSIENT_EXHAUSTED);

    for (int i = 0; i < 3; i++) {
      callResend(failedId).andExpect(status().isAccepted());
    }

    callResend(failedId)
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"))
        .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"))
        .andExpect(matchesContract());
  }

  @Test
  void falhaDeSmtpNoReenvioResponde502EDesfazONovoToken() throws Exception {
    long failedId =
        insertDelivery(
            MailKind.PASSWORD_RESET,
            anaRow.email(),
            anaRow.id(),
            false,
            MailFailureReason.TRANSIENT_EXHAUSTED);
    doThrow(new MailSendException("SMTP indisponível"))
        .when(sender)
        .send(any(SimpleMailMessage.class));

    callResend(failedId)
        .andExpect(status().isBadGateway())
        .andExpect(jsonPath("$.code").value("MAIL_DELIVERY_FAILED"))
        .andExpect(matchesContract());

    assertThat(jdbc.queryForObject("SELECT count(*) FROM password_reset_tokens", Long.class))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'PASSWORD_RESET_SENT'"
                    + " AND result = 'FAILED' AND refusal_code = 'MAIL_DELIVERY_FAILED'"
                    + " AND target_user_id = ?",
                Long.class,
                anaRow.id()))
        .isEqualTo(1);
  }
}

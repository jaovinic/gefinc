package com.jvtech.gefinc.admin.email;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import jakarta.mail.internet.MimeMessage;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MvcResult;

/**
 * {@code GET /admin/email/config} e {@code POST /admin/email/test} (T109, US7): a configuração
 * nunca traz usuário nem senha e o teste vai ao e-mail do próprio administrador em uma tentativa,
 * respondendo 200 também quando o envio falha.
 */
class EmailConfigIT extends IntegrationTestBase {

  @MockitoSpyBean private JavaMailSenderImpl sender;

  private TestUsers users;
  private SeededUser admin;
  private String adminBearer;
  private String commonBearer;

  @BeforeEach
  void init() throws Exception {
    doCallRealMethod().when(sender).send(any(SimpleMailMessage.class));
    users = new TestUsers(mockMvc, objectMapper);
    admin = seed.createAdmin("adm@teste.com");
    seed.createUser("comum@teste.com");
    adminBearer = bearer(admin.email());
    commonBearer = bearer("comum@teste.com");
  }

  private String bearer(String email) throws Exception {
    return "Bearer " + users.login(email, TestUsers.PASSWORD).get("accessToken").asText();
  }

  @Test
  void configuracaoNaoTrazUsuarioNemSenha() throws Exception {
    String previousUser = sender.getUsername();
    String previousPassword = sender.getPassword();
    sender.setUsername("usuario-smtp-sentinela");
    sender.setPassword("senha-smtp-sentinela");
    try {
      MvcResult result =
          mockMvc
              .perform(get("/admin/email/config").header(HttpHeaders.AUTHORIZATION, adminBearer))
              .andExpect(status().isOk())
              .andExpect(matchesContract())
              .andExpect(jsonPath("$.host").value(sender.getHost()))
              .andExpect(jsonPath("$.port").value(sender.getPort()))
              .andExpect(jsonPath("$.complete").value(true))
              .andExpect(jsonPath("$.authEnabled").isBoolean())
              .andExpect(jsonPath("$.starttls").isBoolean())
              .andReturn();
      String raw = result.getResponse().getContentAsString();
      assertThat(raw)
          .doesNotContain("sentinela")
          .doesNotContain("username")
          .doesNotContain("password");
      assertThat(objectMapper.readTree(raw).fieldNames())
          .toIterable()
          .containsExactlyInAnyOrder("host", "port", "from", "complete", "authEnabled", "starttls");
    } finally {
      sender.setUsername(previousUser);
      sender.setPassword(previousPassword);
    }
  }

  @Test
  void configuracaoIncompletaQuandoHostEmBranco() throws Exception {
    String previousHost = sender.getHost();
    sender.setHost("");
    try {
      mockMvc
          .perform(get("/admin/email/config").header(HttpHeaders.AUTHORIZATION, adminBearer))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.complete").value(false));
      mockMvc
          .perform(post("/admin/email/test").header(HttpHeaders.AUTHORIZATION, adminBearer))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("FAILED"))
          .andExpect(jsonPath("$.failureReason").value("NOT_CONFIGURED"))
          .andExpect(matchesContract());
    } finally {
      sender.setHost(previousHost);
    }
  }

  @Test
  void testeVaiAoProprioAdminIgnoraCorpoAuditaERegistraNoHistorico() throws Exception {
    mockMvc
        .perform(
            post("/admin/email/test")
                .header(HttpHeaders.AUTHORIZATION, adminBearer)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("to", "outro@teste.com"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("SENT"))
        .andExpect(jsonPath("$.failureReason").doesNotExist());

    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
    MimeMessage[] received = GREEN_MAIL.getReceivedMessages();
    assertThat(received).hasSize(1);
    assertThat(received[0].getAllRecipients()[0].toString()).isEqualTo(admin.email());
    awaitPendingMails();

    Map<String, Object> audit =
        jdbc.queryForMap(
            "SELECT result, actor_user_id FROM audit_log WHERE action = 'EMAIL_TEST_SENT'");
    assertThat(audit).containsEntry("result", "SUCCESS").containsEntry("actor_user_id", admin.id());
    Map<String, Object> delivery =
        jdbc.queryForMap("SELECT kind, status, user_id FROM email_deliveries");
    assertThat(delivery)
        .containsEntry("kind", "TEST")
        .containsEntry("status", "SENT")
        .containsEntry("user_id", admin.id());
  }

  @Test
  void falhaDeSmtpRespondeFailedComUmaTentativaSemVazarDados() throws Exception {
    doThrow(new MailSendException("falha tecnica para " + admin.email()))
        .when(sender)
        .send(any(SimpleMailMessage.class));

    MvcResult result =
        mockMvc
            .perform(post("/admin/email/test").header(HttpHeaders.AUTHORIZATION, adminBearer))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("FAILED"))
            .andExpect(jsonPath("$.failureReason").isString())
            .andExpect(matchesContract())
            .andReturn();
    awaitPendingMails();

    assertThat(result.getResponse().getContentAsString())
        .doesNotContain(admin.email())
        .doesNotContain("falha tecnica");
    verify(sender, times(1)).send(any(SimpleMailMessage.class));
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM email_deliveries WHERE kind = 'TEST' AND status = 'FAILED'"
                    + " AND failure_reason IS NOT NULL",
                Long.class))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'EMAIL_TEST_SENT'", Long.class))
        .isEqualTo(1);
  }

  @Test
  void usuarioComumRecebe403EVisitanteRecebe401() throws Exception {
    for (String path : new String[] {"/admin/email/config"}) {
      mockMvc
          .perform(get(path).header(HttpHeaders.AUTHORIZATION, commonBearer))
          .andExpect(status().isForbidden());
      mockMvc.perform(get(path)).andExpect(status().isUnauthorized());
    }
    mockMvc
        .perform(post("/admin/email/test").header(HttpHeaders.AUTHORIZATION, commonBearer))
        .andExpect(status().isForbidden());
    mockMvc.perform(post("/admin/email/test")).andExpect(status().isUnauthorized());
  }
}

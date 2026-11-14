package com.jvtech.gefinc.admin.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.common.security.Pseudonymizer;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/**
 * Fluxo real de redefinição de senha (SMTP GreenMail): o envio grava uma linha SENT no histórico,
 * só com metadados.
 */
class EmailDeliveryRecorderIT extends IntegrationTestBase {

  private static final String EMAIL = "Ana@Example.com";

  @Autowired private Pseudonymizer pseudonymizer;

  @Test
  void redefinicaoDeSenhaGravaUmaLinhaEnviadaSemConteudo() throws Exception {
    long userId = new TestUsers(mockMvc, objectMapper).registerAndLogin(EMAIL).id();

    mockMvc
        .perform(
            post("/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", EMAIL))))
        .andExpect(status().isAccepted());

    await()
        .atMost(Duration.ofSeconds(10))
        .until(
            () -> jdbc.queryForObject("SELECT count(*) FROM email_deliveries", Integer.class) == 1);
    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM email_deliveries");
    assertThat(row)
        .containsEntry("kind", "PASSWORD_RESET")
        .containsEntry("status", "SENT")
        .containsEntry("recipient_email", EMAIL)
        .containsEntry("recipient_ref", pseudonymizer.emailRef(EMAIL))
        .containsEntry("user_id", userId)
        .containsEntry("attempts", 1);
    assertThat(row.get("failure_reason")).isNull();
    assertThat(row.get("created_at")).isNotNull();
    assertThat((String) row.get("recipient_ref")).hasSize(32).doesNotContain("@");
    assertThat(GREEN_MAIL.waitForIncomingEmail(5000, 1)).isTrue();
  }

  @Test
  void aTabelaNaoTemColunasDeCorpoAssuntoLinkTokenCodigoOuMensagemTecnica() {
    List<String> columns =
        jdbc.queryForList(
            "SELECT column_name FROM information_schema.columns WHERE table_name ="
                + " 'email_deliveries'",
            String.class);

    assertThat(columns)
        .containsExactlyInAnyOrder(
            "id",
            "created_at",
            "kind",
            "recipient_email",
            "recipient_ref",
            "user_id",
            "status",
            "failure_reason",
            "attempts");
    assertThat(columns)
        .noneMatch(
            c ->
                c.contains("body")
                    || c.contains("subject")
                    || c.contains("link")
                    || c.contains("token")
                    || c.contains("code")
                    || c.contains("message")
                    || c.contains("error"));
  }

  @Test
  void usuarioInexistenteNaoGeraEnvioNemLinha() throws Exception {
    mockMvc
        .perform(
            post("/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", "ninguem@example.com"))))
        .andExpect(status().isAccepted());
    awaitPendingMails();

    assertThat(jdbc.queryForObject("SELECT count(*) FROM email_deliveries", Integer.class))
        .isZero();
  }
}

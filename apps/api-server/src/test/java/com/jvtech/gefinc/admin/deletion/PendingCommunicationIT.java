package com.jvtech.gefinc.admin.deletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Testes de integração de comunicações pendentes e alertas (US10, T137, FR-056, FR-057): falhas
 * viram pendência, GET /admin/alerts, reenvio, descarte, expiração em 30 dias e sigilo do endereço
 * retido na API.
 */
class PendingCommunicationIT extends IntegrationTestBase {

  @Autowired private PendingCommunicationExpiryJob expiryJob;

  private TestUsers testUsers;
  private TestUser admin;
  private SeededUser adminRow;
  private long reasonId;

  @BeforeEach
  void setUp() throws Exception {
    testUsers = new TestUsers(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm-pend@teste.com");
    String token =
        testUsers.login("adm-pend@teste.com", TestUsers.PASSWORD).get("accessToken").asText();
    admin = new TestUser(adminRow.id(), adminRow.email(), token);
    reasonId =
        jdbc.queryForObject(
            "SELECT id FROM deletion_reasons WHERE active = true LIMIT 1", Long.class);
  }

  private String json(Object body) throws Exception {
    return objectMapper.writeValueAsString(body);
  }

  @Test
  void falhaDeEnvioGeraComunicacaoPendenteEAlertaContabiliza() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-falha@teste.com");

    GREEN_MAIL.stop(); // Simula SMTP indisponível
    try {
      var body =
          Map.of(
              "reasonId",
              reasonId,
              "justification",
              "Exclusão que falha o e-mail",
              "mode",
              "GRACE",
              "days",
              10,
              "confirmEmail",
              alvo.email(),
              "password",
              TestUsers.PASSWORD);

      mockMvc
          .perform(
              post("/admin/users/" + alvo.id() + "/deletion")
                  .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(json(body)))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.noticeState").value("PENDING"));
    } finally {
      GREEN_MAIL.start();
    }

    // 1. GET /admin/alerts contabiliza 1 pendência
    mockMvc
        .perform(get("/admin/alerts").header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pendingCommunications").value(1));

    // 2. GET /admin/communications/pending traz a comunicação sem e-mail retido exposto
    var listResult =
        mockMvc
            .perform(
                get("/admin/communications/pending")
                    .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].kind").value("DELETION_NOTICE"))
            .andExpect(jsonPath("$[0].targetLabel").value(alvo.email()))
            .andReturn();

    String responseBody = listResult.getResponse().getContentAsString();
    assertThat(responseBody).doesNotContain("retainedEmail");

    long pendingId = objectMapper.readTree(responseBody).get(0).get("id").asLong();

    // 3. Reenviar com sucesso (GreenMail está de volta)
    mockMvc
        .perform(
            post("/admin/communications/pending/" + pendingId + "/resend")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.state").value("DELIVERED"));

    // O alerta agora volta a zero
    mockMvc
        .perform(get("/admin/alerts").header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pendingCommunications").value(0));
  }

  @Test
  void descartarComunicacaoPendenteRemoveDoAlertaEAudita() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-descarte@teste.com");

    GREEN_MAIL.stop();
    try {
      var body =
          Map.of(
              "reasonId",
              reasonId,
              "justification",
              "Exclusão para descarte de aviso",
              "mode",
              "GRACE",
              "days",
              10,
              "confirmEmail",
              alvo.email(),
              "password",
              TestUsers.PASSWORD);

      mockMvc
          .perform(
              post("/admin/users/" + alvo.id() + "/deletion")
                  .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(json(body)))
          .andExpect(status().isOk());
    } finally {
      GREEN_MAIL.start();
    }

    long pendingId =
        jdbc.queryForObject(
            "SELECT id FROM pending_communications WHERE user_id = ? AND state = 'PENDING'",
            Long.class,
            alvo.id());

    // Descarta a comunicação
    mockMvc
        .perform(
            post("/admin/communications/pending/" + pendingId + "/discard")
                .header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isNoContent());

    // Alerta zera
    mockMvc
        .perform(get("/admin/alerts").header(HttpHeaders.AUTHORIZATION, admin.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pendingCommunications").value(0));

    // Auditoria gravou COMMUNICATION_DISCARDED
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE action = 'COMMUNICATION_DISCARDED'",
                Long.class))
        .isEqualTo(1);
  }

  @Test
  void expiracaoEm30DiasDeContaRemovidaApagaEnderecoRetido() throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-expira@teste.com");

    GREEN_MAIL.stop();
    try {
      var body =
          Map.of(
              "reasonId",
              reasonId,
              "justification",
              "Exclusão imediata sem SMTP",
              "mode",
              "IMMEDIATE",
              "confirmEmail",
              alvo.email(),
              "password",
              TestUsers.PASSWORD);

      mockMvc
          .perform(
              post("/admin/users/" + alvo.id() + "/deletion")
                  .header(HttpHeaders.AUTHORIZATION, admin.bearer())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(json(body)))
          .andExpect(status().isOk());
    } finally {
      GREEN_MAIL.start();
    }

    // A conta foi removida, o e-mail fica retido em pending_communications por 30 dias
    String retainedEmail =
        jdbc.queryForObject(
            "SELECT retained_email FROM pending_communications WHERE user_id = ?",
            String.class,
            alvo.id());
    assertThat(retainedEmail).isEqualTo(alvo.email());

    // Avança 29 dias: ainda não expirou
    clock.advance(Duration.ofDays(29));
    assertThat(expiryJob.run()).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT retained_email FROM pending_communications WHERE user_id = ?",
                String.class,
                alvo.id()))
        .isNotNull();

    // Avança mais 2 dias (31 dias no total): expira e apaga o endereço retido
    clock.advance(Duration.ofDays(2));
    assertThat(expiryJob.run()).isEqualTo(1);

    Map<String, Object> comm =
        jdbc.queryForMap(
            "SELECT state, retained_email FROM pending_communications WHERE user_id = ?",
            alvo.id());
    assertThat(comm).containsEntry("state", "EXPIRED");
    assertThat(comm.get("retained_email")).isNull();
  }
}

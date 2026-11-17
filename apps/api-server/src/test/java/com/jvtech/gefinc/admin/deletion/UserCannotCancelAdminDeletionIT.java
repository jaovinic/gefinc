package com.jvtech.gefinc.admin.deletion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Testes provando que o usuário não pode reverter uma exclusão administrativa (US10, T135): 403
 * ADMIN_DECISION_LOCKED, auditoria REVERT_ATTEMPT deduplicada, 423 no login com canCancel=false e a
 * exclusão por autoatendimento continuando cancelável.
 */
class UserCannotCancelAdminDeletionIT extends IntegrationTestBase {

  private TestUsers testUsers;
  private TestUser admin;
  private SeededUser adminRow;
  private long reasonId;

  @BeforeEach
  void setUp() throws Exception {
    testUsers = new TestUsers(mockMvc, objectMapper);
    adminRow = seed.createAdmin("adm-block@teste.com");
    String token =
        testUsers.login("adm-block@teste.com", TestUsers.PASSWORD).get("accessToken").asText();
    admin = new TestUser(adminRow.id(), adminRow.email(), token);
    reasonId =
        jdbc.queryForObject(
            "SELECT id FROM deletion_reasons WHERE active = true LIMIT 1", Long.class);
  }

  private String json(Object body) throws Exception {
    return objectMapper.writeValueAsString(body);
  }

  @Test
  void usuarioNaoCancelaExclusaoAdministrativaCom403AdminDecisionLockedERevertAttemptDeduplicado()
      throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-locked@teste.com");

    // Admin agenda exclusão
    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Exclusão administrativa que usuário não pode cancelar",
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

    // Usuário tenta cancelar 3 vezes
    for (int i = 0; i < 3; i++) {
      mockMvc
          .perform(
              post("/auth/account-deletion/cancel")
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(json(Map.of("email", alvo.email(), "password", TestUsers.PASSWORD))))
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.code").value("ADMIN_DECISION_LOCKED"));
    }

    // Auditoria registra REVERT_ATTEMPT deduplicado
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE target_user_id = ? AND action = 'REVERT_ATTEMPT'",
                Long.class,
                alvo.id()))
        .isEqualTo(1);

    // Conta continua com exclusão pendente
    assertThat(
            jdbc.queryForObject(
                "SELECT deletion_origin FROM users WHERE id = ?", String.class, alvo.id()))
        .isEqualTo("ADMIN");
  }

  @Test
  void loginComExclusaoAdministrativaRetorna423ComCanCancelFalseEMensagemFixadaSemJustificativa()
      throws Exception {
    TestUser alvo = testUsers.registerAndLogin("alvo-login-locked@teste.com");

    String reasonMessage =
        jdbc.queryForObject(
            "SELECT message FROM deletion_reasons WHERE id = ?", String.class, reasonId);

    var body =
        Map.of(
            "reasonId",
            reasonId,
            "justification",
            "Esta justificativa secreta NUNCA deve aparecer para o usuário",
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

    // Login com credenciais corretas responde 423
    var loginResult =
        mockMvc
            .perform(
                post("/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json(Map.of("email", alvo.email(), "password", TestUsers.PASSWORD))))
            .andExpect(status().isLocked())
            .andExpect(jsonPath("$.code").value("ACCOUNT_DELETION_PENDING"))
            .andExpect(jsonPath("$.origin").value("ADMIN"))
            .andExpect(jsonPath("$.canCancel").value(false))
            .andExpect(jsonPath("$.reasonMessage").value(reasonMessage))
            .andExpect(jsonPath("$.deletionDate").isNotEmpty())
            .andReturn();

    String responseBody = loginResult.getResponse().getContentAsString();
    assertThat(responseBody).doesNotContain("justificativa secreta");
  }

  @Test
  void exclusaoDoProprioUsuarioPermiteCancelarNormalmente() throws Exception {
    TestUser usuario = testUsers.registerAndLogin("auto-exclusao@teste.com");

    // Agenda pelo autoatendimento
    mockMvc
        .perform(
            post("/auth/account-deletion")
                .header(HttpHeaders.AUTHORIZATION, usuario.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("password", TestUsers.PASSWORD))))
        .andExpect(status().isAccepted());

    // Login responde 423 com canCancel=true e origin=USER
    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", usuario.email(), "password", TestUsers.PASSWORD))))
        .andExpect(status().isLocked())
        .andExpect(jsonPath("$.origin").value("USER"))
        .andExpect(jsonPath("$.canCancel").value(true));

    // Usuário cancela com sucesso
    mockMvc
        .perform(
            post("/auth/account-deletion/cancel")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", usuario.email(), "password", TestUsers.PASSWORD))))
        .andExpect(status().isNoContent());

    assertThat(
            jdbc.queryForObject(
                "SELECT deletion_requested_at FROM users WHERE id = ?", Object.class, usuario.id()))
        .isNull();
  }
}

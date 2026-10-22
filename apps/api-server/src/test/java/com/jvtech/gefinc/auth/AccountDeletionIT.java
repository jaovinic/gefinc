package com.jvtech.gefinc.auth;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

class AccountDeletionIT extends IntegrationTestBase {

  @Autowired private AccountDeletionService deletionService;

  private TestUsers users;

  @BeforeEach
  void init() {
    users = new TestUsers(mockMvc, objectMapper);
  }

  private String json(Map<String, ?> body) throws Exception {
    return objectMapper.writeValueAsString(body);
  }

  private void requestDeletion(TestUser user, String password, int expectedStatus)
      throws Exception {
    mockMvc
        .perform(
            post("/auth/account-deletion")
                .header(HttpHeaders.AUTHORIZATION, user.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("password", password))))
        .andExpect(status().is(expectedStatus));
  }

  @Test
  void senhaIncorretaNaoSolicitaAExclusao() throws Exception {
    TestUser ana = users.registerAndLogin("ana@example.com");

    requestDeletion(ana, "senha-errada-123", 401);

    assertThat(jdbc.queryForObject("SELECT deletion_requested_at FROM users", Object.class))
        .isNull();
  }

  @Test
  void solicitacaoBloqueiaAContaNaHoraEInformaADataLimite() throws Exception {
    TestUser ana = users.registerAndLogin("ana@example.com");
    String refresh =
        users.login("ana@example.com", TestUsers.PASSWORD).get("refreshToken").asText();

    mockMvc
        .perform(
            post("/auth/account-deletion")
                .header(HttpHeaders.AUTHORIZATION, ana.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("password", TestUsers.PASSWORD))))
        .andExpect(status().isAccepted())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.deletionDate").value("2026-12-10"));

    // o token de acesso emitido antes do pedido deixa de valer imediatamente
    mockMvc
        .perform(post("/auth/logout").header(HttpHeaders.AUTHORIZATION, ana.bearer()))
        .andExpect(status().isUnauthorized());
    // a renovação também é recusada
    mockMvc
        .perform(
            post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("refreshToken", refresh))))
        .andExpect(status().isUnauthorized());
    // o login responde 423, sem emitir tokens, com a data limite
    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", "ana@example.com", "password", TestUsers.PASSWORD))))
        .andExpect(status().isLocked())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("ACCOUNT_DELETION_PENDING"))
        .andExpect(jsonPath("$.deletionDate").value("2026-12-10"))
        .andExpect(jsonPath("$.accessToken").doesNotExist());
  }

  @Test
  void oEmailFicaReservadoDuranteACarencia() throws Exception {
    TestUser ana = users.registerAndLogin("ana@example.com");
    requestDeletion(ana, TestUsers.PASSWORD, 202);

    mockMvc
        .perform(
            post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", "ana@example.com", "password", "senha-forte-123"))))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_REGISTERED"));
  }

  @Test
  void cancelarRestauraOAcessoEOsTokensNovosFuncionam() throws Exception {
    TestUser ana = users.registerAndLogin("ana@example.com");
    requestDeletion(ana, TestUsers.PASSWORD, 202);

    mockMvc
        .perform(
            post("/auth/account-deletion/cancel")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", "ana@example.com", "password", TestUsers.PASSWORD))))
        .andExpect(status().isNoContent())
        .andExpect(matchesContract());

    String access = users.login("ana@example.com", TestUsers.PASSWORD).get("accessToken").asText();
    mockMvc
        .perform(post("/auth/logout").header(HttpHeaders.AUTHORIZATION, "Bearer " + access))
        .andExpect(status().isNoContent());
  }

  @Test
  void cancelarSemExclusaoPendenteOuComSenhaErradaFalha() throws Exception {
    TestUser ana = users.registerAndLogin("ana@example.com");

    mockMvc
        .perform(
            post("/auth/account-deletion/cancel")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", "ana@example.com", "password", TestUsers.PASSWORD))))
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("NO_PENDING_DELETION"));

    requestDeletion(ana, TestUsers.PASSWORD, 202);
    mockMvc
        .perform(
            post("/auth/account-deletion/cancel")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", "ana@example.com", "password", "senha-errada-123"))))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void apagaDefinitivamenteSoDepoisDe30DiasEEmCascata() throws Exception {
    TestUser ana = users.registerAndLogin("ana@example.com");
    users.registerAndLogin("bia@example.com");
    requestDeletion(ana, TestUsers.PASSWORD, 202);

    clock.advance(Duration.ofDays(29).plusHours(23));
    assertThat(deletionService.deleteExpired()).isZero();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Integer.class)).isEqualTo(2);

    clock.advance(Duration.ofHours(2));
    assertThat(deletionService.deleteExpired()).isEqualTo(1);

    assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Integer.class)).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE email = 'ana@example.com'", Integer.class))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM refresh_tokens WHERE user_id = ?", Integer.class, ana.id()))
        .isZero();
  }
}

package com.jvtech.gefinc.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestClockConfig;
import com.jvtech.gefinc.support.TestUsers;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * {@code users.last_access_at} é atualizado no login e na renovação da sessão, e só neles: uma
 * requisição autenticada comum não escreve nada (sem escrita por requisição).
 */
class LastAccessTrackingIT extends IntegrationTestBase {

  private Instant lastAccess(String email) {
    Timestamp stamp =
        jdbc.queryForObject(
            "SELECT last_access_at FROM users WHERE email = ?", Timestamp.class, email);
    return stamp == null ? null : stamp.toInstant();
  }

  @Test
  void loginGravaOUltimoAcesso() throws Exception {
    seed.createUser("ana@example.com");
    assertThat(lastAccess("ana@example.com")).isNull();

    new TestUsers(mockMvc, objectMapper).login("ana@example.com", TestUsers.PASSWORD);

    assertThat(lastAccess("ana@example.com")).isEqualTo(TestClockConfig.START);
  }

  @Test
  void senhaErradaNaoGravaOUltimoAcesso() throws Exception {
    seed.createUser("ana@example.com");

    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("email", "ana@example.com", "password", "errada-123"))))
        .andExpect(status().isUnauthorized());

    assertThat(lastAccess("ana@example.com")).isNull();
  }

  @Test
  void renovacaoGravaOUltimoAcessoMasRequisicaoComumNao() throws Exception {
    seed.createUser("ana@example.com");
    JsonNode session =
        new TestUsers(mockMvc, objectMapper).login("ana@example.com", TestUsers.PASSWORD);
    clock.advance(Duration.ofMinutes(5));

    mockMvc
        .perform(
            get("/auth/me")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + session.get("accessToken").asText()))
        .andExpect(status().isOk());
    assertThat(lastAccess("ana@example.com")).isEqualTo(TestClockConfig.START);

    mockMvc
        .perform(
            post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("refreshToken", session.get("refreshToken").asText()))))
        .andExpect(status().isOk());

    assertThat(lastAccess("ana@example.com"))
        .isEqualTo(TestClockConfig.START.plus(Duration.ofMinutes(5)));
  }

  @Test
  void contaComExclusaoPendenteNaoGravaOUltimoAcessoNoLoginRecusado() throws Exception {
    var user = seed.createUser("ana@example.com");
    seed.scheduleDeletion(user.id(), TestClockConfig.START);

    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("email", "ana@example.com", "password", TestUsers.PASSWORD))))
        .andExpect(status().is4xxClientError());

    assertThat(lastAccess("ana@example.com")).isNull();
  }
}

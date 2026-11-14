package com.jvtech.gefinc.admin.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.AdminSeed.SeededUser;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Reautenticação por senha das ações sensíveis: recusa com 403 (nunca 401), auditoria deduplicada,
 * respeito ao limite de login e revogação do acesso na quinta falha.
 */
@Import(AdminTestEndpoints.class)
class ReauthIT extends IntegrationTestBase {

  private static final String EMAIL = "adm@example.com";
  private static final String IP = "198.51.100.20";

  private String token;
  private SeededUser admin;

  @BeforeEach
  void admin() throws Exception {
    admin = seed.createAdmin(EMAIL);
    token =
        new TestUsers(mockMvc, objectMapper)
            .login(EMAIL, TestUsers.PASSWORD)
            .get("accessToken")
            .asText();
  }

  private ResultActions reauth(String password) throws Exception {
    return mockMvc.perform(
        post("/admin/_test/reauth")
            .with(
                request -> {
                  request.setRemoteAddr(IP);
                  return request;
                })
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("password", password))));
  }

  private ResultActions anyAuthenticatedEndpoint() throws Exception {
    return mockMvc.perform(
        get("/admin/_test/read").header(HttpHeaders.AUTHORIZATION, "Bearer " + token));
  }

  private void loginFailures(int times) throws Exception {
    for (int i = 0; i < times; i++) {
      mockMvc
          .perform(
              post("/auth/login")
                  .with(
                      request -> {
                        request.setRemoteAddr(IP);
                        return request;
                      })
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      objectMapper.writeValueAsString(
                          Map.of("email", EMAIL, "password", "senha-errada-999"))))
          .andExpect(status().isUnauthorized());
    }
  }

  @Test
  void senhaValidaPassa() throws Exception {
    reauth(TestUsers.PASSWORD)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ok").value("reauth"));

    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM audit_log WHERE result = 'REFUSED'", Long.class))
        .isZero();
  }

  @Test
  void senhaInvalidaDa403ComProblemJsonEGravaUmaRecusaDeduplicada() throws Exception {
    for (int i = 0; i < 3; i++) {
      reauth("senha-errada-999")
          .andExpect(status().isForbidden())
          .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
          .andExpect(jsonPath("$.code").value("REAUTH_FAILED"));
    }

    Map<String, Object> row =
        jdbc.queryForMap("SELECT * FROM audit_log WHERE refusal_code = 'REAUTH_FAILED'");
    assertThat(row)
        .containsEntry("result", "REFUSED")
        .containsEntry("action", "USER_SUSPENDED")
        .containsEntry("actor_user_id", admin.id());
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class)).isEqualTo(1);
    Map<String, Object> client = jdbc.queryForMap("SELECT * FROM audit_log_client");
    assertThat(client).containsEntry("ip", IP).containsEntry("user_id", admin.id());
  }

  @Test
  void respeitaOLimiteDeLoginMesmoComASenhaCerta() throws Exception {
    loginFailures(5);

    reauth(TestUsers.PASSWORD)
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"))
        .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"));
  }

  @Test
  void quintaFalhaConsecutivaAindaDa403MasCortaOAcessoDoAdministrador() throws Exception {
    for (int i = 0; i < 5; i++) {
      reauth("senha-errada-999").andExpect(status().isForbidden());
    }

    anyAuthenticatedEndpoint().andExpect(status().isUnauthorized());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL",
                Long.class,
                admin.id()))
        .isZero();
  }

  @Test
  void quatroFalhasNaoCortamAAcesso() throws Exception {
    for (int i = 0; i < 4; i++) {
      reauth("senha-errada-999").andExpect(status().isForbidden());
    }

    anyAuthenticatedEndpoint().andExpect(status().isOk());
  }

  @Test
  void sucessoZeraOContadorDeReautenticacaoMasNaoODeLogin() throws Exception {
    for (int i = 0; i < 3; i++) {
      reauth("senha-errada-999").andExpect(status().isForbidden());
    }
    reauth(TestUsers.PASSWORD).andExpect(status().isOk());
    for (int i = 0; i < 2; i++) {
      reauth("senha-errada-999").andExpect(status().isForbidden());
    }

    // 3 + 2 falhas somadas não cortam o acesso: o contador de reautenticação foi zerado
    anyAuthenticatedEndpoint().andExpect(status().isOk());
    // mas o contador de login (5 falhas no total) não foi zerado pelo sucesso
    reauth(TestUsers.PASSWORD).andExpect(status().isTooManyRequests());
  }

  @Test
  void senhaNulaContaComoFalha() throws Exception {
    mockMvc
        .perform(
            post("/admin/_test/reauth")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("REAUTH_FAILED"));
  }
}

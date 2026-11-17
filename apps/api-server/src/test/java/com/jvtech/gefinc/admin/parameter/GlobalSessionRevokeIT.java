package com.jvtech.gefinc.admin.parameter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Revogação global de sessões em emergência (US8, T116, FR-030, FR-051). - Exige reautenticação por
 * senha (403 REAUTH_FAILED se incorreta) e confirmWord="ENCERRAR" (422 INVALID_CONFIRMATION se
 * divergente); - Encerra todas as sessões exceto a sessão atual do administrador e as de usuários
 * ROOT; - Devolve { revoked: count } e audita SYSTEM_SESSIONS_REVOKED.
 */
class GlobalSessionRevokeIT extends IntegrationTestBase {

  private TestUsers users;
  private String adminToken;
  private String rootToken;
  private String userToken;

  @BeforeEach
  void setup() throws Exception {
    users = new TestUsers(mockMvc, objectMapper);
    seed.createAdmin("adm@global.com");
    seed.createRoot("root@global.com");
    seed.createUser("user@global.com");

    var admLogin = users.login("adm@global.com", TestUsers.PASSWORD);
    adminToken = admLogin.get("accessToken").asText();

    var rootLogin = users.login("root@global.com", TestUsers.PASSWORD);
    rootToken = rootLogin.get("accessToken").asText();

    var userLogin = users.login("user@global.com", TestUsers.PASSWORD);
    userToken = userLogin.get("accessToken").asText();
  }

  @Test
  void exigeSenhaCorretaEConfirmacaoExata() throws Exception {
    // 1. Senha errada -> 403 REAUTH_FAILED
    mockMvc
        .perform(
            post("/admin/sessions/revoke-all")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("password", "SenhaErrada!", "confirmWord", "ENCERRAR"))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("REAUTH_FAILED"));

    // 2. Palavra divergente -> 422 INVALID_CONFIRMATION
    mockMvc
        .perform(
            post("/admin/sessions/revoke-all")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("password", TestUsers.PASSWORD, "confirmWord", "CONFIRMAR"))))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("INVALID_CONFIRMATION"));
  }

  @Test
  void encerraSessoesExcetoDoAdminAtuanteEDoRaizEAudita() throws Exception {
    // Confere que todos os 3 conseguem acessar rotas antes
    mockMvc
        .perform(get("/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer " + userToken))
        .andExpect(status().isOk());
    mockMvc
        .perform(get("/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer " + rootToken))
        .andExpect(status().isOk());
    mockMvc
        .perform(get("/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken))
        .andExpect(status().isOk());

    // Executa a revogação global
    var result =
        mockMvc
            .perform(
                post("/admin/sessions/revoke-all")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        objectMapper.writeValueAsString(
                            Map.of("password", TestUsers.PASSWORD, "confirmWord", "ENCERRAR"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revoked").isNumber())
            .andReturn();

    JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
    int revoked = body.get("revoked").asInt();
    assertThat(revoked).isGreaterThanOrEqualTo(1);

    // Auditoria gravou SYSTEM_SESSIONS_REVOKED com count
    var audit =
        jdbc.queryForMap(
            "SELECT action, details FROM audit_log WHERE action = 'SYSTEM_SESSIONS_REVOKED'");
    assertThat(audit.get("action")).isEqualTo("SYSTEM_SESSIONS_REVOKED");
    JsonNode details = objectMapper.readTree(audit.get("details").toString());
    assertThat(details.get("count").asInt()).isEqualTo(revoked);

    // Usuário comum agora tem a sessão revogada (401)
    mockMvc
        .perform(get("/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer " + userToken))
        .andExpect(status().isUnauthorized());

    // Administrador raiz continua com a sessão válida
    mockMvc
        .perform(get("/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer " + rootToken))
        .andExpect(status().isOk());

    // Administrador atuante continua com a sessão atual válida
    mockMvc
        .perform(get("/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken))
        .andExpect(status().isOk());
  }
}

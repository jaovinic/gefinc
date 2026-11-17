package com.jvtech.gefinc.admin.parameter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Abertura e fechamento de novos cadastros (US8, FR-029). - Fechar cadastros recusa novos registros
 * com 403 SIGNUPS_CLOSED; - Usuários existentes não são afetados; - Reabertura permite novos
 * cadastros normalmente.
 */
class SignupsClosedIT extends IntegrationTestBase {

  @Autowired private SystemParameterService parameterService;

  private TestUsers users;
  private String adminToken;

  @BeforeEach
  void setup() throws Exception {
    users = new TestUsers(mockMvc, objectMapper);
    seed.createAdmin("admin@signups.com");
    var login = users.login("admin@signups.com", TestUsers.PASSWORD);
    adminToken = login.get("accessToken").asText();
  }

  @Test
  void fecharCadastrosBloqueiaNovosRegistrosMasPermiteReabertura() throws Exception {
    assertThat(parameterService.isSignupsOpen()).isTrue();

    // 1. Fecha os cadastros pelo painel
    mockMvc
        .perform(
            put("/admin/parameters/signups-open")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("open", false))))
        .andExpect(status().isNoContent());

    assertThat(parameterService.isSignupsOpen()).isFalse();

    // 2. Tentativa de cadastro próprio responde 403 SIGNUPS_CLOSED
    mockMvc
        .perform(
            post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("email", "novo@exemplo.com", "password", "SenhaValida123!"))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("SIGNUPS_CLOSED"));

    // 3. Reabre os cadastros
    mockMvc
        .perform(
            put("/admin/parameters/signups-open")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("open", true))))
        .andExpect(status().isNoContent());

    assertThat(parameterService.isSignupsOpen()).isTrue();

    // 4. Agora o cadastro próprio é aceito com sucesso
    mockMvc
        .perform(
            post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("email", "novo@exemplo.com", "password", "SenhaValida123!"))))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").isNumber());
  }
}

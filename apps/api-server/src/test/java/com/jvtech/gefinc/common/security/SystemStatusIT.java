package com.jvtech.gefinc.common.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Consulta pública de estado do sistema (US8, T117). Rota GET /system/status aberta a qualquer
 * cliente sem autenticação e sem dados sensíveis.
 */
class SystemStatusIT extends IntegrationTestBase {

  @Test
  void rotaPublicaRetornaEstadoDoSistemaSemDadosSensiveis() throws Exception {
    // 1. Estado inicial padrão: sem manutenção, cadastros abertos
    mockMvc
        .perform(get("/system/status"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.maintenance").value(false))
        .andExpect(jsonPath("$.signupsOpen").value(true));

    // 2. Administrador ativa manutenção com mensagem
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    seed.createAdmin("adm@status.com");
    String adminToken =
        users.login("adm@status.com", TestUsers.PASSWORD).get("accessToken").asText();

    mockMvc
        .perform(
            put("/admin/parameters/maintenance")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("enabled", true, "message", "Manutenção preventiva"))))
        .andExpect(status().isNoContent());

    mockMvc
        .perform(
            put("/admin/parameters/signups-open")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("open", false))))
        .andExpect(status().isNoContent());

    // 3. Consulta pública reflete as alterações sem exigir login
    mockMvc
        .perform(get("/system/status"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.maintenance").value(true))
        .andExpect(jsonPath("$.message").value("Manutenção preventiva"))
        .andExpect(jsonPath("$.signupsOpen").value(false));
  }
}

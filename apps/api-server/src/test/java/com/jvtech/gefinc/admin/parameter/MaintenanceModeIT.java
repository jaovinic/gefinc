package com.jvtech.gefinc.admin.parameter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
 * Modo de manutenção (US8, SC-019, FR-058): - Com manutenção ativa, usuário comum recebe 503
 * MAINTENANCE (Retry-After, extras.message) em API, login, renovação; - Administrador passa em
 * todas as rotas; - OPTIONS, /auth/password-reset/**, /auth/logout, /system/status e
 * /actuator/health continuam; - Jobs seguem rodando normalmente; - Desativada a manutenção, tudo
 * volta ao normal.
 */
class MaintenanceModeIT extends IntegrationTestBase {

  @Autowired private SystemParameterService parameterService;

  private TestUsers users;
  private String adminToken;
  private String userToken;
  private String userRefreshToken;

  @BeforeEach
  void setup() throws Exception {
    users = new TestUsers(mockMvc, objectMapper);
    seed.createAdmin("admin@maint.com");
    seed.createUser("user@maint.com");

    var adminLogin = users.login("admin@maint.com", TestUsers.PASSWORD);
    adminToken = adminLogin.get("accessToken").asText();

    var userLogin = users.login("user@maint.com", TestUsers.PASSWORD);
    userToken = userLogin.get("accessToken").asText();
    userRefreshToken = userLogin.get("refreshToken").asText();
  }

  @Test
  void comManutencaoAtivaUsuarioComumRecebe503MasAdminPassa() throws Exception {
    // 1. Ativa o modo de manutenção pelo painel
    mockMvc
        .perform(
            put("/admin/parameters/maintenance")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("enabled", true, "message", "Atualização programada do sistema"))))
        .andExpect(status().isNoContent());

    assertThat(parameterService.isMaintenanceEnabled()).isTrue();

    // 2. Usuário comum tentando rota da API recebe 503 com Retry-After e ProblemDetail
    mockMvc
        .perform(get("/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer " + userToken))
        .andExpect(status().isServiceUnavailable())
        .andExpect(header().string("Retry-After", "300"))
        .andExpect(jsonPath("$.code").value("MAINTENANCE"))
        .andExpect(jsonPath("$.message").value("Atualização programada do sistema"));

    // 3. Login de usuário comum com credenciais corretas recebe 503
    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("email", "user@maint.com", "password", TestUsers.PASSWORD))))
        .andExpect(status().isServiceUnavailable())
        .andExpect(header().string("Retry-After", "300"))
        .andExpect(jsonPath("$.code").value("MAINTENANCE"))
        .andExpect(jsonPath("$.message").value("Atualização programada do sistema"));

    // 4. Renovação de token de usuário comum recebe 503 sem revogar a sessão
    mockMvc
        .perform(
            post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("refreshToken", userRefreshToken))))
        .andExpect(status().isServiceUnavailable())
        .andExpect(header().string("Retry-After", "300"))
        .andExpect(jsonPath("$.code").value("MAINTENANCE"));

    // 5. Administrador opera normalmente na API e no painel
    mockMvc
        .perform(get("/admin/parameters").header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken))
        .andExpect(status().isOk());

    mockMvc
        .perform(get("/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken))
        .andExpect(status().isOk());

    // 6. Login de administrador continua funcionando normalmente
    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("email", "admin@maint.com", "password", TestUsers.PASSWORD))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.accessToken").isNotEmpty());

    // 7. Rotas essenciais continuam funcionando para todos
    mockMvc
        .perform(
            options("/accounts")
                .header(HttpHeaders.ORIGIN, "http://localhost:4200")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
        .andExpect(status().isOk());
    mockMvc.perform(get("/system/status")).andExpect(status().isOk());
    mockMvc.perform(get("/actuator/health")).andExpect(status().isOk());
    mockMvc
        .perform(
            post("/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("email", "user@maint.com"))))
        .andExpect(status().isAccepted());
    mockMvc
        .perform(
            post("/auth/logout")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + userToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("refreshToken", userRefreshToken))))
        .andExpect(status().isNoContent());

    // 8. Novo cadastro e cancelamento de exclusão são barrados com 503
    mockMvc
        .perform(
            post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("email", "novo@maint.com", "password", "SenhaValida123!"))))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.code").value("MAINTENANCE"));

    // 9. Desativa manutenção: tudo volta ao normal
    mockMvc
        .perform(
            put("/admin/parameters/maintenance")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("enabled", false, "message", ""))))
        .andExpect(status().isNoContent());

    assertThat(parameterService.isMaintenanceEnabled()).isFalse();

    var novoLogin = users.login("user@maint.com", TestUsers.PASSWORD);
    String novoToken = novoLogin.get("accessToken").asText();

    mockMvc
        .perform(get("/accounts").header(HttpHeaders.AUTHORIZATION, "Bearer " + novoToken))
        .andExpect(status().isOk());
  }
}

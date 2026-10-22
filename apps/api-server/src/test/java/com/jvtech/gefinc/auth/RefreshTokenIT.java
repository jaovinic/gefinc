package com.jvtech.gefinc.auth;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import jakarta.servlet.http.Cookie;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

class RefreshTokenIT extends IntegrationTestBase {

  private TestUsers users;

  @BeforeEach
  void init() {
    users = new TestUsers(mockMvc, objectMapper);
  }

  private MvcResult refresh(String refreshToken) throws Exception {
    return mockMvc
        .perform(
            post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("refreshToken", refreshToken))))
        .andReturn();
  }

  private static String cookieValue(String setCookie) {
    return setCookie.substring(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
  }

  @Test
  void renovaComRotacaoERecusaOReusoDeUmTokenJaRotacionado() throws Exception {
    users.registerAndLogin("ana@example.com");
    String first = users.login("ana@example.com", TestUsers.PASSWORD).get("refreshToken").asText();

    MvcResult rotated = refresh(first);
    assertThat(rotated.getResponse().getStatus()).isEqualTo(200);
    JsonNode body = objectMapper.readTree(rotated.getResponse().getContentAsString());
    String second = body.get("refreshToken").asText();
    assertThat(second).isNotEqualTo(first);
    assertThat(body.get("accessToken").asText()).isNotBlank();

    // Reusar o token antigo é sinal de roubo: recusa e revoga toda a família.
    assertThat(refresh(first).getResponse().getStatus()).isEqualTo(401);
    assertThat(refresh(second).getResponse().getStatus()).isEqualTo(401);
  }

  @Test
  void respostaDaRenovacaoRespeitaOContrato() throws Exception {
    users.registerAndLogin("ana@example.com");
    String token = users.login("ana@example.com", TestUsers.PASSWORD).get("refreshToken").asText();

    mockMvc
        .perform(
            post("/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("refreshToken", token))))
        .andExpect(status().isOk())
        .andExpect(matchesContract());
  }

  @Test
  void webRenovaPeloCookieDesdeQueEnvieOCabecalhoXClient() throws Exception {
    users.registerAndLogin("ana@example.com");
    MvcResult login =
        mockMvc
            .perform(
                post("/auth/login")
                    .header("X-Client", "web")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        objectMapper.writeValueAsString(
                            Map.of("email", "ana@example.com", "password", TestUsers.PASSWORD))))
            .andReturn();
    String refreshCookie = cookieValue(login.getResponse().getHeader(HttpHeaders.SET_COOKIE));

    MvcResult renewed =
        mockMvc
            .perform(
                post("/auth/refresh")
                    .header("X-Client", "web")
                    .cookie(new Cookie("gefinc_refresh", refreshCookie)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").isString())
            .andExpect(jsonPath("$.refreshToken").doesNotExist())
            .andReturn();
    assertThat(renewed.getResponse().getHeader(HttpHeaders.SET_COOKIE))
        .contains("gefinc_refresh=")
        .contains("HttpOnly");
    assertThat(cookieValue(renewed.getResponse().getHeader(HttpHeaders.SET_COOKIE)))
        .isNotEqualTo(refreshCookie);
  }

  @Test
  void cookieSemOCabecalhoXClientEIgnoradoProtecaoContraRequisicaoForjada() throws Exception {
    users.registerAndLogin("ana@example.com");
    MvcResult login =
        mockMvc
            .perform(
                post("/auth/login")
                    .header("X-Client", "web")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        objectMapper.writeValueAsString(
                            Map.of("email", "ana@example.com", "password", TestUsers.PASSWORD))))
            .andReturn();
    String refreshCookie = cookieValue(login.getResponse().getHeader(HttpHeaders.SET_COOKIE));

    mockMvc
        .perform(post("/auth/refresh").cookie(new Cookie("gefinc_refresh", refreshCookie)))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
  }

  @Test
  void recusaTokenInventadoOuAusente() throws Exception {
    assertThat(refresh("token-que-nao-existe").getResponse().getStatus()).isEqualTo(401);
    mockMvc.perform(post("/auth/refresh")).andExpect(status().isUnauthorized());
  }

  @Test
  void expiraAposTrintaDias() throws Exception {
    users.registerAndLogin("ana@example.com");
    String token = users.login("ana@example.com", TestUsers.PASSWORD).get("refreshToken").asText();

    clock.advance(Duration.ofDays(30).plusSeconds(1));

    assertThat(refresh(token).getResponse().getStatus()).isEqualTo(401);
  }

  @Test
  void logoutRevogaOTokenDeRenovacaoInformado() throws Exception {
    var ana = users.registerAndLogin("ana@example.com");
    String token = users.login("ana@example.com", TestUsers.PASSWORD).get("refreshToken").asText();

    mockMvc
        .perform(
            post("/auth/logout")
                .header(HttpHeaders.AUTHORIZATION, ana.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("refreshToken", token))))
        .andExpect(status().isNoContent())
        .andExpect(matchesContract());

    assertThat(refresh(token).getResponse().getStatus()).isEqualTo(401);
  }
}

package com.jvtech.gefinc.auth;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestTokens;
import com.jvtech.gefinc.support.TestUsers;
import jakarta.servlet.http.Cookie;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
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

  @Test
  void renovacaoPreservaOSidDaSessaoEDesliza() throws Exception {
    users.registerAndLogin("ana@example.com");
    JsonNode login = users.login("ana@example.com", TestUsers.PASSWORD);
    var sid = TestTokens.sessionId(login.get("accessToken").asText());
    clock.advance(Duration.ofDays(10));
    Instant renewedAt = clock.instant();

    MvcResult rotated = refresh(login.get("refreshToken").asText());

    assertThat(rotated.getResponse().getStatus()).isEqualTo(200);
    JsonNode body = objectMapper.readTree(rotated.getResponse().getContentAsString());
    assertThat(TestTokens.sessionId(body.get("accessToken").asText())).isEqualTo(sid);
    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM auth_sessions WHERE id = ?", sid);
    assertThat(((Timestamp) row.get("last_used_at")).toInstant()).isEqualTo(renewedAt);
    assertThat(((Timestamp) row.get("expires_at")).toInstant())
        .isEqualTo(renewedAt.plus(Duration.ofDays(30)));
    // sem a renovação deslizante a sessão de 30 dias seria rejeitada no 35º dia
    clock.advance(Duration.ofDays(25));
    MvcResult again = refresh(body.get("refreshToken").asText());
    assertThat(again.getResponse().getStatus()).isEqualTo(200);
    String access =
        objectMapper.readTree(again.getResponse().getContentAsString()).get("accessToken").asText();
    mockMvc
        .perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + access))
        .andExpect(status().isOk());
  }

  @Test
  void tokenReusadoDeUmaSessaoMarcaASessaoComoEncerradaPeloSistema() throws Exception {
    users.registerAndLogin("ana@example.com");
    JsonNode login = users.login("ana@example.com", TestUsers.PASSWORD);
    var sid = TestTokens.sessionId(login.get("accessToken").asText());
    String first = login.get("refreshToken").asText();
    refresh(first);

    assertThat(refresh(first).getResponse().getStatus()).isEqualTo(401);

    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM auth_sessions WHERE id = ?", sid);
    assertThat(row.get("revoked_at")).isNotNull();
    assertThat(row).containsEntry("revoked_by", "SYSTEM");
  }

  @Test
  void sessaoRevogadaNaTabelaRecusaOTokenDeAcessoComSid() throws Exception {
    users.registerAndLogin("ana@example.com");
    JsonNode login = users.login("ana@example.com", TestUsers.PASSWORD);
    var sid = TestTokens.sessionId(login.get("accessToken").asText());
    jdbc.update(
        "UPDATE auth_sessions SET revoked_at = ?, revoked_by = 'ADMIN' WHERE id = ?",
        Timestamp.from(clock.instant()),
        sid);

    // a linha revogada recusa o token de acesso mesmo com a assinatura e a versão corretas
    assertThat(
            mockMvc
                .perform(
                    get("/auth/me")
                        .header(
                            HttpHeaders.AUTHORIZATION,
                            "Bearer " + login.get("accessToken").asText()))
                .andReturn()
                .getResponse()
                .getStatus())
        .isEqualTo(401);
  }
}

package com.jvtech.gefinc.auth;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestTokens;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

class AuthRegistrationLoginIT extends IntegrationTestBase {

  private String json(Map<String, ?> body) throws Exception {
    return objectMapper.writeValueAsString(body);
  }

  @Test
  void cadastraUsuarioGuardandoSenhaComBcrypt() throws Exception {
    mockMvc
        .perform(
            post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", "Ana@Example.com", "password", "senha-forte-123"))))
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.email").value("Ana@Example.com"))
        .andExpect(jsonPath("$.id").isNumber());

    String hash = jdbc.queryForObject("SELECT password_hash FROM users", String.class);
    assertThat(hash).startsWith("$2").doesNotContain("senha-forte-123");
  }

  @Test
  void recusaEmailJaCadastradoSemDiferenciarMaiusculas() throws Exception {
    new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");

    mockMvc
        .perform(
            post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", "ANA@EXAMPLE.COM", "password", "senha-forte-123"))))
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_REGISTERED"));
  }

  @Test
  void recusaEmailInvalidoESenhaForaDaPolitica() throws Exception {
    mockMvc
        .perform(
            post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", "isso-nao-e-email", "password", "curta"))))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
        .andExpect(jsonPath("$.errors[?(@.field=='email')]").exists())
        .andExpect(jsonPath("$.errors[?(@.field=='password')]").exists());
  }

  @Test
  void recusaSenhaAcimaDe72BytesMesmoComMenosDe72Caracteres() throws Exception {
    mockMvc
        .perform(
            post("/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", "ana@example.com", "password", "ç".repeat(40)))))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='password')]").exists());
  }

  @Test
  void loginMobileDevolveOsDoisTokensNoCorpo() throws Exception {
    new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");

    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", "ana@example.com", "password", TestUsers.PASSWORD))))
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.accessToken").isString())
        .andExpect(jsonPath("$.refreshToken").isString())
        .andExpect(jsonPath("$.expiresIn").value(900));
  }

  @Test
  void loginWebEntregaORefreshEmCookieHttpOnlyEOmiteDoCorpo() throws Exception {
    new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");

    MvcResult result =
        mockMvc
            .perform(
                post("/auth/login")
                    .header("X-Client", "web")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json(Map.of("email", "ana@example.com", "password", TestUsers.PASSWORD))))
            .andExpect(status().isOk())
            .andExpect(matchesContract())
            .andExpect(jsonPath("$.accessToken").isString())
            .andExpect(jsonPath("$.refreshToken").doesNotExist())
            .andReturn();

    String cookie = result.getResponse().getHeader(HttpHeaders.SET_COOKIE);
    assertThat(cookie)
        .contains("gefinc_refresh=")
        .contains("HttpOnly")
        .contains("Secure")
        .contains("SameSite=Strict")
        .contains("Path=/auth");
  }

  @Test
  void senhaErradaEEmailInexistenteRespondemIgualSemRevelarQualDadoErrou() throws Exception {
    new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");

    String wrongPassword =
        mockMvc
            .perform(
                post("/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json(Map.of("email", "ana@example.com", "password", "outra-senha-999"))))
            .andExpect(status().isUnauthorized())
            .andExpect(matchesContract())
            .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
            .andReturn()
            .getResponse()
            .getContentAsString();

    String unknownEmail =
        mockMvc
            .perform(
                post("/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json(
                            Map.of("email", "ninguem@example.com", "password", "outra-senha-999"))))
            .andExpect(status().isUnauthorized())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
            .andReturn()
            .getResponse()
            .getContentAsString();

    assertThat(unknownEmail).isEqualTo(wrongPassword);
  }

  @Test
  void tokenDeAcessoValidoLiberaRotasProtegidas() throws Exception {
    TestUser ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");

    mockMvc
        .perform(post("/auth/logout").header(HttpHeaders.AUTHORIZATION, ana.bearer()))
        .andExpect(status().isNoContent());
    mockMvc.perform(post("/auth/logout")).andExpect(status().isUnauthorized());
  }

  private static final String CHROME_WINDOWS =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
          + " Chrome/120.0.0.0 Safari/537.36";

  @Test
  void loginAbreUmaSessaoComIpRealRotuloEClaimSid() throws Exception {
    new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    jdbc.update("DELETE FROM auth_sessions");
    Instant now = clock.instant();

    JsonNode login =
        new TestUsers(mockMvc, objectMapper)
            .loginFrom("ana@example.com", TestUsers.PASSWORD, "203.0.113.9", CHROME_WINDOWS);

    UUID sid = TestTokens.sessionId(login.get("accessToken").asText());
    assertThat(sid).isNotNull();
    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM auth_sessions");
    assertThat(row.get("id")).isEqualTo(sid);
    assertThat(row)
        .containsEntry("client_ip", "203.0.113.9")
        .containsEntry("device_label", "Chrome em Windows")
        .containsEntry("client_kind", "OTHER");
    assertThat(row.get("revoked_at")).isNull();
    assertThat(row.get("revoked_by")).isNull();
    assertThat(((Timestamp) row.get("created_at")).toInstant()).isEqualTo(now);
    assertThat(((Timestamp) row.get("last_used_at")).toInstant()).isEqualTo(now);
    assertThat(((Timestamp) row.get("expires_at")).toInstant()).isAfter(now);
    // a sessão é a família do token de renovação emitido
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM refresh_tokens WHERE family_id = ?", Long.class, sid))
        .isEqualTo(1);
  }

  @Test
  void loginPeloClienteWebGuardaOTipoWebECadaLoginTemASuaSessao() throws Exception {
    new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    jdbc.update("DELETE FROM auth_sessions");
    String body = json(Map.of("email", "ana@example.com", "password", TestUsers.PASSWORD));

    mockMvc
        .perform(
            post("/auth/login")
                .header("X-Client", "web")
                .header("User-Agent", CHROME_WINDOWS)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
        .andExpect(status().isOk());
    mockMvc
        .perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
        .andExpect(status().isOk());

    assertThat(jdbc.queryForObject("SELECT count(*) FROM auth_sessions", Long.class)).isEqualTo(2);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM auth_sessions WHERE client_kind = 'WEB'", Long.class))
        .isEqualTo(1);
  }

  @Test
  void loginRecusadoNaoAbreSessao() throws Exception {
    new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    jdbc.update("DELETE FROM auth_sessions");

    mockMvc
        .perform(
            post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", "ana@example.com", "password", "senha-errada-999"))))
        .andExpect(status().isUnauthorized());

    assertThat(jdbc.queryForObject("SELECT count(*) FROM auth_sessions", Long.class)).isZero();
  }
}

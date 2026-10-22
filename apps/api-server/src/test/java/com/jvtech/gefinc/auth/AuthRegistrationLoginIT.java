package com.jvtech.gefinc.auth;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
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
}

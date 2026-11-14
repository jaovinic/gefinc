package com.jvtech.gefinc.admin.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestUsers;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.ResultActions;

/** Limite de taxa das ações administrativas: 30 escritas/min e 10 destrutivas/15 min por admin. */
@Import(AdminTestEndpoints.class)
class AdminRateLimitIT extends IntegrationTestBase {

  private String tokenA;
  private String tokenB;

  @BeforeEach
  void admins() throws Exception {
    seed.createAdmin("a@example.com");
    seed.createAdmin("b@example.com");
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    tokenA = users.login("a@example.com", TestUsers.PASSWORD).get("accessToken").asText();
    tokenB = users.login("b@example.com", TestUsers.PASSWORD).get("accessToken").asText();
  }

  private ResultActions call(String token, String path) throws Exception {
    return mockMvc.perform(post(path).header(HttpHeaders.AUTHORIZATION, "Bearer " + token));
  }

  private void mutate(String token, int times) throws Exception {
    for (int i = 0; i < times; i++) {
      call(token, "/admin/_test/mutate").andExpect(status().isOk());
    }
  }

  @Test
  void trintaEscritasPassamEATrintaEUmaDa429ComRetryAfter() throws Exception {
    mutate(tokenA, 30);

    call(tokenA, "/admin/_test/mutate")
        .andExpect(status().isTooManyRequests())
        .andExpect(header().string("Retry-After", "61"))
        .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"));

    clock.advance(Duration.ofSeconds(61));
    call(tokenA, "/admin/_test/mutate").andExpect(status().isOk());
  }

  @Test
  void leituraNaoContaNaCota() throws Exception {
    for (int i = 0; i < 100; i++) {
      mockMvc
          .perform(get("/admin/_test/read").header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA))
          .andExpect(status().isOk());
    }

    mutate(tokenA, 30);
  }

  @Test
  void destrutivasTemCotaPropriaDeDezPorQuinzeMinutos() throws Exception {
    for (int i = 0; i < 10; i++) {
      call(tokenA, "/admin/_test/destroy").andExpect(status().isOk());
    }

    call(tokenA, "/admin/_test/destroy")
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"));
    // há folga na cota de escritas comuns (10 de 30), mas a ação destrutiva continua barrada
    call(tokenA, "/admin/_test/destroy").andExpect(status().isTooManyRequests());

    clock.advance(Duration.ofMinutes(15).plusSeconds(1));
    // o token de acesso (15 min) também expirou: entra de novo
    tokenA =
        new TestUsers(mockMvc, objectMapper)
            .login("a@example.com", TestUsers.PASSWORD)
            .get("accessToken")
            .asText();
    call(tokenA, "/admin/_test/destroy").andExpect(status().isOk());
  }

  @Test
  void destrutivaTambemContaComoEscritaComum() throws Exception {
    mutate(tokenA, 25);
    for (int i = 0; i < 5; i++) {
      call(tokenA, "/admin/_test/destroy").andExpect(status().isOk());
    }

    call(tokenA, "/admin/_test/mutate").andExpect(status().isTooManyRequests());
  }

  @Test
  void recusaPorEscritaComumNaoConsomeCotaDestrutiva() throws Exception {
    mutate(tokenA, 30);
    for (int i = 0; i < 3; i++) {
      call(tokenA, "/admin/_test/destroy").andExpect(status().isTooManyRequests());
    }

    clock.advance(Duration.ofSeconds(61));
    for (int i = 0; i < 10; i++) {
      call(tokenA, "/admin/_test/destroy").andExpect(status().isOk());
    }
  }

  @Test
  void doisAdministradoresTemContadoresIndependentes() throws Exception {
    mutate(tokenA, 30);
    call(tokenA, "/admin/_test/mutate").andExpect(status().isTooManyRequests());

    call(tokenB, "/admin/_test/mutate").andExpect(status().isOk());
  }

  @Test
  void recusaPorLimiteEAuditadaUmaVezPorJanelaERepeticoesSoIncrementamOContador() throws Exception {
    double before = counter("gefinc.admin.attempts.suppressed", "type", "ACCESS_DENIED");
    mutate(tokenA, 30);

    for (int i = 0; i < 4; i++) {
      call(tokenA, "/admin/_test/mutate").andExpect(status().isTooManyRequests());
    }

    Map<String, Object> row = jdbc.queryForMap("SELECT * FROM audit_log");
    assertThat(row)
        .containsEntry("action", "ACCESS_DENIED")
        .containsEntry("result", "REFUSED")
        .containsEntry("refusal_code", "TOO_MANY_REQUESTS")
        .containsEntry("subject", "/admin/_test/mutate");
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log", Long.class)).isEqualTo(1);
    assertThat(counter("gefinc.admin.attempts.suppressed", "type", "ACCESS_DENIED") - before)
        .isEqualTo(3.0);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_log_client", Long.class))
        .isEqualTo(1);
  }

  @Test
  void recusaPorLimiteNaoEstendeAJanela() throws Exception {
    mutate(tokenA, 30);
    clock.advance(Duration.ofSeconds(30));
    call(tokenA, "/admin/_test/mutate").andExpect(status().isTooManyRequests());
    clock.advance(Duration.ofSeconds(31));

    call(tokenA, "/admin/_test/mutate").andExpect(status().isOk());
  }

  @Test
  void requisicaoNaoAutenticadaContinuaDando401ENaoConsomeCota() throws Exception {
    mockMvc.perform(post("/admin/_test/mutate")).andExpect(status().isUnauthorized());

    mutate(tokenA, 30);
  }
}

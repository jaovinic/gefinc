package com.jvtech.gefinc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** Verifica a fundação: contexto, PostgreSQL real, Flyway e o tratamento de erros e segurança. */
class ApplicationSmokeIT extends IntegrationTestBase {

  @Test
  void sobeComPostgresRealEExpoeASaude() throws Exception {
    mockMvc
        .perform(get("/actuator/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("UP"));
  }

  @Test
  void rotaProtegidaSemTokenResponde401EmProblemJson() throws Exception {
    mockMvc
        .perform(get("/accounts"))
        .andExpect(status().isUnauthorized())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
  }

  @Test
  void tokenInvalidoResponde401() throws Exception {
    mockMvc
        .perform(get("/accounts").header("Authorization", "Bearer lixo"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
  }

  @Test
  void respostasTrazemIdDeCorrelacaoECabecalhosDeSeguranca() throws Exception {
    mockMvc
        .perform(get("/actuator/health"))
        .andExpect(header().exists("X-Request-Id"))
        .andExpect(header().string("X-Content-Type-Options", "nosniff"))
        .andExpect(header().string("X-Frame-Options", "DENY"));
  }
}

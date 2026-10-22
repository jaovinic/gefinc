package com.jvtech.gefinc.common.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jvtech.gefinc.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;

/**
 * Cabeçalhos de segurança nas respostas e CORS restrito às origens do web e do app (Princípio III).
 */
class SecurityHeadersIT extends IntegrationTestBase {

  @Test
  void respostasTrazemCabecalhosDeSeguranca() throws Exception {
    mockMvc
        .perform(get("/actuator/health").secure(true))
        .andExpect(status().isOk())
        .andExpect(header().string("X-Content-Type-Options", "nosniff"))
        .andExpect(header().string("X-Frame-Options", "DENY"))
        .andExpect(header().string("Referrer-Policy", "no-referrer"))
        .andExpect(header().exists("Strict-Transport-Security"));
  }

  @Test
  void respostasDeErroDeAutenticacaoTambemTrazemOsCabecalhos() throws Exception {
    mockMvc
        .perform(get("/accounts"))
        .andExpect(status().isUnauthorized())
        .andExpect(header().string("X-Content-Type-Options", "nosniff"))
        .andExpect(header().string("X-Frame-Options", "DENY"));
  }

  @Test
  void appPodeEnviarEExporOsCabecalhosDeIdempotencia() throws Exception {
    mockMvc
        .perform(
            options("/transaction-groups")
                .header("Origin", "https://localhost")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "Authorization,Idempotency-Key"))
        .andExpect(status().isOk())
        .andExpect(header().string("Access-Control-Allow-Origin", "https://localhost"))
        .andExpect(
            header()
                .string(
                    "Access-Control-Allow-Headers",
                    org.hamcrest.Matchers.containsString("Idempotency-Key")));
  }

  @Test
  void origensDoWebEDoAppPodemChamarAApi() throws Exception {
    for (String origin :
        new String[] {
          "http://localhost:4200",
          "http://localhost:8100",
          "capacitor://localhost",
          "https://localhost"
        }) {
      mockMvc
          .perform(
              options("/transactions")
                  .header("Origin", origin)
                  .header("Access-Control-Request-Method", "GET")
                  .header("Access-Control-Request-Headers", "Authorization"))
          .andExpect(status().isOk())
          .andExpect(header().string("Access-Control-Allow-Origin", origin))
          .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    }
  }

  @Test
  void origemDesconhecidaERecusada() throws Exception {
    mockMvc
        .perform(
            options("/transactions")
                .header("Origin", "https://site-malicioso.example")
                .header("Access-Control-Request-Method", "GET"))
        .andExpect(status().isForbidden())
        .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));

    mockMvc
        .perform(get("/actuator/health").header("Origin", "https://site-malicioso.example"))
        .andExpect(status().isForbidden());
  }
}

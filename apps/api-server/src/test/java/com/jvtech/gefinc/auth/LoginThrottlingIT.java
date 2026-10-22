package com.jvtech.gefinc.auth;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/** Limite de tentativas de login: 5 falhas por e-mail e 20 por IP em 15 minutos. */
class LoginThrottlingIT extends IntegrationTestBase {

  private static final String RIGHT = "senha-forte-123";
  private static final String WRONG = "senha-errada-999";

  @BeforeEach
  void registerAna() throws Exception {
    new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
  }

  private ResultActions login(String path, String email, String password, String ip)
      throws Exception {
    return mockMvc.perform(
        post(path)
            .with(
                request -> {
                  request.setRemoteAddr(ip);
                  return request;
                })
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                objectMapper.writeValueAsString(Map.of("email", email, "password", password))));
  }

  private void fail(String email, int times, String ip) throws Exception {
    for (int i = 0; i < times; i++) {
      login("/auth/login", email, WRONG, ip).andExpect(status().isUnauthorized());
    }
  }

  @Test
  void bloqueiaDepoisDeCincoFalhasMesmoComASenhaCertaEDestravaAposQuinzeMinutos() throws Exception {
    fail("ana@example.com", 5, "10.0.0.1");

    login("/auth/login", "ana@example.com", RIGHT, "10.0.0.1")
        .andExpect(status().isTooManyRequests())
        .andExpect(matchesContract())
        .andExpect(header().exists("Retry-After"))
        .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"));

    // vale para o e-mail em qualquer IP e sem diferenciar maiúsculas
    login("/auth/login", "ANA@example.com", RIGHT, "10.0.0.2")
        .andExpect(status().isTooManyRequests());

    clock.advance(Duration.ofMinutes(15).plusSeconds(1));
    login("/auth/login", "ana@example.com", RIGHT, "10.0.0.1").andExpect(status().isOk());
  }

  @Test
  void emailInexistenteSofreOMesmoLimiteSemRevelarQueNaoExiste() throws Exception {
    fail("ninguem@example.com", 5, "10.0.0.1");

    login("/auth/login", "ninguem@example.com", WRONG, "10.0.0.1")
        .andExpect(status().isTooManyRequests())
        .andExpect(matchesContract());
  }

  @Test
  void loginBemSucedidoZeraAContagemDoEmail() throws Exception {
    fail("ana@example.com", 4, "10.0.0.1");
    login("/auth/login", "ana@example.com", RIGHT, "10.0.0.1").andExpect(status().isOk());

    fail("ana@example.com", 4, "10.0.0.1");
    login("/auth/login", "ana@example.com", RIGHT, "10.0.0.1").andExpect(status().isOk());
  }

  @Test
  void falhasAntigasSaemDaJanela() throws Exception {
    fail("ana@example.com", 4, "10.0.0.1");
    clock.advance(Duration.ofMinutes(16));

    fail("ana@example.com", 4, "10.0.0.1");
    login("/auth/login", "ana@example.com", RIGHT, "10.0.0.1").andExpect(status().isOk());
  }

  @Test
  void limitaPorIpQuandoOAtaqueTentaVariosEmails() throws Exception {
    for (int i = 0; i < 20; i++) {
      login("/auth/login", "alvo" + i + "@example.com", WRONG, "10.0.0.9")
          .andExpect(status().isUnauthorized());
    }

    login("/auth/login", "alvo-novo@example.com", WRONG, "10.0.0.9")
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"));
    // outro IP não é afetado
    login("/auth/login", "ana@example.com", RIGHT, "10.0.0.10").andExpect(status().isOk());
  }

  @Test
  void cancelamentoDeExclusaoDivideOMesmoLimite() throws Exception {
    fail("ana@example.com", 5, "10.0.0.1");

    login("/auth/account-deletion/cancel", "ana@example.com", RIGHT, "10.0.0.1")
        .andExpect(status().isTooManyRequests())
        .andExpect(matchesContract());
  }
}

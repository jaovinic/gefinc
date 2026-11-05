package com.jvtech.gefinc.transfer;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/** Reenviar a mesma Idempotency-Key de uma transferência não repete o efeito. */
class TransferIdempotencyIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long itau;
  private long wallet;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    itau = api.checking(ana, "Itaú");
    wallet = api.cash(ana, "Carteira");
  }

  private ResultActions send(HttpMethod method, String path, String key, Object body)
      throws Exception {
    MockHttpServletRequestBuilder builder =
        MockMvcRequestBuilders.request(method, path)
            .header(HttpHeaders.AUTHORIZATION, ana.bearer())
            .header("Idempotency-Key", key);
    if (body != null) {
      builder
          .contentType(MediaType.APPLICATION_JSON)
          .content(objectMapper.writeValueAsString(body));
    }
    return mockMvc.perform(builder);
  }

  private int count() {
    return jdbc.queryForObject("SELECT count(*) FROM account_transfers", Integer.class);
  }

  @Test
  void repetirACriacaoDevolveARespostaOriginalSemDuplicar() throws Exception {
    String key = UUID.randomUUID().toString();
    Map<String, Object> body = api.transferBody(itau, wallet, "75.00", "2026-11-10");

    String first =
        send(HttpMethod.POST, "/transfers", key, body)
            .andExpect(status().isCreated())
            .andExpect(matchesContract())
            .andExpect(header().doesNotExist("Idempotent-Replayed"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    String second =
        send(HttpMethod.POST, "/transfers", key, body)
            .andExpect(status().isCreated())
            .andExpect(matchesContract())
            .andExpect(header().string("Idempotent-Replayed", "true"))
            .andReturn()
            .getResponse()
            .getContentAsString();

    assertThat(objectMapper.readTree(second)).isEqualTo(objectMapper.readTree(first));
    assertThat(count()).isEqualTo(1);
    assertThat(api.balanceOf(ana, wallet)).isEqualTo("75.00");
  }

  @Test
  void mesmaChaveComOutroCorpoEErroExistente() throws Exception {
    String key = UUID.randomUUID().toString();
    send(HttpMethod.POST, "/transfers", key, api.transferBody(itau, wallet, "75.00", "2026-11-10"))
        .andExpect(status().isCreated());

    send(HttpMethod.POST, "/transfers", key, api.transferBody(itau, wallet, "76.00", "2026-11-10"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
    assertThat(count()).isEqualTo(1);
  }

  @Test
  void repetirAEdicaoEAExclusaoNaoViramConflitoNem404() throws Exception {
    JsonNode created = api.transfer(ana, itau, wallet, "75.00", "2026-11-10");
    String path = "/transfers/" + created.get("id").asLong();
    Map<String, Object> edit =
        Map.of(
            "fromAccountId",
            itau,
            "toAccountId",
            wallet,
            "amount",
            "80.00",
            "transferDate",
            "2026-11-10",
            "version",
            created.get("version").asLong());
    String editKey = UUID.randomUUID().toString();
    send(HttpMethod.PUT, path, editKey, edit).andExpect(status().isOk());
    send(HttpMethod.PUT, path, editKey, edit)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(header().string("Idempotent-Replayed", "true"))
        .andExpect(jsonPath("$.amount").value("80.00"));

    String deleteKey = UUID.randomUUID().toString();
    send(HttpMethod.DELETE, path, deleteKey, null).andExpect(status().isNoContent());
    send(HttpMethod.DELETE, path, deleteKey, null)
        .andExpect(status().isNoContent())
        .andExpect(header().string("Idempotent-Replayed", "true"));
    assertThat(count()).isZero();
  }
}

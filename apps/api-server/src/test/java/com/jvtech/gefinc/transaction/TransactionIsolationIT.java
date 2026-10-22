package com.jvtech.gefinc.transaction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Princípio III: nenhum usuário lê, altera ou referencia lançamentos, contas ou categorias alheios.
 */
class TransactionIsolationIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private TestUser bia;
  private long anaAccount;
  private long anaCategory;
  private long groupId;
  private long transactionId;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    ana = users.registerAndLogin("ana@example.com");
    bia = users.registerAndLogin("bia@example.com");
    anaAccount = api.checking(ana, "Itaú");
    anaCategory = api.category(ana, "Alimentação");
    JsonNode group =
        api.createGroup(
            ana,
            api.variableBody(
                "Mercado", "150.00", anaAccount, anaCategory, "2026-11-08", "2026-11-12"));
    groupId = group.get("id").asLong();
    transactionId = group.get("transactions").get(0).get("id").asLong();
  }

  @Test
  void outroUsuarioNaoEnxergaNemListaLancamentosAlheios() throws Exception {
    api.call(bia, HttpMethod.GET, "/transactions/" + transactionId, null)
        .andExpect(status().isNotFound());
    api.call(bia, HttpMethod.GET, "/transaction-groups/" + groupId, null)
        .andExpect(status().isNotFound());
    assertThat(api.get(bia, "/transactions").get("totalElements").asInt()).isZero();
  }

  @Test
  void outroUsuarioNaoAlteraPagaDesfazNemExclui() throws Exception {
    api.call(
            bia,
            HttpMethod.PATCH,
            "/transactions/" + transactionId,
            Map.of("amount", "1.00", "version", 0))
        .andExpect(status().isNotFound());
    api.call(
            bia,
            HttpMethod.POST,
            "/transactions/" + transactionId + "/pay",
            Map.of("paymentDate", "2026-11-10"))
        .andExpect(status().isNotFound());
    api.call(bia, HttpMethod.POST, "/transactions/" + transactionId + "/unpay", null)
        .andExpect(status().isNotFound());
    api.call(
            bia,
            HttpMethod.PUT,
            "/transaction-groups/" + groupId,
            Map.of("description", "x", "categoryId", api.category(bia, "Lazer"), "version", 0))
        .andExpect(status().isNotFound());
    api.call(bia, HttpMethod.DELETE, "/transaction-groups/" + groupId + "?confirm=true", null)
        .andExpect(status().isNotFound());
    api.call(
            bia,
            HttpMethod.POST,
            "/transaction-groups/" + groupId + "/end",
            Map.of("endMonth", "2026-12"))
        .andExpect(status().isNotFound());

    JsonNode untouched = api.get(ana, "/transactions/" + transactionId);
    assertThat(untouched.get("amount").asText()).isEqualTo("150.00");
    assertThat(untouched.get("status").asText()).isEqualTo("PENDING");
  }

  @Test
  void naoCriaLancamentoComContaOuCategoriaDeOutroUsuario() throws Exception {
    long biaAccount = api.checking(bia, "Nubank");
    long biaCategory = api.category(bia, "Lazer");

    api.call(
            bia,
            HttpMethod.POST,
            "/transaction-groups",
            api.variableBody(
                "Invasão", "10.00", anaAccount, biaCategory, "2026-11-08", "2026-11-12"))
        .andExpect(status().isNotFound());
    api.call(
            bia,
            HttpMethod.POST,
            "/transaction-groups",
            api.variableBody(
                "Invasão", "10.00", biaAccount, anaCategory, "2026-11-08", "2026-11-12"))
        .andExpect(status().isNotFound());
  }

  @Test
  void excluirContaComLancamentosRetorna409() throws Exception {
    api.call(ana, HttpMethod.DELETE, "/accounts/" + anaAccount, null)
        .andExpect(status().isConflict());
    JsonNode body = api.json(api.call(ana, HttpMethod.DELETE, "/accounts/" + anaAccount, null));
    assertThat(body.get("code").asText()).isEqualTo("ACCOUNT_IN_USE");
    // a conta continua existindo, só pode ser inativada
    assertThat(api.get(ana, "/accounts/" + anaAccount).get("active").asBoolean()).isTrue();
  }
}

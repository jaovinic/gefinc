package com.jvtech.gefinc.transaction;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class TransactionValidationIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long checking;
  private long food;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    checking = api.checking(ana, "Itaú");
    food = api.category(ana, "Alimentação");
  }

  private Map<String, Object> bodyWith(String key, Object value) {
    Map<String, Object> body =
        api.variableBody("Mercado", "10.00", checking, food, "2026-11-08", "2026-11-12");
    body.put(key, value);
    return body;
  }

  @Test
  void valorZeroNegativoOuForaDoFormatoERecusado() throws Exception {
    for (String amount : new String[] {"0.00", "-5.00"}) {
      api.call(ana, HttpMethod.POST, "/transaction-groups", bodyWith("totalAmount", amount))
          .andExpect(status().isUnprocessableEntity())
          .andExpect(matchesContract())
          .andExpect(jsonPath("$.errors[?(@.field=='totalAmount')]").exists());
    }
    for (String amount : new String[] {"10", "10.5", "10.555", "10,50", "abc"}) {
      // a requisição já viola o contrato (formato do valor), então só a resposta é verificada
      api.call(ana, HttpMethod.POST, "/transaction-groups", bodyWith("totalAmount", amount))
          .andExpect(status().isUnprocessableEntity())
          .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }
  }

  @Test
  void numeroJsonNoLugarDeStringDecimalERecusado() throws Exception {
    mockMvc
        .perform(
            MockMvcRequestBuilders.post("/transaction-groups")
                .header(HttpHeaders.AUTHORIZATION, ana.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"description\":\"X\",\"recurrenceType\":\"VARIABLE\",\"totalAmount\":10.00,"
                        + "\"accountId\":"
                        + checking
                        + ",\"categoryId\":"
                        + food
                        + ",\"purchaseDate\":\"2026-11-08\",\"firstDueDate\":\"2026-11-12\"}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
  }

  @Test
  void camposObrigatoriosEDescricao() throws Exception {
    api.call(ana, HttpMethod.POST, "/transaction-groups", Map.of("recurrenceType", "VARIABLE"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='description')]").exists())
        .andExpect(jsonPath("$.errors[?(@.field=='totalAmount')]").exists())
        .andExpect(jsonPath("$.errors[?(@.field=='accountId')]").exists())
        .andExpect(jsonPath("$.errors[?(@.field=='categoryId')]").exists())
        .andExpect(jsonPath("$.errors[?(@.field=='purchaseDate')]").exists());
    api.call(ana, HttpMethod.POST, "/transaction-groups", bodyWith("description", "  "))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='description')]").exists());
    api.call(ana, HttpMethod.POST, "/transaction-groups", bodyWith("description", "x".repeat(121)))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='description')]").exists());
  }

  @Test
  void dataInvalidaERecusada() throws Exception {
    api.call(ana, HttpMethod.POST, "/transaction-groups", bodyWith("purchaseDate", "2026-13-45"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void avulsoNaoAceitaParcelasEContaInativaRecusaNovosLancamentos() throws Exception {
    api.call(ana, HttpMethod.POST, "/transaction-groups", bodyWith("totalInstallments", 3))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='totalInstallments')]").exists());

    api.updateAccount(ana, checking, Map.of("active", false)).andExpect(status().isOk());
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            bodyWith("description", "Depois da inativação"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("ACCOUNT_INACTIVE"));
  }

  @Test
  void edicaoComVersaoDesatualizadaRetorna409() throws Exception {
    JsonNode group = api.createGroup(ana, bodyWith("description", "Original"));
    JsonNode tx = group.get("transactions").get(0);
    long id = tx.get("id").asLong();

    api.call(
            ana,
            HttpMethod.PATCH,
            "/transactions/" + id,
            Map.of("amount", "11.00", "version", tx.get("version").asLong()))
        .andExpect(status().isOk());
    api.call(
            ana,
            HttpMethod.PATCH,
            "/transactions/" + id,
            Map.of("amount", "12.00", "version", tx.get("version").asLong()))
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("STALE_VERSION"));
    api.call(
            ana,
            HttpMethod.PUT,
            "/transaction-groups/" + group.get("id").asLong(),
            Map.of("description", "x", "categoryId", food, "version", 99))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("STALE_VERSION"));
  }

  @Test
  void editarOcorrenciaPagaERecusado() throws Exception {
    JsonNode tx =
        api.createGroup(ana, bodyWith("description", "Original")).get("transactions").get(0);
    long id = tx.get("id").asLong();
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + id + "/pay",
            Map.of("paymentDate", "2026-11-10"))
        .andExpect(status().isOk());
    JsonNode paid = api.get(ana, "/transactions/" + id);

    api.call(
            ana,
            HttpMethod.PATCH,
            "/transactions/" + id,
            Map.of("amount", "11.00", "version", paid.get("version").asLong()))
        .andExpect(status().isConflict())
        .andExpect(matchesContract());
  }

  @Test
  void valorEDataInvalidosNaEdicaoDaOcorrencia() throws Exception {
    JsonNode tx =
        api.createGroup(ana, bodyWith("description", "Original")).get("transactions").get(0);
    long id = tx.get("id").asLong();
    long version = tx.get("version").asLong();

    api.call(
            ana,
            HttpMethod.PATCH,
            "/transactions/" + id,
            Map.of("amount", "0.00", "version", version))
        .andExpect(status().isUnprocessableEntity());
    api.call(
            ana,
            HttpMethod.PATCH,
            "/transactions/" + id,
            Map.of("dueDate", "2026-02-30", "version", version))
        .andExpect(status().isBadRequest());
    api.call(ana, HttpMethod.PATCH, "/transactions/" + id, Map.of("amount", "5.00"))
        .andExpect(status().isUnprocessableEntity());
  }
}

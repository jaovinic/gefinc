package com.jvtech.gefinc.transfer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Transferência não é receita nem despesa: nada além de /balances muda. Os demais relatórios são
 * comparados byte a byte (como JSON) antes e depois de criar, editar e excluir transferências.
 */
class TransferNoDistortionIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long itau;
  private long wallet;
  private long card;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    itau = api.checking(ana, "Itaú");
    wallet = api.cash(ana, "Carteira");
    card = api.cardOn(ana, "Nubank", 10, 17, itau).get("id").asLong();
    long food = api.category(ana, "Alimentação");
    long salary = api.category(ana, "Salário");
    long shopping = api.category(ana, "Compras");
    api.createGroup(
        ana, api.variableBody("Mercado", "150.00", itau, food, "2026-11-08", "2026-11-15"));
    api.createGroup(
        ana, api.variableBody("Salário", "3000.00", itau, salary, "2026-11-01", "2026-11-05"));
    api.createGroup(
        ana, api.fixedBody("Aluguel", "900.00", itau, food, "2026-11-03", "2026-11-20"));
    api.decemberPurchase(ana, card, shopping, "Notebook", "600.00");
  }

  private Map<String, JsonNode> reports() throws Exception {
    Map<String, JsonNode> reports = new LinkedHashMap<>();
    for (String url :
        new String[] {
          "/dashboard?month=2026-11",
          "/dashboard?month=2026-12",
          "/cashflow?from=2026-11&months=6",
          "/due-summary?from=2026-11-10&to=2026-12-20",
          "/transactions?size=200",
          "/transactions?month=2026-11&size=200",
          "/accounts/" + card + "/invoices/2026-12",
          "/invoices/projection?from=2026-11&months=6",
          "/accounts",
          "/categories"
        }) {
      reports.put(url, api.get(ana, url));
    }
    return reports;
  }

  @Test
  void soOSaldoPorContaMudaEOsDemaisRelatoriosFicamIdenticos() throws Exception {
    Map<String, JsonNode> before = reports();
    JsonNode balancesBefore = api.get(ana, "/balances");
    int transactionCount = before.get("/transactions?size=200").get("totalElements").asInt();

    JsonNode today = api.transfer(ana, itau, wallet, "500.00", "2026-11-10");
    JsonNode future = api.transfer(ana, wallet, itau, "20.00", "2026-11-25");
    api.call(
            ana,
            HttpMethod.PUT,
            "/transfers/" + today.get("id").asLong(),
            Map.of(
                "fromAccountId",
                itau,
                "toAccountId",
                wallet,
                "amount",
                "450.00",
                "transferDate",
                "2026-11-09",
                "description",
                "Ajuste",
                "version",
                today.get("version").asLong()))
        .andExpect(status().isOk());

    Map<String, JsonNode> during = reports();
    assertThat(during).isEqualTo(before);
    assertThat(during.get("/transactions?size=200").get("totalElements").asInt())
        .isEqualTo(transactionCount);
    JsonNode balancesDuring = api.get(ana, "/balances");
    assertThat(balancesDuring).isNotEqualTo(balancesBefore);
    assertThat(balancesDuring.get("total")).isEqualTo(balancesBefore.get("total"));

    api.call(ana, HttpMethod.DELETE, "/transfers/" + future.get("id").asLong(), null)
        .andExpect(status().isNoContent());
    api.call(ana, HttpMethod.DELETE, "/transfers/" + today.get("id").asLong(), null)
        .andExpect(status().isNoContent());
    assertThat(reports()).isEqualTo(before);
    assertThat(api.get(ana, "/balances")).isEqualTo(balancesBefore);
  }
}

package com.jvtech.gefinc.dashboard;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
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
import org.springframework.http.HttpMethod;

/**
 * Contagem de vencimentos para os lembretes do app. "Hoje" nos testes é 10/11/2026. Itaú (conta) e
 * Nubank (cartão que fecha dia 10 e vence dia 17).
 */
class DueSummaryIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long itau;
  private long nubank;
  private long food;
  private long salary;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    itau = api.checking(ana, "Itaú");
    nubank = api.card(ana, "Nubank", 10, 17);
    food = api.category(ana, "Alimentação");
    salary = api.category(ana, "Salário");
  }

  private void expense(String description, String amount, long account, String due)
      throws Exception {
    api.createGroup(ana, api.variableBody(description, amount, account, food, due, due));
  }

  private void cardPurchase(String description, String amount, String purchaseDate)
      throws Exception {
    api.createGroup(ana, api.variableBody(description, amount, nubank, food, purchaseDate, null));
  }

  private JsonNode summary(TestUser user, String from, String to) throws Exception {
    return api.json(
        api.call(user, HttpMethod.GET, "/due-summary?from=" + from + "&to=" + to, null)
            .andExpect(status().isOk())
            .andExpect(matchesContract()));
  }

  private static JsonNode day(JsonNode summary, String date) {
    for (JsonNode d : summary.get("days")) {
      if (d.get("date").asText().equals(date)) {
        return d;
      }
    }
    return null;
  }

  private void scenario() throws Exception {
    expense("Luz", "90.50", itau, "2026-11-05"); // atrasada
    expense("Mercado", "150.00", itau, "2026-11-10"); // hoje
    expense("Aluguel", "1000.00", itau, "2026-11-11"); // amanhã
    expense("Internet", "100.00", itau, "2026-11-11"); // amanhã
    api.createGroup(
        ana, api.variableBody("Salário", "5000.00", itau, salary, "2026-11-11", "2026-11-11"));
    long cinema =
        api.createGroup(
                ana, api.variableBody("Cinema", "40.00", itau, food, "2026-11-12", "2026-11-12"))
            .get("transactions")
            .get(0)
            .get("id")
            .asLong();
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + cinema + "/pay",
            Map.of("paymentDate", "2026-11-10"))
        .andExpect(status().isOk());
    cardPurchase("Farmácia", "60.00", "2026-11-08"); // fatura de novembro (vence 17/11)
    cardPurchase("Padaria", "30.00", "2026-11-09"); // mesma fatura
    cardPurchase("Antiga", "80.00", "2026-10-05"); // fatura de outubro (venceu 17/10)
  }

  @Test
  void contaPorDiaItensForaDeCartaoEFaturasComSaldo() throws Exception {
    scenario();

    JsonNode result = summary(ana, "2026-11-10", "2026-11-20");

    assertThat(result.get("days")).hasSize(3);
    assertThat(day(result, "2026-11-10").get("items").asInt()).isEqualTo(1);
    assertThat(day(result, "2026-11-10").get("invoices").asInt()).isZero();
    assertThat(day(result, "2026-11-11").get("items").asInt())
        .isEqualTo(2); // receita e paga não contam
    assertThat(day(result, "2026-11-17").get("items").asInt()).isZero();
    assertThat(day(result, "2026-11-17").get("invoices").asInt())
        .isEqualTo(1); // 2 compras = 1 fatura
  }

  @Test
  void atrasadoSeparaItensEFaturasAnterioresAHoje() throws Exception {
    scenario();

    JsonNode overdue = summary(ana, "2026-11-10", "2026-11-20").get("overdue");

    assertThat(overdue.get("items").asInt()).isEqualTo(1); // Luz
    assertThat(overdue.get("invoices").asInt()).isEqualTo(1); // fatura de outubro
  }

  @Test
  void faturaQuitadaNaoContaMasFaturaPagaEmPartesAindaConta() throws Exception {
    scenario();
    cardPurchase("Presente", "20.00", "2026-11-12"); // fatura de dezembro (vence 17/12)
    api.settleInvoice(ana, nubank, "2026-12", "2026-11-10").andExpect(status().isCreated());
    api.payInvoice(ana, nubank, "2026-11", "10.00", "2026-11-10").andExpect(status().isCreated());

    JsonNode result = summary(ana, "2026-11-10", "2026-12-31");

    assertThat(day(result, "2026-12-17")).isNull();
    assertThat(day(result, "2026-11-17").get("invoices").asInt()).isEqualTo(1);

    api.settleInvoice(ana, nubank, "2026-11", "2026-11-10").andExpect(status().isCreated());
    assertThat(day(summary(ana, "2026-11-10", "2026-12-31"), "2026-11-17")).isNull();
  }

  @Test
  void naoContaItemPagoNemFaturaSemSaldoNoAtrasado() throws Exception {
    scenario();
    api.settleInvoice(ana, nubank, "2026-10", "2026-11-10").andExpect(status().isCreated());

    JsonNode overdue = summary(ana, "2026-11-10", "2026-11-20").get("overdue");

    assertThat(overdue.get("invoices").asInt()).isZero();
  }

  @Test
  void respostaNaoTrazValoresDescricoesNemNomes() throws Exception {
    scenario();

    String body =
        api.call(ana, HttpMethod.GET, "/due-summary?from=2026-11-10&to=2026-11-20", null)
            .andReturn()
            .getResponse()
            .getContentAsString();

    assertThat(body).doesNotContain("Luz", "Aluguel", "Nubank", "Itaú", "1000", "90.50");
  }

  @Test
  void periodoInvalidoOuMaiorQue62DiasResponde400() throws Exception {
    for (String query :
        new String[] {
          "from=2026-11-20&to=2026-11-10",
          "from=2026-11-01&to=2027-01-15",
          "from=2026-11-01",
          "from=x&to=y"
        }) {
      api.call(ana, HttpMethod.GET, "/due-summary?" + query, null)
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    }
  }

  @Test
  void dadosDeOutroUsuarioNaoAparecem() throws Exception {
    scenario();
    TestUser bruno = new TestUsers(mockMvc, objectMapper).registerAndLogin("bruno@example.com");

    JsonNode result = summary(bruno, "2026-11-10", "2026-11-20");

    assertThat(result.get("days")).isEmpty();
    assertThat(result.get("overdue").get("items").asInt()).isZero();
    assertThat(result.get("overdue").get("invoices").asInt()).isZero();
  }

  @Test
  void exigeAutenticacao() throws Exception {
    mockMvc
        .perform(
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(
                "/due-summary?from=2026-11-10&to=2026-11-20"))
        .andExpect(status().isUnauthorized());
  }
}

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
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Relógio dos testes: 10/11/2026. Novembro/2026: Mercado R$ 150,00 (vence 15, pendente), Luz R$
 * 90,50 (venceu dia 5, atrasada), Cinema R$ 40,00 (paga) e, no cartão Nubank (fecha 10, vence 17),
 * Mouse R$ 100,00 (fatura de novembro, vence 17). Salário (receita) não entra nos totais de
 * despesas.
 */
class DashboardIT extends IntegrationTestBase {

  private TestApi api;
  private TestUsers users;
  private TestUser ana;
  private long checking;
  private long card;
  private long food;
  private long leisure;
  private long shopping;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    users = new TestUsers(mockMvc, objectMapper);
    ana = users.registerAndLogin("ana@example.com");
    checking = api.checking(ana, "Itaú");
    card = api.card(ana, "Nubank", 10, 17);
    food = api.category(ana, "Alimentação");
    leisure = api.category(ana, "Lazer");
    shopping = api.category(ana, "Compras");
    long salary = api.category(ana, "Salário");

    api.createGroup(
        ana, api.variableBody("Mercado", "150.00", checking, food, "2026-11-08", "2026-11-15"));
    api.createGroup(
        ana, api.variableBody("Luz", "90.50", checking, food, "2026-11-01", "2026-11-05"));
    JsonNode cinema =
        api.createGroup(
            ana,
            api.variableBody("Cinema", "40.00", checking, leisure, "2026-11-08", "2026-11-08"));
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + cinema.get("transactions").get(0).get("id").asLong() + "/pay",
            Map.of("paymentDate", "2026-11-08"))
        .andExpect(status().isOk());
    api.createGroup(
        ana,
        api.variableBody("Mouse", "100.00", card, shopping, "2026-11-05", null)); // vence 17/11
    api.createGroup(
        ana, api.fixedBody("Salário", "5000.00", checking, salary, "2026-11-05", "2026-11-05"));
  }

  private JsonNode dashboard(String month) throws Exception {
    return api.get(ana, "/dashboard?month=" + month);
  }

  @Test
  void indicadoresDoMesPorVencimentoDesconsideraReceitas() throws Exception {
    api.call(ana, HttpMethod.GET, "/dashboard?month=2026-11", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.month").value("2026-11"))
        .andExpect(jsonPath("$.totalMonth").value("380.50"))
        .andExpect(jsonPath("$.totalPaid").value("40.00"))
        .andExpect(jsonPath("$.totalToDue").value("250.00")) // Mercado 150 + fatura do Nubank 100
        .andExpect(jsonPath("$.overdueTotal").value("90.50"));
  }

  @Test
  void gastosPorCategoriaOrdenadosEPorCartao() throws Exception {
    JsonNode november = dashboard("2026-11");

    JsonNode categories = november.get("byCategory");
    assertThat(categories).hasSize(3);
    assertThat(categories.get(0).get("name").asText()).isEqualTo("Alimentação"); // 150 + 90,50
    assertThat(categories.get(0).get("amount").asText()).isEqualTo("240.50");
    assertThat(categories.get(0).get("colorHex").asText()).matches("^#[0-9A-Fa-f]{6}$");
    assertThat(categories.get(1).get("name").asText()).isEqualTo("Compras");
    assertThat(categories.get(2).get("name").asText()).isEqualTo("Lazer");

    JsonNode cards = november.get("byCard");
    assertThat(cards).hasSize(1);
    assertThat(cards.get(0).get("name").asText()).isEqualTo("Nubank");
    assertThat(cards.get(0).get("amount").asText()).isEqualTo("100.00");
  }

  @Test
  void pagamentoParcialDaFaturaEntraEmTotalPagoEReduzOAVencer() throws Exception {
    api.payInvoice(ana, card, "2026-11", "30.00", "2026-11-10").andExpect(status().isCreated());

    api.call(ana, HttpMethod.GET, "/dashboard?month=2026-11", null)
        .andExpect(jsonPath("$.totalMonth").value("380.50"))
        .andExpect(jsonPath("$.totalPaid").value("70.00")) // Cinema 40 + 30 da fatura
        .andExpect(jsonPath("$.totalToDue").value("220.00")); // Mercado 150 + restante da fatura 70
  }

  @Test
  void quitarAFaturaNaoContaDuasVezesOsItensQuitados() throws Exception {
    api.payInvoice(ana, card, "2026-11", "30.00", "2026-11-10").andExpect(status().isCreated());
    api.settleInvoice(ana, card, "2026-11", "2026-11-10").andExpect(status().isCreated());

    api.call(ana, HttpMethod.GET, "/dashboard?month=2026-11", null)
        .andExpect(
            jsonPath("$.totalPaid")
                .value("140.00")) // Cinema 40 + pagamentos 100 (o Mouse quitado não soma de novo)
        .andExpect(jsonPath("$.totalToDue").value("150.00"));
  }

  @Test
  void pagamentoDeFaturaEAtribuidoAoMesDoVencimentoNaoAoMesDoPagamento() throws Exception {
    api.decemberPurchase(ana, card, shopping, "Notebook", "600.00");
    api.payInvoice(ana, card, "2026-12", "300.00", "2026-11-20").andExpect(status().isCreated());

    assertThat(dashboard("2026-11").get("totalPaid").asText())
        .isEqualTo("40.00"); // sem os 300 de dezembro
    JsonNode december = dashboard("2026-12");
    assertThat(december.get("totalPaid").asText()).isEqualTo("300.00");
    assertThat(december.get("totalMonth").asText()).isEqualTo("600.00");
    assertThat(december.get("totalToDue").asText()).isEqualTo("300.00");
  }

  @Test
  void compraNoCartaoDepoisDoFechamentoSoApareceNoMesDoVencimento() throws Exception {
    api.decemberPurchase(
        ana, card, shopping, "Notebook", "600.00"); // comprado em 12/11, vence 17/12

    assertThat(dashboard("2026-11").get("totalMonth").asText()).isEqualTo("380.50");
    assertThat(dashboard("2026-12").get("totalMonth").asText()).isEqualTo("600.00");
  }

  @Test
  void faturaVencidaEPendenteViraAtrasada() throws Exception {
    clock.advance(Duration.ofDays(10)); // 20/11: a fatura venceu no dia 17
    TestUser token =
        new TestUser(
            ana.id(),
            ana.email(),
            users.login("ana@example.com", TestUsers.PASSWORD).get("accessToken").asText());

    JsonNode november = api.get(token, "/dashboard?month=2026-11");
    // Luz 90,50 + Mercado 150 (venceu dia 15) + fatura 100 (venceu dia 17)
    assertThat(november.get("overdueTotal").asText()).isEqualTo("340.50");
    assertThat(november.get("totalToDue").asText()).isEqualTo("0.00");
  }

  @Test
  void mesSemLancamentosVemZerado() throws Exception {
    api.call(ana, HttpMethod.GET, "/dashboard?month=2030-01", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.totalMonth").value("0.00"))
        .andExpect(jsonPath("$.totalToDue").value("0.00"))
        .andExpect(jsonPath("$.totalPaid").value("0.00"))
        .andExpect(jsonPath("$.overdueTotal").value("0.00"))
        .andExpect(jsonPath("$.byCategory.length()").value(0))
        .andExpect(jsonPath("$.byCard.length()").value(0));
  }

  @Test
  void outroUsuarioNaoEnxergaOPainelDeAna() throws Exception {
    TestUser bia = users.registerAndLogin("bia@example.com");

    JsonNode empty = api.get(bia, "/dashboard?month=2026-11");
    assertThat(empty.get("totalMonth").asText()).isEqualTo("0.00");
    assertThat(empty.get("byCategory")).isEmpty();
  }

  @Test
  void mesObrigatorioEValidado() throws Exception {
    api.call(ana, HttpMethod.GET, "/dashboard", null).andExpect(status().isBadRequest());
    api.call(ana, HttpMethod.GET, "/dashboard?month=2026-13", null)
        .andExpect(status().isBadRequest());
  }
}

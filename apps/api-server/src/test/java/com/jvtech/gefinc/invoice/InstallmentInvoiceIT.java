package com.jvtech.gefinc.invoice;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Parcelamento no cartão: cada parcela cai na fatura do seu mês de vencimento. */
class InstallmentInvoiceIT extends IntegrationTestBase {

  private static final List<String> MONTHS =
      List.of(
          "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07",
          "2027-08", "2027-09");

  private TestApi api;
  private TestUser ana;
  private long card;
  private long shopping;
  private long groupId;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    card = api.card(ana, "Inter", 5, 15);
    shopping = api.category(ana, "Compras");
    Map<String, Object> body =
        api.groupBody("INSTALLMENT", "Geladeira", "1000.00", card, shopping, "2026-11-06", null);
    body.put("totalInstallments", 10);
    groupId = api.createGroup(ana, body).get("id").asLong();
  }

  @Test
  void cadaParcelaApareceNaFaturaDoSeuMesComNumeracaoETotalCorretos() throws Exception {
    for (int i = 0; i < MONTHS.size(); i++) {
      String month = MONTHS.get(i);
      api.call(ana, HttpMethod.GET, "/accounts/" + card + "/invoices/" + month, null)
          .andExpect(status().isOk())
          .andExpect(matchesContract())
          .andExpect(jsonPath("$.dueDate").value(month + "-15"))
          .andExpect(jsonPath("$.total").value("100.00"))
          .andExpect(jsonPath("$.remaining").value("100.00"))
          .andExpect(jsonPath("$.items.length()").value(1))
          .andExpect(jsonPath("$.items[0].groupId").value(groupId))
          .andExpect(jsonPath("$.items[0].amount").value("100.00"))
          .andExpect(jsonPath("$.items[0].installmentNumber").value(i + 1))
          .andExpect(jsonPath("$.items[0].totalInstallments").value(10));
    }
  }

  @Test
  void mesesForaDoParcelamentoFicamSemItens() throws Exception {
    // Compra no dia 6 (após o fechamento): novembro/2026 e outubro/2027 não têm parcela.
    for (String month : List.of("2026-11", "2027-10")) {
      api.call(ana, HttpMethod.GET, "/accounts/" + card + "/invoices/" + month, null)
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.total").value("0.00"))
          .andExpect(jsonPath("$.items.length()").value(0));
    }
  }

  @Test
  void listagemDoMesMostraApenasAParcelaDaqueleMes() throws Exception {
    JsonNode january = api.get(ana, "/transactions?month=2027-01&accountId=" + card);
    assertThat(january.get("content")).hasSize(1);
    assertThat(january.get("content").get(0).get("installmentNumber").asInt()).isEqualTo(2);
    assertThat(january.get("content").get(0).get("dueDate").asText()).isEqualTo("2027-01-15");

    JsonNode last = api.get(ana, "/transactions?month=2027-09&accountId=" + card);
    assertThat(last.get("content")).hasSize(1);
    assertThat(last.get("content").get(0).get("installmentNumber").asInt()).isEqualTo(10);

    JsonNode november = api.get(ana, "/transactions?month=2026-11&accountId=" + card);
    assertThat(november.get("content")).isEmpty();
  }

  @Test
  void projecaoRefleteOsDezMesesDeFatura() throws Exception {
    api.call(ana, HttpMethod.GET, "/invoices/projection?from=2026-11&months=12", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.months.length()").value(12))
        .andExpect(jsonPath("$.cards[0].invoices.length()").value(12))
        .andExpect(jsonPath("$.cards[0].invoices[0].total").value("0.00"))
        .andExpect(jsonPath("$.cards[0].invoices[1].total").value("100.00"))
        .andExpect(jsonPath("$.cards[0].invoices[10].total").value("100.00"))
        .andExpect(jsonPath("$.cards[0].invoices[11].total").value("0.00"))
        .andExpect(jsonPath("$.cards[0].totalCommitted").value("1000.00"));
  }
}

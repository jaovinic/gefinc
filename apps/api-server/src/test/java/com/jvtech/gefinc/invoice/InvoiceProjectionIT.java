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
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

class InvoiceProjectionIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long card;
  private long shopping;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    card = api.card(ana, "Nubank", 10, 17);
    shopping = api.category(ana, "Compras");
  }

  private Map<String, Object> installments(long account, String total, int count) {
    Map<String, Object> body =
        api.groupBody("INSTALLMENT", "Geladeira", total, account, shopping, "2026-11-12", null);
    body.put("totalInstallments", count);
    return body;
  }

  @Test
  void totaisPorCartaoEMesIncluindoMesesVaziosEPagamentoParcial() throws Exception {
    api.createGroup(ana, installments(card, "300.00", 3)); // dez, jan, fev: R$ 100,00 cada
    api.decemberPurchase(ana, card, shopping, "Tênis", "400.00");
    api.payInvoice(ana, card, "2026-12", "150.00", "2026-12-10").andExpect(status().isCreated());

    api.call(ana, HttpMethod.GET, "/invoices/projection?from=2026-11&months=5", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.months.length()").value(5))
        .andExpect(jsonPath("$.months[0]").value("2026-11"))
        .andExpect(jsonPath("$.months[4]").value("2027-03"))
        .andExpect(jsonPath("$.cards.length()").value(1))
        .andExpect(jsonPath("$.cards[0].accountId").value(card))
        .andExpect(jsonPath("$.cards[0].name").value("Nubank"))
        .andExpect(jsonPath("$.cards[0].invoices.length()").value(5))
        .andExpect(jsonPath("$.cards[0].invoices[0].total").value("0.00")) // novembro vazio
        .andExpect(jsonPath("$.cards[0].invoices[1].total").value("500.00"))
        .andExpect(jsonPath("$.cards[0].invoices[1].remaining").value("350.00"))
        .andExpect(jsonPath("$.cards[0].invoices[2].remaining").value("100.00"))
        .andExpect(jsonPath("$.cards[0].invoices[3].remaining").value("100.00"))
        .andExpect(jsonPath("$.cards[0].invoices[4].remaining").value("0.00"))
        .andExpect(jsonPath("$.cards[0].totalCommitted").value("550.00"));
  }

  @Test
  void filtraPorCartaoEIgnoraContasQueNaoSaoCartao() throws Exception {
    long other = api.card(ana, "Mercado Pago", 5, 12);
    api.checking(ana, "Itaú");
    api.decemberPurchase(ana, card, shopping, "Tênis", "400.00");

    JsonNode all = api.get(ana, "/invoices/projection?from=2026-12&months=1");
    assertThat(all.get("cards")).hasSize(2);
    JsonNode filtered =
        api.get(ana, "/invoices/projection?from=2026-12&months=1&accountId=" + other);
    assertThat(filtered.get("cards")).hasSize(1);
    assertThat(filtered.get("cards").get(0).get("name").asText()).isEqualTo("Mercado Pago");
    assertThat(filtered.get("cards").get(0).get("totalCommitted").asText()).isEqualTo("0.00");
  }

  @Test
  void usuarioSemCartoesRecebeListaVazia() throws Exception {
    api.call(ana, HttpMethod.DELETE, "/accounts/" + card, null).andExpect(status().isNoContent());

    api.call(ana, HttpMethod.GET, "/invoices/projection?from=2026-11&months=3", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.cards.length()").value(0))
        .andExpect(jsonPath("$.months.length()").value(3));
  }

  @Test
  void parametrosInvalidosSaoRecusados() throws Exception {
    api.call(ana, HttpMethod.GET, "/invoices/projection?months=3", null)
        .andExpect(status().isBadRequest());
    api.call(ana, HttpMethod.GET, "/invoices/projection?from=2026-11&months=0", null)
        .andExpect(status().isBadRequest());
    api.call(ana, HttpMethod.GET, "/invoices/projection?from=2026-11&months=25", null)
        .andExpect(status().isBadRequest());
  }

  @Test
  void faturaComVencimentosDistintosNoMesExibeOMaisRecente() throws Exception {
    api.decemberPurchase(ana, card, shopping, "Tênis", "400.00"); // vence 17/12
    api.updateAccount(ana, card, Map.of("dueDay", 25)).andExpect(status().isOk());
    api.decemberPurchase(ana, card, shopping, "Camisa", "100.00"); // vence 25/12

    api.call(ana, HttpMethod.GET, "/accounts/" + card + "/invoices/2026-12", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.dueDate").value("2026-12-25"))
        .andExpect(jsonPath("$.total").value("500.00"));
  }
}

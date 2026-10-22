package com.jvtech.gefinc.invoice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Princípio III: faturas, pagamentos e projeções são sempre do próprio usuário. */
class InvoiceIsolationIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private TestUser bia;
  private long anaCard;
  private long paymentId;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    ana = users.registerAndLogin("ana@example.com");
    bia = users.registerAndLogin("bia@example.com");
    anaCard = api.card(ana, "Nubank", 10, 17);
    api.decemberPurchase(ana, anaCard, api.category(ana, "Compras"), "Tênis", "400.00");
    JsonNode invoice =
        api.json(
            api.payInvoice(ana, anaCard, "2026-12", "100.00", "2026-12-10")
                .andExpect(status().isCreated()));
    paymentId = invoice.get("payments").get(0).get("id").asLong();
  }

  @Test
  void outroUsuarioNaoConsultaNemPagaFaturaAlheia() throws Exception {
    api.call(bia, HttpMethod.GET, "/accounts/" + anaCard + "/invoices/2026-12", null)
        .andExpect(status().isNotFound());
    api.payInvoice(bia, anaCard, "2026-12", "10.00", "2026-12-10").andExpect(status().isNotFound());
    api.settleInvoice(bia, anaCard, "2026-12", "2026-12-10").andExpect(status().isNotFound());
  }

  @Test
  void outroUsuarioNaoDesfazPagamentoAlheio() throws Exception {
    api.call(bia, HttpMethod.DELETE, "/invoice-payments/" + paymentId, null)
        .andExpect(status().isNotFound());
    assertThat(api.get(ana, "/accounts/" + anaCard + "/invoices/2026-12").get("remaining").asText())
        .isEqualTo("300.00");
  }

  @Test
  void projecaoDeOutroUsuarioNaoIncluiMeusCartoes() throws Exception {
    JsonNode projection = api.get(bia, "/invoices/projection?from=2026-12&months=1");
    assertThat(projection.get("cards")).isEmpty();
    api.call(
            bia,
            HttpMethod.GET,
            "/invoices/projection?from=2026-12&months=1&accountId=" + anaCard,
            null)
        .andExpect(status().isNotFound());
  }
}

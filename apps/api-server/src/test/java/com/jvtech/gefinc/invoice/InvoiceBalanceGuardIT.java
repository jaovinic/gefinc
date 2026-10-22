package com.jvtech.gefinc.invoice;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;

/** O restante da fatura nunca fica negativo: operações que o violariam são recusadas com 409. */
class InvoiceBalanceGuardIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long card;
  private long shopping;
  private long notebookGroup;
  private long notebookTx;
  private long sneakersTx;
  private long notebookVersion;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    card = api.card(ana, "Nubank", 10, 17);
    shopping = api.category(ana, "Compras");
    JsonNode notebook = api.decemberPurchase(ana, card, shopping, "Notebook", "600.00");
    JsonNode sneakers = api.decemberPurchase(ana, card, shopping, "Tênis", "400.00");
    notebookGroup = notebook.get("id").asLong();
    notebookTx = notebook.get("transactions").get(0).get("id").asLong();
    notebookVersion = notebook.get("transactions").get(0).get("version").asLong();
    sneakersTx = sneakers.get("transactions").get(0).get("id").asLong();
  }

  private JsonNode invoice() throws Exception {
    return api.get(ana, "/accounts/" + card + "/invoices/2026-12");
  }

  @Test
  void excluirItemQueDeixariaORestanteNegativoERecusado() throws Exception {
    api.payInvoice(ana, card, "2026-12", "700.00", "2026-12-10").andExpect(status().isCreated());

    api.call(ana, HttpMethod.DELETE, "/transaction-groups/" + notebookGroup + "?confirm=true", null)
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("INVOICE_BALANCE_VIOLATION"));

    JsonNode after = invoice();
    assertThat(after.get("items")).hasSize(2); // nada mudou
    assertThat(after.get("remaining").asText()).isEqualTo("300.00");
  }

  @Test
  void reduzirOValorDeUmItemQueDeixariaORestanteNegativoERecusado() throws Exception {
    api.payInvoice(ana, card, "2026-12", "700.00", "2026-12-10").andExpect(status().isCreated());

    api.call(
            ana,
            HttpMethod.PATCH,
            "/transactions/" + notebookTx,
            Map.of("amount", "200.00", "version", notebookVersion))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVOICE_BALANCE_VIOLATION"));
    api.call(
            ana,
            HttpMethod.PATCH,
            "/transactions/" + notebookTx,
            Map.of("amount", "700.00", "version", notebookVersion))
        .andExpect(status().isOk());
    assertThat(invoice().get("total").asText()).isEqualTo("1100.00");
  }

  @Test
  void pagarItemIndividualmenteQueDeixariaORestanteNegativoERecusado() throws Exception {
    api.payInvoice(ana, card, "2026-12", "700.00", "2026-12-10").andExpect(status().isCreated());

    // 1000 de total - 400 pagos no item - 700 pagos na fatura = -100
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + sneakersTx + "/pay",
            Map.of("paymentDate", "2026-12-11"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVOICE_BALANCE_VIOLATION"));
    assertThat(api.get(ana, "/transactions/" + sneakersTx).get("status").asText())
        .isEqualTo("PENDING");
  }

  @Test
  void pagarItemIndividualmenteQueCabeNoRestanteEAceito() throws Exception {
    api.payInvoice(ana, card, "2026-12", "300.00", "2026-12-10").andExpect(status().isCreated());

    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + sneakersTx + "/pay",
            Map.of("paymentDate", "2026-12-11"))
        .andExpect(status().isOk());
    assertThat(invoice().get("remaining").asText()).isEqualTo("300.00");
  }

  @Test
  void doisPagamentosSimultaneosNaoUltrapassamOTotal() throws Exception {
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      Callable<Integer> pay =
          () ->
              mockMvc
                  .perform(
                      post("/accounts/" + card + "/invoices/2026-12/payments")
                          .header(HttpHeaders.AUTHORIZATION, ana.bearer())
                          .contentType(MediaType.APPLICATION_JSON)
                          .content(
                              objectMapper.writeValueAsString(
                                  Map.of("amount", "600.00", "paidAt", "2026-12-10"))))
                  .andReturn()
                  .getResponse()
                  .getStatus();
      Future<Integer> first = pool.submit(pay);
      Future<Integer> second = pool.submit(pay);

      List<Integer> statuses = List.of(first.get(), second.get());
      assertThat(statuses).containsExactlyInAnyOrder(201, 409);
    } finally {
      pool.shutdownNow();
    }
    assertThat(invoice().get("remaining").asText()).isEqualTo("400.00");
  }

  @Test
  void encerrarLancamentoFixoNoCartaoQueViolariaORestanteERecusado() throws Exception {
    // assinatura de R$ 50,00/mês comprada em 12/11 (primeira fatura: dezembro) e uma compra de R$
    // 100,00 em janeiro
    JsonNode fixed =
        api.createGroup(
            ana, api.fixedBody("Streaming", "50.00", card, shopping, "2026-11-12", null));
    api.createGroup(ana, api.variableBody("Livro", "100.00", card, shopping, "2026-12-12", null));
    api.payInvoice(ana, card, "2027-01", "120.00", "2027-01-10").andExpect(status().isCreated());

    // encerrar em dezembro removeria os R$ 50,00 de janeiro: total 100 - pagamentos 120 = -20
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups/" + fixed.get("id").asLong() + "/end",
            Map.of("endMonth", "2026-12"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVOICE_BALANCE_VIOLATION"));
    assertThat(api.get(ana, "/accounts/" + card + "/invoices/2027-01").get("total").asText())
        .isEqualTo("150.00");
  }

  @Test
  void alterarOValorMensalDeUmFixoQueDeixariaORestanteNegativoERecusado() throws Exception {
    JsonNode fixed =
        api.createGroup(
            ana, api.fixedBody("Streaming", "50.00", card, shopping, "2026-11-12", null));
    api.createGroup(ana, api.variableBody("Livro", "100.00", card, shopping, "2026-12-12", null));
    api.payInvoice(ana, card, "2027-01", "120.00", "2027-01-10").andExpect(status().isCreated());

    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups/" + fixed.get("id").asLong() + "/amount-changes",
            Map.of("fromMonth", "2027-01", "amount", "10.00"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVOICE_BALANCE_VIOLATION"));
  }
}

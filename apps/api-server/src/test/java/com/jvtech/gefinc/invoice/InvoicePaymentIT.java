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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Fatura de dezembro/2026 do Nubank (fecha dia 10, vence dia 17): Notebook R$ 600,00 + Tênis R$
 * 400,00.
 */
class InvoicePaymentIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long card;
  private long notebookTx;
  private long sneakersTx;
  private long notebookGroup;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    card = api.card(ana, "Nubank", 10, 17);
    long shopping = api.category(ana, "Compras");
    JsonNode notebook = api.decemberPurchase(ana, card, shopping, "Notebook", "600.00");
    JsonNode sneakers = api.decemberPurchase(ana, card, shopping, "Tênis", "400.00");
    notebookGroup = notebook.get("id").asLong();
    notebookTx = notebook.get("transactions").get(0).get("id").asLong();
    sneakersTx = sneakers.get("transactions").get(0).get("id").asLong();
  }

  private JsonNode invoice() throws Exception {
    return api.get(ana, "/accounts/" + card + "/invoices/2026-12");
  }

  private List<String> statuses(JsonNode invoice) {
    List<String> list = new ArrayList<>();
    invoice.get("items").forEach(i -> list.add(i.get("status").asText()));
    return list;
  }

  @Test
  void consultaAFaturaComItensTotalERestante() throws Exception {
    api.call(ana, HttpMethod.GET, "/accounts/" + card + "/invoices/2026-12", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.month").value("2026-12"))
        .andExpect(jsonPath("$.dueDate").value("2026-12-17"))
        .andExpect(jsonPath("$.total").value("1000.00"))
        .andExpect(jsonPath("$.paidIndividually").value("0.00"))
        .andExpect(jsonPath("$.paidByInvoicePayments").value("0.00"))
        .andExpect(jsonPath("$.remaining").value("1000.00"))
        .andExpect(jsonPath("$.items.length()").value(2))
        .andExpect(jsonPath("$.payments.length()").value(0));
  }

  @Test
  void pagamentoParcialDeduzDoTotalESemMudarOStatusDosItens() throws Exception {
    api.payInvoice(ana, card, "2026-12", "300.00", "2026-12-10")
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.remaining").value("700.00"))
        .andExpect(jsonPath("$.paidByInvoicePayments").value("300.00"))
        .andExpect(jsonPath("$.payments.length()").value(1))
        .andExpect(jsonPath("$.payments[0].amount").value("300.00"));

    assertThat(statuses(invoice())).containsOnly("PENDING");
  }

  @Test
  void pagamentoAcimaDoRestanteERecusadoComOSaldoRestante() throws Exception {
    api.payInvoice(ana, card, "2026-12", "300.00", "2026-12-10").andExpect(status().isCreated());

    api.payInvoice(ana, card, "2026-12", "800.00", "2026-12-11")
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("INVOICE_BALANCE_VIOLATION"))
        .andExpect(jsonPath("$.remainingBalance").value("700.00"));
    assertThat(invoice().get("remaining").asText()).isEqualTo("700.00");
  }

  @Test
  void valorZeroNegativoOuForaDoFormatoERecusado() throws Exception {
    api.payInvoice(ana, card, "2026-12", "0.00", "2026-12-10")
        .andExpect(status().isUnprocessableEntity());
    api.payInvoice(ana, card, "2026-12", "-5.00", "2026-12-10")
        .andExpect(status().isUnprocessableEntity());
    api.payInvoice(ana, card, "2026-12", "10.555", "2026-12-10")
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void quitarPeloRestanteMarcaOsItensPendentesComoPagosNaDataDoPagamento() throws Exception {
    api.payInvoice(ana, card, "2026-12", "300.00", "2026-12-10").andExpect(status().isCreated());

    api.settleInvoice(ana, card, "2026-12", "2026-12-17")
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.remaining").value("0.00"))
        .andExpect(jsonPath("$.paidByInvoicePayments").value("1000.00"))
        .andExpect(jsonPath("$.payments.length()").value(2))
        .andExpect(jsonPath("$.items[0].status").value("PAID"))
        .andExpect(jsonPath("$.items[0].paymentDate").value("2026-12-17"))
        .andExpect(jsonPath("$.items[0].settledByInvoicePayment").value(true));
  }

  @Test
  void pagamentoQueZeraORestanteTambemQuitaOsItens() throws Exception {
    api.payInvoice(ana, card, "2026-12", "1000.00", "2026-12-17").andExpect(status().isCreated());

    assertThat(statuses(invoice())).containsOnly("PAID");
    api.settleInvoice(ana, card, "2026-12", "2026-12-18").andExpect(status().isConflict());
  }

  @Test
  void desfazerUmPagamentoDepoisDaQuitacaoRevertesoOsItensQuitadosAutomaticamente()
      throws Exception {
    // Notebook pago individualmente (R$ 600,00): conta no pago da fatura e não é revertido depois
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + notebookTx + "/pay",
            Map.of("paymentDate", "2026-12-05"))
        .andExpect(status().isOk());
    assertThat(invoice().get("remaining").asText()).isEqualTo("400.00");
    api.payInvoice(ana, card, "2026-12", "400.00", "2026-12-17").andExpect(status().isCreated());
    JsonNode settled = invoice();
    assertThat(statuses(settled)).containsOnly("PAID");
    long paymentId = settled.get("payments").get(0).get("id").asLong();

    api.call(ana, HttpMethod.DELETE, "/invoice-payments/" + paymentId, null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.remaining").value("400.00"))
        .andExpect(jsonPath("$.payments.length()").value(0));

    JsonNode after = invoice();
    assertThat(after.get("items").get(0).get("status").asText())
        .isEqualTo("PAID"); // pago individualmente
    assertThat(after.get("items").get(0).get("settledByInvoicePayment").asBoolean()).isFalse();
    assertThat(after.get("items").get(1).get("status").asText())
        .isEqualTo("PENDING"); // era quitado pela fatura
    assertThat(after.get("items").get(1).has("paymentDate")).isFalse();
  }

  @Test
  void desfazerUmPagamentoAntigoDepoisDaQuitacaoTambemRevertesOsItens() throws Exception {
    api.payInvoice(ana, card, "2026-12", "300.00", "2026-12-10").andExpect(status().isCreated());
    api.settleInvoice(ana, card, "2026-12", "2026-12-17").andExpect(status().isCreated());
    JsonNode settled = invoice();
    long firstPayment = settled.get("payments").get(0).get("id").asLong();

    api.call(ana, HttpMethod.DELETE, "/invoice-payments/" + firstPayment, null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.remaining").value("300.00"))
        .andExpect(jsonPath("$.paidByInvoicePayments").value("700.00"));
    assertThat(statuses(invoice())).containsOnly("PENDING");
  }

  @Test
  void itemPagoIndividualmenteContaNoSaldoRestanteDaFatura() throws Exception {
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + sneakersTx + "/pay",
            Map.of("paymentDate", "2026-12-05"))
        .andExpect(status().isOk());

    api.call(ana, HttpMethod.GET, "/accounts/" + card + "/invoices/2026-12", null)
        .andExpect(jsonPath("$.paidIndividually").value("400.00"))
        .andExpect(jsonPath("$.remaining").value("600.00"));
  }

  @Test
  void itemQuitadoPelaFaturaNaoPodeSerDesfeitoIsoladamente() throws Exception {
    api.settleInvoice(ana, card, "2026-12", "2026-12-17").andExpect(status().isCreated());

    api.call(ana, HttpMethod.POST, "/transactions/" + notebookTx + "/unpay", null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"));
  }

  @Test
  void cartaoInativoAindaAceitaPagamentoDaFaturaPendente() throws Exception {
    JsonNode account = api.get(ana, "/accounts/" + card);
    api.call(
            ana,
            HttpMethod.PUT,
            "/accounts/" + card,
            Map.of(
                "name",
                "Nubank",
                "type",
                "CREDIT_CARD",
                "closingDay",
                10,
                "dueDay",
                17,
                "active",
                false,
                "version",
                account.get("version").asLong()))
        .andExpect(status().isOk());

    api.payInvoice(ana, card, "2026-12", "100.00", "2026-12-10")
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.remaining").value("900.00"));
  }

  @Test
  void faturaSemItensTemValoresZeradosEPagamentoNaoEncontra() throws Exception {
    api.call(ana, HttpMethod.GET, "/accounts/" + card + "/invoices/2027-05", null)
        .andExpect(status().isOk())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.total").value("0.00"))
        .andExpect(jsonPath("$.remaining").value("0.00"))
        .andExpect(jsonPath("$.dueDate").value("2027-05-17"))
        .andExpect(jsonPath("$.items.length()").value(0));
    api.payInvoice(ana, card, "2027-05", "10.00", "2027-05-10").andExpect(status().isNotFound());
  }

  @Test
  void soCartaoDeCreditoTemFatura() throws Exception {
    long checking = api.checking(ana, "Itaú");
    api.call(ana, HttpMethod.GET, "/accounts/" + checking + "/invoices/2026-12", null)
        .andExpect(status().isNotFound());
    api.payInvoice(ana, checking, "2026-12", "10.00", "2026-12-10")
        .andExpect(status().isNotFound());
    assertThat(notebookGroup).isPositive();
  }
}

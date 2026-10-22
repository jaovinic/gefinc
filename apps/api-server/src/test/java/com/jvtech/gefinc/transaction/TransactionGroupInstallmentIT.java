package com.jvtech.gefinc.transaction;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

class TransactionGroupInstallmentIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long checking;
  private long card;
  private long shopping;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    checking = api.checking(ana, "Itaú");
    card = api.card(ana, "Nubank", 10, 17);
    shopping = api.category(ana, "Compras");
  }

  private Map<String, Object> installments(
      long account, String total, int count, String purchase, String firstDue) {
    Map<String, Object> body =
        api.groupBody("INSTALLMENT", "Notebook", total, account, shopping, purchase, firstDue);
    body.put("totalInstallments", count);
    return body;
  }

  private List<String> field(JsonNode group, String name) {
    List<String> values = new ArrayList<>();
    group.get("transactions").forEach(t -> values.add(t.get(name).asText()));
    return values;
  }

  @Test
  void cartaoCompraAntesDoFechamentoGeraQuatroParcelasIguaisAPartirDaFaturaDoMes()
      throws Exception {
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            installments(card, "100.00", 4, "2026-11-05", null))
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.recurrenceType").value("INSTALLMENT"))
        .andExpect(jsonPath("$.totalInstallments").value(4))
        .andExpect(jsonPath("$.totalAmount").value("100.00"))
        .andExpect(jsonPath("$.transactions.length()").value(4))
        .andExpect(jsonPath("$.transactions[0].amount").value("25.00"))
        .andExpect(jsonPath("$.transactions[0].dueDate").value("2026-11-17"))
        .andExpect(jsonPath("$.transactions[0].installmentNumber").value(1))
        .andExpect(jsonPath("$.transactions[0].totalInstallments").value(4))
        .andExpect(jsonPath("$.transactions[3].dueDate").value("2027-02-17"));
  }

  @Test
  void cartaoCompraAposOFechamentoComecaNoMesSeguinte() throws Exception {
    JsonNode group = api.createGroup(ana, installments(card, "100.00", 4, "2026-11-12", null));

    assertThat(field(group, "dueDate"))
        .containsExactly("2026-12-17", "2027-01-17", "2027-02-17", "2027-03-17");
  }

  @Test
  void restoDeCentavosFicaNaUltimaParcelaESomaEExata() throws Exception {
    JsonNode group = api.createGroup(ana, installments(card, "100.00", 3, "2026-11-05", null));

    assertThat(field(group, "amount")).containsExactly("33.33", "33.33", "33.34");
    BigDecimal sum =
        group.get("transactions").findValues("amount").stream()
            .map(n -> new BigDecimal(n.asText()))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    assertThat(sum).isEqualByComparingTo("100.00");
  }

  @Test
  void umaParcelaEUmAvulsoSemErro() throws Exception {
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            installments(card, "59.90", 1, "2026-11-05", null))
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.transactions.length()").value(1))
        .andExpect(jsonPath("$.transactions[0].amount").value("59.90"))
        .andExpect(jsonPath("$.transactions[0].dueDate").value("2026-11-17"));
  }

  @Test
  void carneNaContaCorrenteVenceMensalmenteSemRegraDeFechamento() throws Exception {
    JsonNode group =
        api.createGroup(ana, installments(checking, "300.00", 3, "2026-11-01", "2026-11-10"));

    assertThat(field(group, "dueDate")).containsExactly("2026-11-10", "2026-12-10", "2027-01-10");
    assertThat(field(group, "amount")).containsOnly("100.00");
  }

  @Test
  void foraDoCartaoExigeOPrimeiroVencimento() throws Exception {
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            installments(checking, "300.00", 3, "2026-11-01", null))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='firstDueDate')]").exists());
  }

  @Test
  void pagarSoAParcelaDoisMantemAsDemaisPendentes() throws Exception {
    JsonNode group = api.createGroup(ana, installments(card, "100.00", 3, "2026-11-05", null));
    long second = group.get("transactions").get(1).get("id").asLong();

    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + second + "/pay",
            Map.of("paymentDate", "2026-12-10"))
        .andExpect(status().isOk());

    JsonNode after = api.get(ana, "/transaction-groups/" + group.get("id").asLong());
    assertThat(field(after, "status")).containsExactly("PENDING", "PAID", "PENDING");
  }

  @Test
  void quantidadeDeParcelasObrigatoriaELimitadaETotalPrecisaCobrirUmCentavoPorParcela()
      throws Exception {
    Map<String, Object> noCount =
        api.groupBody("INSTALLMENT", "Notebook", "100.00", card, shopping, "2026-11-05", null);
    api.call(ana, HttpMethod.POST, "/transaction-groups", noCount)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='totalInstallments')]").exists());
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            installments(card, "100.00", 121, "2026-11-05", null))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='totalInstallments')]").exists());
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            installments(card, "0.01", 2, "2026-11-05", null))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='totalAmount')]").exists());
  }

  @Test
  void cento_e_vinte_parcelasSaoAceitas() throws Exception {
    JsonNode group = api.createGroup(ana, installments(card, "1200.00", 120, "2026-11-05", null));
    assertThat(group.get("transactions")).hasSize(120);
    assertThat(group.get("transactions").get(119).get("dueDate").asText()).isEqualTo("2036-10-17");
  }
}

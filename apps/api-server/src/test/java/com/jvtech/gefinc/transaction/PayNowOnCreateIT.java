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
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * "Pagar agora" na criação: a despesa avulsa já nasce paga e sai do saldo. "Hoje" nos testes é
 * 10/11/2026 (America/Sao_Paulo).
 */
class PayNowOnCreateIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long checking;
  private long cash;
  private long card;
  private long food;
  private long salary;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    checking = api.checking(ana, "Itaú");
    cash = api.account(ana, "Carteira", "CASH", null, null).get("id").asLong();
    card = api.card(ana, "Nubank", 10, 17);
    food = api.category(ana, "Alimentação");
    salary = api.category(ana, "Salário");
  }

  private Map<String, Object> body(String type, long account, long category, String due) {
    return api.groupBody(type, "Mercado", "150.00", account, category, due, due);
  }

  private Map<String, Object> withPayNow(Map<String, Object> body, Object payNow) {
    body.put("payNow", payNow);
    return body;
  }

  private BigDecimal balance(long account) throws Exception {
    return new BigDecimal(api.balanceOf(ana, account));
  }

  private void assertRefused(Map<String, Object> body) throws Exception {
    int groups = count("transaction_groups");
    int transactions = count("transactions");
    api.call(ana, HttpMethod.POST, "/transaction-groups", body)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='payNow')]").exists());
    assertThat(count("transaction_groups")).isEqualTo(groups);
    assertThat(count("transactions")).isEqualTo(transactions);
  }

  private int count(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  @Test
  void despesaAvulsaDeHojeNasceNaContaCorrentePagaESaiDoSaldo() throws Exception {
    BigDecimal before = balance(checking);

    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            withPayNow(body("VARIABLE", checking, food, "2026-11-10"), true))
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.transactions[0].status").value("PAID"))
        .andExpect(jsonPath("$.transactions[0].paymentDate").value("2026-11-10"));

    assertThat(balance(checking)).isEqualByComparingTo(before.subtract(new BigDecimal("150.00")));
  }

  @Test
  void despesaEmDinheiroTambemNascePaga() throws Exception {
    BigDecimal before = balance(cash);

    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            withPayNow(body("VARIABLE", cash, food, "2026-11-10"), true))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.transactions[0].status").value("PAID"));

    assertThat(balance(cash)).isEqualByComparingTo(before.subtract(new BigDecimal("150.00")));
  }

  @Test
  void vencimentoPassadoUsaOVencimentoComoDataDePagamento() throws Exception {
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            withPayNow(body("VARIABLE", checking, food, "2026-11-05"), true))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.transactions[0].status").value("PAID"))
        .andExpect(jsonPath("$.transactions[0].paymentDate").value("2026-11-05"));
  }

  @Test
  void parceladoEmUmaParcelaTrataComoAvulso() throws Exception {
    Map<String, Object> body = body("INSTALLMENT", checking, food, "2026-11-10");
    body.put("totalInstallments", 1);

    api.call(ana, HttpMethod.POST, "/transaction-groups", withPayNow(body, true))
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.transactions.length()").value(1))
        .andExpect(jsonPath("$.transactions[0].status").value("PAID"))
        .andExpect(jsonPath("$.transactions[0].paymentDate").value("2026-11-10"));
  }

  @Test
  void semPayNowOuComFalsoContinuaPendenteESaldoInalterado() throws Exception {
    BigDecimal before = balance(checking);

    JsonNode omitted = api.createGroup(ana, body("VARIABLE", checking, food, "2026-11-10"));
    JsonNode explicit =
        api.createGroup(ana, withPayNow(body("VARIABLE", checking, food, "2026-11-10"), false));
    JsonNode nulled =
        api.createGroup(ana, withPayNow(body("VARIABLE", checking, food, "2026-11-10"), null));

    for (JsonNode group : new JsonNode[] {omitted, explicit, nulled}) {
      assertThat(group.get("transactions").get(0).get("status").asText()).isEqualTo("PENDING");
      assertThat(group.get("transactions").get(0).has("paymentDate")).isFalse();
    }
    assertThat(balance(checking)).isEqualByComparingTo(before);
  }

  @Test
  void cartaoDeCreditoRecusaPayNow() throws Exception {
    assertRefused(withPayNow(body("VARIABLE", card, food, "2026-11-10"), true));
  }

  @Test
  void receitaRecusaPayNow() throws Exception {
    assertRefused(withPayNow(body("VARIABLE", checking, salary, "2026-11-10"), true));
  }

  @Test
  void fixoRecusaPayNow() throws Exception {
    assertRefused(withPayNow(body("FIXED", checking, food, "2026-11-10"), true));
  }

  @Test
  void parceladoComDuasOuMaisParcelasRecusaPayNow() throws Exception {
    Map<String, Object> body = body("INSTALLMENT", checking, food, "2026-11-10");
    body.put("totalInstallments", 3);
    assertRefused(withPayNow(body, true));
  }

  @Test
  void vencimentoFuturoRecusaPayNow() throws Exception {
    assertRefused(withPayNow(body("VARIABLE", checking, food, "2026-11-11"), true));
  }

  @Test
  void payNowRecusadoNaoGravaNadaMesmoComSaldoIntacto() throws Exception {
    BigDecimal before = balance(checking);
    assertRefused(withPayNow(body("VARIABLE", checking, food, "2026-12-01"), true));
    assertThat(balance(checking)).isEqualByComparingTo(before);
  }
}

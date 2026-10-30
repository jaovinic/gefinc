package com.jvtech.gefinc.dashboard;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Saldo por conta e total, acumulado até hoje (10/11/2026). Itaú (conta bancária), Carteira
 * (dinheiro) e Nubank (cartão vinculado ao Itaú, fecha dia 10 e vence dia 17).
 */
class BalanceIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long itau;
  private long wallet;
  private long nubank;
  private long salary;
  private long food;
  private long shopping;

  /** O token de acesso expira com o relógio: depois de avançá-lo, entra de novo. */
  private TestUser relogin() throws Exception {
    return new TestUser(
        ana.id(),
        ana.email(),
        new TestUsers(mockMvc, objectMapper)
            .login(ana.email(), TestUsers.PASSWORD)
            .get("accessToken")
            .asText());
  }

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    itau = api.checking(ana, "Itaú");
    wallet = api.account(ana, "Carteira", "CASH", null, null).get("id").asLong();
    nubank = api.cardOn(ana, "Nubank", 10, 17, itau).get("id").asLong();
    salary = api.category(ana, "Salário");
    food = api.category(ana, "Alimentação");
    shopping = api.category(ana, "Compras");
  }

  private JsonNode balances(TestUser user) throws Exception {
    return api.json(
        api.call(user, HttpMethod.GET, "/balances", null)
            .andExpect(status().isOk())
            .andExpect(matchesContract()));
  }

  private JsonNode balances() throws Exception {
    return balances(ana);
  }

  private static String of(JsonNode balances, long accountId) {
    for (JsonNode a : balances.get("accounts")) {
      if (a.get("accountId").asLong() == accountId) {
        return a.get("balance").asText();
      }
    }
    throw new IllegalStateException("Conta fora do saldo: " + accountId);
  }

  private long idOf(JsonNode group) {
    return group.get("transactions").get(0).get("id").asLong();
  }

  private JsonNode income(long account, String amount, String due) throws Exception {
    return api.createGroup(
        ana, api.variableBody("Receita", amount, account, salary, "2026-11-01", due));
  }

  private JsonNode expense(long account, String amount, String due) throws Exception {
    return api.createGroup(
        ana, api.variableBody("Despesa", amount, account, food, "2026-11-01", due));
  }

  private void pay(long txId, String date) throws Exception {
    api.call(ana, HttpMethod.POST, "/transactions/" + txId + "/pay", Map.of("paymentDate", date))
        .andExpect(status().isOk());
  }

  @Test
  void semMovimentoOsSaldosSaoZeroECartaoNaoApareceComoConta() throws Exception {
    JsonNode b = balances();

    assertThat(b.get("asOf").asText()).isEqualTo("2026-11-10");
    assertThat(b.get("total").asText()).isEqualTo("0.00");
    assertThat(b.get("unlinkedCardPayments").asText()).isEqualTo("0.00");
    assertThat(b.get("accounts")).hasSize(2);
    assertThat(of(b, itau)).isEqualTo("0.00");
    assertThat(of(b, wallet)).isEqualTo("0.00");
    for (JsonNode a : b.get("accounts")) {
      assertThat(a.get("openingBalance").asText()).isEqualTo("0.00");
      assertThat(a.get("active").asBoolean()).isTrue();
      assertThat(a.get("type").asText()).isIn("CHECKING", "CASH");
    }
  }

  @Test
  void saldoInicialFazParteDoSaldoETotal() throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", "Nubank PJ");
    body.put("type", "CHECKING");
    body.put("holderType", "PJ");
    body.put("openingBalance", "1500.50");
    long pj = api.postAccount(ana, body).get("id").asLong();
    income(itau, "200.00", "2026-11-05");

    JsonNode b = balances();

    assertThat(of(b, pj)).isEqualTo("1500.50");
    assertThat(of(b, itau)).isEqualTo("200.00");
    assertThat(b.get("total").asText()).isEqualTo("1700.50");
    for (JsonNode a : b.get("accounts")) {
      if (a.get("accountId").asLong() == pj) {
        assertThat(a.get("openingBalance").asText()).isEqualTo("1500.50");
      }
    }
  }

  @Test
  void saldoInicialNegativoSomaComOsMovimentosEEntraNoTotal() throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", "Conta devedora");
    body.put("type", "CHECKING");
    body.put("holderType", "PF");
    body.put("openingBalance", "-300.00");
    long debtor = api.postAccount(ana, body).get("id").asLong();

    JsonNode inicial = balances();
    assertThat(of(inicial, debtor)).isEqualTo("-300.00");
    assertThat(inicial.get("total").asText()).isEqualTo("-300.00");

    income(debtor, "200.00", "2026-11-05");
    long paid = idOf(expense(debtor, "50.00", "2026-11-06"));
    pay(paid, "2026-11-07");

    JsonNode b = balances();

    assertThat(of(b, debtor)).isEqualTo("-150.00");
    assertThat(b.get("total").asText()).isEqualTo("-150.00");
    for (JsonNode a : b.get("accounts")) {
      if (a.get("accountId").asLong() == debtor) {
        assertThat(a.get("openingBalance").asText()).isEqualTo("-300.00");
      }
    }
  }

  @Test
  void receitaPassadaSomaEFuturaNaoSoma() throws Exception {
    income(itau, "5000.00", "2026-11-05");
    income(itau, "800.00", "2026-11-20");
    income(wallet, "50.00", "2026-11-10");

    JsonNode b = balances();

    assertThat(of(b, itau)).isEqualTo("5000.00");
    assertThat(of(b, wallet)).isEqualTo("50.00");
    assertThat(b.get("total").asText()).isEqualTo("5050.00");
  }

  @Test
  void receitaAntecipadaSomaEEstornoDaAntecipacaoTira() throws Exception {
    long id = idOf(income(itau, "800.00", "2026-11-20"));

    pay(id, "2026-11-10");
    assertThat(of(balances(), itau)).isEqualTo("800.00");

    api.call(ana, HttpMethod.POST, "/transactions/" + id + "/unpay", null)
        .andExpect(status().isOk());
    assertThat(of(balances(), itau)).isEqualTo("0.00");
  }

  @Test
  void receitaFuturaQueChegaPassaASomar() throws Exception {
    income(itau, "800.00", "2026-11-20");
    assertThat(of(balances(), itau)).isEqualTo("0.00");

    clock.advance(Duration.ofDays(10));

    ana = relogin();

    JsonNode b = balances();
    assertThat(b.get("asOf").asText()).isEqualTo("2026-11-20");
    assertThat(of(b, itau)).isEqualTo("800.00");
  }

  @Test
  void despesaPagaSubtraiEPendenteNaoMexe() throws Exception {
    income(itau, "1000.00", "2026-11-01");
    long paid = idOf(expense(itau, "150.00", "2026-11-05"));
    expense(itau, "70.00", "2026-11-25");
    expense(wallet, "30.00", "2026-11-04");
    pay(paid, "2026-11-06");

    JsonNode b = balances();

    assertThat(of(b, itau)).isEqualTo("850.00");
    assertThat(of(b, wallet)).isEqualTo("0.00");
    assertThat(b.get("total").asText()).isEqualTo("850.00");
  }

  @Test
  void despesaPagaComDataFuturaAindaNaoContaEPassaAContarQuandoAdataChega() throws Exception {
    long id = idOf(expense(itau, "150.00", "2026-11-05"));
    pay(id, "2026-11-20");

    assertThat(of(balances(), itau)).isEqualTo("0.00");

    clock.advance(Duration.ofDays(10));

    ana = relogin();
    assertThat(of(balances(), itau)).isEqualTo("-150.00");
  }

  @Test
  void compraPendenteNoCartaoNaoAfetaOSaldo() throws Exception {
    api.decemberPurchase(ana, nubank, shopping, "Notebook", "600.00");

    JsonNode b = balances();

    assertThat(of(b, itau)).isEqualTo("0.00");
    assertThat(b.get("total").asText()).isEqualTo("0.00");
    assertThat(b.get("unlinkedCardPayments").asText()).isEqualTo("0.00");
  }

  @Test
  void pagamentoDeFaturaDebitaAContaVinculadaSoQuandoADataChega() throws Exception {
    api.decemberPurchase(ana, nubank, shopping, "Notebook", "600.00");
    api.decemberPurchase(ana, nubank, shopping, "Tênis", "400.00");

    api.payInvoice(ana, nubank, "2026-12", "300.00", "2026-11-10").andExpect(status().isCreated());
    api.payInvoice(ana, nubank, "2026-12", "200.00", "2026-12-10").andExpect(status().isCreated());

    JsonNode b = balances();
    assertThat(of(b, itau)).isEqualTo("-300.00");
    assertThat(of(b, wallet)).isEqualTo("0.00");

    clock.advance(Duration.ofDays(30)); // 10/12

    ana = relogin();
    assertThat(of(balances(), itau)).isEqualTo("-500.00");
  }

  @Test
  void itemDeCartaoPagoIndividualmenteDebitaUmaVezSo() throws Exception {
    long notebook = idOf(api.decemberPurchase(ana, nubank, shopping, "Notebook", "600.00"));
    api.decemberPurchase(ana, nubank, shopping, "Tênis", "400.00");

    pay(notebook, "2026-11-10");
    assertThat(of(balances(), itau)).isEqualTo("-600.00");

    // O restante da fatura (R$ 400,00) é pago: o item já pago individualmente não é contado de
    // novo.
    api.payInvoice(ana, nubank, "2026-12", "400.00", "2026-11-10").andExpect(status().isCreated());
    assertThat(of(balances(), itau)).isEqualTo("-1000.00");
  }

  @Test
  void itemQuitadoPorPagamentoDeFaturaNaoDuplicaODebito() throws Exception {
    api.decemberPurchase(ana, nubank, shopping, "Notebook", "600.00");
    api.decemberPurchase(ana, nubank, shopping, "Tênis", "400.00");

    api.settleInvoice(ana, nubank, "2026-12", "2026-11-10").andExpect(status().isCreated());

    assertThat(
            jdbc.queryForObject(
                "select count(*) from transactions where settled_by_payment_id is not null",
                Long.class))
        .isEqualTo(2);
    JsonNode b = balances();
    assertThat(of(b, itau)).isEqualTo("-1000.00");
    assertThat(b.get("total").asText()).isEqualTo("-1000.00");
  }

  @Test
  void cartaoSemVinculoVaiParaPagamentosSemContaENaoDebitaConta() throws Exception {
    long notebook = idOf(api.decemberPurchase(ana, nubank, shopping, "Notebook", "600.00"));
    api.decemberPurchase(ana, nubank, shopping, "Tênis", "400.00");
    pay(notebook, "2026-11-10");
    api.payInvoice(ana, nubank, "2026-12", "400.00", "2026-11-10").andExpect(status().isCreated());
    jdbc.update("update accounts set bank_account_id = null where id = ?", nubank);

    JsonNode b = balances();

    assertThat(of(b, itau)).isEqualTo("0.00");
    assertThat(b.get("total").asText()).isEqualTo("0.00");
    assertThat(b.get("unlinkedCardPayments").asText()).isEqualTo("1000.00");
  }

  @Test
  void receitaLegadaEmCartaoEIgnorada() throws Exception {
    long group =
        jdbc.queryForObject(
            "insert into transaction_groups (user_id, description, recurrence_type,"
                + " total_installments, total_amount, account_id, category_id, purchase_date,"
                + " first_due_date) values (?, 'Legado', 'VARIABLE', 1, 100.00, ?, ?,"
                + " '2026-11-05', '2026-11-05') returning id",
            Long.class,
            ana.id(),
            nubank,
            salary);
    jdbc.update(
        "insert into transactions (group_id, user_id, account_id, category_id, installment_number,"
            + " reference_month, amount, due_date, payment_date, status) values (?, ?, ?, ?, 1,"
            + " '2026-11-01', 100.00, '2026-11-05', '2026-11-05', 'PAID')",
        group,
        ana.id(),
        nubank,
        salary);

    JsonNode b = balances();

    assertThat(b.get("total").asText()).isEqualTo("0.00");
    assertThat(b.get("unlinkedCardPayments").asText()).isEqualTo("0.00");
  }

  @Test
  void contaInativaComSaldoDiferenteDeZeroEntraNoTotal() throws Exception {
    income(wallet, "300.00", "2026-11-05");
    api.updateAccount(ana, wallet, Map.of("active", false)).andExpect(status().isOk());

    JsonNode b = balances();

    assertThat(of(b, wallet)).isEqualTo("300.00");
    assertThat(b.get("total").asText()).isEqualTo("300.00");
    for (JsonNode a : b.get("accounts")) {
      if (a.get("accountId").asLong() == wallet) {
        assertThat(a.get("active").asBoolean()).isFalse();
      }
    }
  }

  @Test
  void cadaUsuarioVeSomenteOsProprioSaldos() throws Exception {
    income(itau, "5000.00", "2026-11-05");
    TestUser bia = new TestUsers(mockMvc, objectMapper).registerAndLogin("bia@example.com");
    long biaChecking = api.checking(bia, "Conta da Bia");
    api.createGroup(
        bia,
        api.variableBody(
            "Salário",
            "70.00",
            biaChecking,
            api.category(bia, "Salário"),
            "2026-11-01",
            "2026-11-05"));

    JsonNode b = balances(bia);

    assertThat(b.get("accounts")).hasSize(1);
    assertThat(of(b, biaChecking)).isEqualTo("70.00");
    assertThat(b.get("total").asText()).isEqualTo("70.00");
    assertThat(of(balances(), itau)).isEqualTo("5000.00");
  }

  @Test
  void exigeAutenticacao() throws Exception {
    mockMvc
        .perform(
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/balances"))
        .andExpect(status().isUnauthorized());
  }
}

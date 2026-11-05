package com.jvtech.gefinc.transfer;

import static com.jvtech.gefinc.support.ContractAssertions.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * Efeito das transferências no saldo por conta (GET /balances). Hoje nos testes é 10/11/2026; Itaú
 * começa com R$ 1.000,00 de saldo inicial, Carteira e Inter com zero.
 */
class TransferBalanceIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long itau;
  private long wallet;
  private long inter;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    itau = api.checking(ana, "Itaú");
    api.updateAccount(ana, itau, Map.of("openingBalance", "1000.00")).andExpect(status().isOk());
    wallet = api.cash(ana, "Carteira");
    inter = api.checking(ana, "Inter");
  }

  /** O token de acesso expira com o relógio: depois de avançá-lo, entra de novo. */
  private void relogin() throws Exception {
    ana =
        new TestUser(
            ana.id(),
            ana.email(),
            new TestUsers(mockMvc, objectMapper)
                .login(ana.email(), TestUsers.PASSWORD)
                .get("accessToken")
                .asText());
  }

  private JsonNode balances() throws Exception {
    return api.json(
        api.call(ana, HttpMethod.GET, "/balances", null)
            .andExpect(status().isOk())
            .andExpect(matchesContract()));
  }

  private String balance(long accountId) throws Exception {
    return api.balanceOf(ana, accountId);
  }

  @Test
  void origemDiminuiDestinoAumentaESomaEOTotalFicamIguais() throws Exception {
    JsonNode before = balances();
    assertThat(before.get("total").asText()).isEqualTo("1000.00");

    api.transfer(ana, itau, wallet, "250.00", "2026-11-10");

    JsonNode after = balances();
    assertThat(balance(itau)).isEqualTo("750.00");
    assertThat(balance(wallet)).isEqualTo("250.00");
    assertThat(balance(inter)).isEqualTo("0.00");
    assertThat(after.get("total").asText()).isEqualTo("1000.00");
    assertThat(after.get("unlinkedCardPayments").asText()).isEqualTo("0.00");
    for (JsonNode a : after.get("accounts")) {
      // O saldo inicial não é tocado pela transferência.
      assertThat(a.get("openingBalance").asText())
          .isEqualTo(a.get("accountId").asLong() == itau ? "1000.00" : "0.00");
    }
  }

  @Test
  void transferenciaDeDataFuturaSoContaAPartirDaData() throws Exception {
    JsonNode scheduled = api.transfer(ana, itau, wallet, "300.00", "2026-11-12");
    assertThat(scheduled.get("scheduled").asBoolean()).isTrue();
    assertThat(balance(itau)).isEqualTo("1000.00");
    assertThat(balance(wallet)).isEqualTo("0.00");

    clock.advance(Duration.ofDays(1));
    relogin();
    assertThat(balance(itau)).isEqualTo("1000.00");

    clock.advance(Duration.ofDays(1));
    relogin();
    assertThat(balance(itau)).isEqualTo("700.00");
    assertThat(balance(wallet)).isEqualTo("300.00");
    assertThat(
            api.get(ana, "/transfers/" + scheduled.get("id").asLong()).get("scheduled").asBoolean())
        .isFalse();
  }

  @Test
  void saldoInsuficienteEPermitidoEFicaNegativo() throws Exception {
    api.transfer(ana, wallet, inter, "80.00", "2026-11-10");

    assertThat(balance(wallet)).isEqualTo("-80.00");
    assertThat(balance(inter)).isEqualTo("80.00");
    assertThat(balances().get("total").asText()).isEqualTo("1000.00");
  }

  @Test
  void editarMoveOSaldoEExcluirEstorna() throws Exception {
    JsonNode created = api.transfer(ana, itau, wallet, "100.00", "2026-11-10");
    long id = created.get("id").asLong();

    api.call(
            ana,
            HttpMethod.PUT,
            "/transfers/" + id,
            Map.of(
                "fromAccountId",
                itau,
                "toAccountId",
                inter,
                "amount",
                "40.00",
                "transferDate",
                "2026-11-09",
                "version",
                created.get("version").asLong()))
        .andExpect(status().isOk());
    assertThat(balance(itau)).isEqualTo("960.00");
    assertThat(balance(wallet)).isEqualTo("0.00");
    assertThat(balance(inter)).isEqualTo("40.00");

    api.call(ana, HttpMethod.DELETE, "/transfers/" + id, null).andExpect(status().isNoContent());
    assertThat(balance(itau)).isEqualTo("1000.00");
    assertThat(balance(inter)).isEqualTo("0.00");
  }

  /**
   * Documenta a regra: a conta inativa segue mostrando o saldo real em accounts[], mas o total só
   * soma as ativas. Transferir para uma conta que depois foi inativada tira o valor do total.
   */
  @Test
  void transferirParaContaQueDepoisFoiInativadaTiraOValorDoTotal() throws Exception {
    api.transfer(ana, itau, wallet, "400.00", "2026-11-10");
    assertThat(balances().get("total").asText()).isEqualTo("1000.00");

    api.updateAccount(ana, wallet, Map.of("active", false)).andExpect(status().isOk());

    JsonNode after = balances();
    assertThat(balance(wallet)).isEqualTo("400.00"); // saldo real da inativa
    assertThat(balance(itau)).isEqualTo("600.00");
    assertThat(after.get("total").asText()).isEqualTo("600.00"); // cai do valor transferido
    for (JsonNode a : after.get("accounts")) {
      assertThat(a.get("active").asBoolean()).isEqualTo(a.get("accountId").asLong() != wallet);
    }
  }

  @Test
  void centavosEValoresGrandesSaoExatos() throws Exception {
    api.transfer(ana, itau, wallet, "0.01", "2026-11-10");
    api.transfer(ana, itau, wallet, "0.10", "2026-11-10");
    assertThat(balance(itau)).isEqualTo("999.89");
    assertThat(balance(wallet)).isEqualTo("0.11");

    api.transfer(ana, inter, wallet, "999999999999999.99", "2026-11-10");
    assertThat(balance(inter)).isEqualTo("-999999999999999.99");
    assertThat(balance(wallet)).isEqualTo("1000000000000000.10");
    assertThat(balances().get("total").asText()).isEqualTo("1000.00");
  }

  @Test
  void muitasTransferenciasSomamSemErroDeCentavo() throws Exception {
    for (int i = 0; i < 100; i++) {
      api.transfer(ana, itau, wallet, "0.10", "2026-11-10");
    }
    for (int i = 0; i < 33; i++) {
      api.transfer(ana, wallet, inter, "0.01", "2026-11-10");
    }

    assertThat(balance(itau)).isEqualTo("990.00");
    assertThat(balance(wallet)).isEqualTo("9.67");
    assertThat(balance(inter)).isEqualTo("0.33");
    BigDecimal sum =
        new BigDecimal(balance(itau))
            .add(new BigDecimal(balance(wallet)))
            .add(new BigDecimal(balance(inter)));
    assertThat(sum).isEqualByComparingTo("1000.00");
  }

  @Test
  void transferenciaNaoMexeNoSaldoDeCartaoNemEmPagamentoDeFatura() throws Exception {
    long card = api.cardOn(ana, "Nubank", 10, 17, itau).get("id").asLong();
    long shopping = api.category(ana, "Compras");
    api.decemberPurchase(ana, card, shopping, "Notebook", "600.00");
    api.payInvoice(ana, card, "2026-12", "600.00", "2026-11-10").andExpect(status().isCreated());
    assertThat(balance(itau)).isEqualTo("400.00");

    api.transfer(ana, itau, wallet, "100.00", "2026-11-10");

    assertThat(balance(itau)).isEqualTo("300.00");
    assertThat(balance(wallet)).isEqualTo("100.00");
    assertThat(balances().get("accounts")).hasSize(3); // cartão segue fora da lista
  }
}

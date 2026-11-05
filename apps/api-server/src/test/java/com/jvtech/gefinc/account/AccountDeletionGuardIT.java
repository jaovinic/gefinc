package com.jvtech.gefinc.account;

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

/** Exclusão de conta só sem dados relacionados e prévia de uso (GET /accounts/{id}/usage). */
class AccountDeletionGuardIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private TestUser bia;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    TestUsers users = new TestUsers(mockMvc, objectMapper);
    ana = users.registerAndLogin("ana@example.com");
    bia = users.registerAndLogin("bia@example.com");
  }

  private JsonNode usage(long accountId) throws Exception {
    return api.json(
        api.call(ana, HttpMethod.GET, "/accounts/" + accountId + "/usage", null)
            .andExpect(status().isOk())
            .andExpect(matchesContract()));
  }

  @Test
  void contaSemDadosPodeSerExcluidaEAPreviaDiz() throws Exception {
    long id = api.checking(ana, "Itaú");
    JsonNode usage = usage(id);
    assertThat(usage.get("canDelete").asBoolean()).isTrue();
    assertThat(usage.get("transactionCount").asLong()).isZero();
    assertThat(usage.get("invoicePaymentCount").asLong()).isZero();
    assertThat(usage.get("transferCount").asLong()).isZero();
    assertThat(usage.get("linkedCards")).isEmpty();
    assertThat(usage.get("openingBalance").asText()).isEqualTo("0.00");

    api.call(ana, HttpMethod.DELETE, "/accounts/" + id, null).andExpect(status().isNoContent());
    api.call(ana, HttpMethod.GET, "/accounts/" + id + "/usage", null)
        .andExpect(status().isNotFound());
  }

  @Test
  void contaInativaSemUsoPodeSerExcluida() throws Exception {
    long id = api.checking(ana, "Antiga");
    api.updateAccount(ana, id, Map.of("active", false)).andExpect(status().isOk());
    api.call(ana, HttpMethod.DELETE, "/accounts/" + id, null).andExpect(status().isNoContent());
  }

  @Test
  void contaComLancamentosNaoEExcluidaMasPodeSerInativada() throws Exception {
    long id = api.checking(ana, "Itaú");
    long lazer = api.category(ana, "Lazer");
    api.createGroup(
        ana, api.variableBody("Cinema", "40.00", id, lazer, "2026-11-08", "2026-11-08"));
    api.createGroup(
        ana, api.variableBody("Teatro", "60.00", id, lazer, "2026-11-09", "2026-11-09"));

    JsonNode usage = usage(id);
    assertThat(usage.get("canDelete").asBoolean()).isFalse();
    assertThat(usage.get("transactionCount").asLong()).isEqualTo(2);

    api.call(ana, HttpMethod.DELETE, "/accounts/" + id, null)
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("ACCOUNT_IN_USE"))
        .andExpect(jsonPath("$.transactionCount").value(2))
        .andExpect(jsonPath("$.invoicePaymentCount").value(0))
        .andExpect(jsonPath("$.linkedCardCount").value(0))
        .andExpect(jsonPath("$.hasOpeningBalance").value(false))
        .andExpect(
            jsonPath("$.detail")
                .value(
                    "Esta conta não pode ser excluída: possui 2 lançamentos."
                        + " Inative a conta para preservar o histórico."));
    assertThat(api.get(ana, "/accounts/" + id).get("active").asBoolean()).isTrue();

    api.updateAccount(ana, id, Map.of("active", false))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(false));
  }

  @Test
  void contaComSaldoInicialNaoEExcluidaAteZerar() throws Exception {
    long id = api.checking(ana, "Itaú");
    api.updateAccount(ana, id, Map.of("openingBalance", "500.00")).andExpect(status().isOk());

    assertThat(usage(id).get("canDelete").asBoolean()).isFalse();
    assertThat(usage(id).get("openingBalance").asText()).isEqualTo("500.00");
    api.call(ana, HttpMethod.DELETE, "/accounts/" + id, null)
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("ACCOUNT_IN_USE"))
        .andExpect(jsonPath("$.hasOpeningBalance").value(true))
        .andExpect(
            jsonPath("$.detail")
                .value(
                    "Esta conta não pode ser excluída: possui saldo inicial de R$ 500,00."
                        + " Zere o saldo inicial para poder excluir."));

    api.updateAccount(ana, id, Map.of("openingBalance", "0.00")).andExpect(status().isOk());
    assertThat(usage(id).get("canDelete").asBoolean()).isTrue();
    api.call(ana, HttpMethod.DELETE, "/accounts/" + id, null).andExpect(status().isNoContent());
  }

  @Test
  void contaBancariaComCartoesVinculadosListaOsCartoes() throws Exception {
    long bank = api.checking(ana, "Itaú");
    JsonNode nubank = api.cardOn(ana, "Nubank", 10, 17, bank);
    api.cardOn(ana, "Inter", 5, 12, bank);

    JsonNode usage = usage(bank);
    assertThat(usage.get("canDelete").asBoolean()).isFalse();
    assertThat(usage.get("linkedCards")).hasSize(2);
    assertThat(usage.get("linkedCards").get(0).get("name").asText()).isEqualTo("Inter");
    assertThat(usage.get("linkedCards").get(1).get("id").asLong())
        .isEqualTo(nubank.get("id").asLong());

    api.call(ana, HttpMethod.DELETE, "/accounts/" + bank, null)
        .andExpect(status().isConflict())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.code").value("ACCOUNT_IN_USE"))
        .andExpect(jsonPath("$.linkedCardCount").value(2))
        .andExpect(
            jsonPath("$.detail")
                .value(
                    "Esta conta não pode ser excluída: possui cartões vinculados (Inter, Nubank)."
                        + " Inative a conta para preservar o histórico."));
  }

  @Test
  void contaComTransferenciaNaoEExcluidaNaOrigemNemNoDestino() throws Exception {
    long source = api.checking(ana, "Itaú");
    long target = api.account(ana, "Carteira", "CASH", null, null).get("id").asLong();
    long idle = api.checking(ana, "Inter");
    JsonNode transfer = api.transfer(ana, source, target, "25.00", "2026-11-08");
    JsonNode back = api.transfer(ana, target, source, "5.00", "2026-11-09");

    for (long id : new long[] {source, target}) {
      JsonNode usage = usage(id);
      assertThat(usage.get("canDelete").asBoolean()).isFalse();
      assertThat(usage.get("transactionCount").asLong()).isZero();
      assertThat(usage.get("transferCount").asLong()).isEqualTo(2);
      api.call(ana, HttpMethod.DELETE, "/accounts/" + id, null)
          .andExpect(status().isConflict())
          .andExpect(matchesContract())
          .andExpect(jsonPath("$.code").value("ACCOUNT_IN_USE"))
          .andExpect(jsonPath("$.transferCount").value(2))
          .andExpect(
              jsonPath("$.detail")
                  .value(
                      "Esta conta não pode ser excluída: possui 2 transferências."
                          + " Inative a conta para preservar o histórico."));
    }
    assertThat(usage(idle).get("canDelete").asBoolean()).isTrue();

    // Inativar continua possível e excluir a transferência libera a conta.
    api.updateAccount(ana, source, Map.of("active", false)).andExpect(status().isOk());
    api.call(ana, HttpMethod.DELETE, "/transfers/" + transfer.get("id").asLong(), null)
        .andExpect(status().isNoContent());
    assertThat(usage(target).get("transferCount").asLong()).isEqualTo(1);
    api.call(ana, HttpMethod.DELETE, "/transfers/" + back.get("id").asLong(), null)
        .andExpect(status().isNoContent());
    api.updateAccount(ana, target, Map.of("active", false)).andExpect(status().isOk());
    api.call(ana, HttpMethod.DELETE, "/accounts/" + target, null).andExpect(status().isNoContent());
  }

  @Test
  void contaComUmaTransferenciaESaldoInicialListaOsDoisMotivos() throws Exception {
    long source = api.checking(ana, "Itaú");
    long target = api.checking(ana, "Inter");
    api.updateAccount(ana, source, Map.of("openingBalance", "500.00")).andExpect(status().isOk());
    api.transfer(ana, source, target, "25.00", "2026-11-08");

    api.call(ana, HttpMethod.DELETE, "/accounts/" + source, null)
        .andExpect(status().isConflict())
        .andExpect(
            jsonPath("$.detail")
                .value(
                    "Esta conta não pode ser excluída: possui 1 transferência e saldo inicial de"
                        + " R$ 500,00. Inative a conta para preservar o histórico."));
  }

  @Test
  void cartaoComFaturaPagaNaoEExcluido() throws Exception {
    long card = api.card(ana, "Nubank", 10, 17);
    long shopping = api.category(ana, "Compras");
    api.decemberPurchase(ana, card, shopping, "Notebook", "600.00");
    api.payInvoice(ana, card, "2026-12", "600.00", "2026-12-17").andExpect(status().isCreated());

    api.call(ana, HttpMethod.DELETE, "/accounts/" + card, null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ACCOUNT_IN_USE"))
        .andExpect(jsonPath("$.invoicePaymentCount").value(1));

    // sem lançamentos, só o pagamento de fatura ainda bloqueia
    jdbc.update("delete from transactions where account_id = ?", card);
    jdbc.update("delete from transaction_groups where account_id = ?", card);
    JsonNode usage = usage(card);
    assertThat(usage.get("transactionCount").asLong()).isZero();
    assertThat(usage.get("invoicePaymentCount").asLong()).isEqualTo(1);
    assertThat(usage.get("canDelete").asBoolean()).isFalse();
    api.call(ana, HttpMethod.DELETE, "/accounts/" + card, null)
        .andExpect(status().isConflict())
        .andExpect(
            jsonPath("$.detail")
                .value(
                    "Esta conta não pode ser excluída: possui 1 pagamento de fatura."
                        + " Inative a conta para preservar o histórico."));
  }

  @Test
  void usoEExclusaoDeContaDeOutroUsuarioRespondem404() throws Exception {
    long anaAccount = api.checking(ana, "Itaú");
    api.call(bia, HttpMethod.GET, "/accounts/" + anaAccount + "/usage", null)
        .andExpect(status().isNotFound());
    api.call(bia, HttpMethod.DELETE, "/accounts/" + anaAccount, null)
        .andExpect(status().isNotFound());
    assertThat(api.get(ana, "/accounts/" + anaAccount).get("id").asLong()).isEqualTo(anaAccount);
  }
}

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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Relógio dos testes: 2026-11-10 (hoje); horizonte dos lançamentos fixos: 2027-10. */
class TransactionGroupFixedVariableIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long checking;
  private long card;
  private long mercado;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    checking = api.checking(ana, "Itaú");
    card = api.card(ana, "Nubank", 10, 17);
    mercado = api.category(ana, "Alimentação");
  }

  private List<String> dueDates(JsonNode group) {
    List<String> dates = new ArrayList<>();
    group.get("transactions").forEach(t -> dates.add(t.get("dueDate").asText()));
    return dates;
  }

  @Test
  void avulsoForaDoCartaoGeraUmLancamentoNoVencimentoInformado() throws Exception {
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            api.variableBody("Mercado", "150.00", checking, mercado, "2026-11-08", "2026-11-12"))
        .andExpect(status().isCreated())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.recurrenceType").value("VARIABLE"))
        .andExpect(jsonPath("$.totalAmount").value("150.00"))
        .andExpect(jsonPath("$.transactions.length()").value(1))
        .andExpect(jsonPath("$.transactions[0].dueDate").value("2026-11-12"))
        .andExpect(jsonPath("$.transactions[0].amount").value("150.00"))
        .andExpect(jsonPath("$.transactions[0].status").value("PENDING"))
        .andExpect(jsonPath("$.transactions[0].overdue").value(false))
        .andExpect(jsonPath("$.transactions[0].description").value("Mercado"));
  }

  @Test
  void avulsoForaDoCartaoExigeOVencimento() throws Exception {
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            api.variableBody("Mercado", "150.00", checking, mercado, "2026-11-08", null))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='firstDueDate')]").exists());
  }

  @Test
  void avulsoNoCartaoUsaOVencimentoDaFaturaEIgnoraOInformado() throws Exception {
    // compra dia 12, após o fechamento (dia 10): vence dia 17 do mês seguinte
    JsonNode group =
        api.createGroup(
            ana, api.variableBody("Livro", "80.00", card, mercado, "2026-11-12", "2026-11-20"));

    assertThat(dueDates(group)).containsExactly("2026-12-17");
  }

  @Test
  void fixoForaDoCartaoGeraDozeOcorrenciasMensais() throws Exception {
    JsonNode group =
        api.createGroup(
            ana, api.fixedBody("Internet", "99.90", checking, mercado, "2026-11-05", "2026-11-05"));

    assertThat(group.get("transactions")).hasSize(12);
    assertThat(dueDates(group).get(0)).isEqualTo("2026-11-05");
    assertThat(dueDates(group).get(11)).isEqualTo("2027-10-05");
    assertThat(group.get("transactions").get(0).get("installmentNumber").asInt()).isEqualTo(1);
    assertThat(group.get("transactions").get(11).get("installmentNumber").asInt()).isEqualTo(12);
    assertThat(group.get("transactions").findValuesAsText("amount")).containsOnly("99.90");
  }

  @Test
  void fixoNoDia31PreservaODiaOriginalUsandoOUltimoDiaDoMes() throws Exception {
    JsonNode group =
        api.createGroup(
            ana,
            api.fixedBody("Aluguel", "1000.00", checking, mercado, "2026-11-01", "2026-12-31"));

    assertThat(dueDates(group)).startsWith("2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31");
  }

  @Test
  void fixoNoCartaoVenceNoDiaDaFaturaDeCadaMes() throws Exception {
    // assinatura comprada dia 5 (antes do fechamento dia 10): vence dia 17 de cada mês
    JsonNode group =
        api.createGroup(
            ana, api.fixedBody("Streaming", "39.90", card, mercado, "2026-11-05", "2026-11-05"));

    assertThat(group.get("transactions")).hasSize(12);
    assertThat(dueDates(group).get(0)).isEqualTo("2026-11-17");
    assertThat(dueDates(group).get(11)).isEqualTo("2027-10-17");
  }

  @Test
  void fixoNoCartaoComCompraAposOFechamentoComecaNoMesSeguinte() throws Exception {
    JsonNode group =
        api.createGroup(
            ana, api.fixedBody("Streaming", "39.90", card, mercado, "2026-11-12", null));

    assertThat(dueDates(group).get(0)).isEqualTo("2026-12-17");
    assertThat(dueDates(group).get(group.get("transactions").size() - 1)).isEqualTo("2027-10-17");
  }

  @Test
  void alterarOValorValeSoDeUmMesEmDiante() throws Exception {
    JsonNode group =
        api.createGroup(
            ana, api.fixedBody("Internet", "99.90", checking, mercado, "2026-11-05", "2026-11-05"));
    long id = group.get("id").asLong();
    long paidMarch = group.get("transactions").get(4).get("id").asLong();
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + paidMarch + "/pay",
            Map.of("paymentDate", "2027-03-05"))
        .andExpect(status().isOk());

    JsonNode changed =
        api.json(
            api.call(
                    ana,
                    HttpMethod.POST,
                    "/transaction-groups/" + id + "/amount-changes",
                    Map.of("fromMonth", "2027-02", "amount", "120.00"))
                .andExpect(status().isOk())
                .andExpect(matchesContract()));

    List<String> amounts = changed.get("transactions").findValuesAsText("amount");
    assertThat(amounts.subList(0, 3)).containsOnly("99.90"); // nov, dez, jan
    assertThat(amounts.get(3)).isEqualTo("120.00"); // fev
    assertThat(amounts.get(4)).isEqualTo("99.90"); // mar: já paga, preservada
    assertThat(amounts.subList(5, 12)).containsOnly("120.00");
    assertThat(changed.get("totalAmount").asText()).isEqualTo("120.00");
  }

  @Test
  void alterarOValorForaDaJanelaGeradaERecusado() throws Exception {
    JsonNode group =
        api.createGroup(
            ana, api.fixedBody("Internet", "99.90", checking, mercado, "2026-11-05", "2026-11-05"));

    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups/" + group.get("id").asLong() + "/amount-changes",
            Map.of("fromMonth", "2028-06", "amount", "120.00"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.errors[?(@.field=='fromMonth')]").exists());
  }

  @Test
  void encerrarRemoveAsPendentesPosterioresEPreservaAsPagas() throws Exception {
    JsonNode group =
        api.createGroup(
            ana, api.fixedBody("Internet", "99.90", checking, mercado, "2026-11-05", "2026-11-05"));
    long id = group.get("id").asLong();
    long paidJune = group.get("transactions").get(7).get("id").asLong();
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + paidJune + "/pay",
            Map.of("paymentDate", "2027-06-05"))
        .andExpect(status().isOk());

    JsonNode ended =
        api.json(
            api.call(
                    ana,
                    HttpMethod.POST,
                    "/transaction-groups/" + id + "/end",
                    Map.of("endMonth", "2027-03"))
                .andExpect(status().isOk())
                .andExpect(matchesContract()));

    assertThat(ended.get("endMonth").asText()).isEqualTo("2027-03");
    List<String> dates = dueDates(ended);
    assertThat(dates).contains("2027-03-05", "2027-06-05"); // a paga posterior fica
    assertThat(dates).doesNotContain("2027-04-05", "2027-05-05", "2027-07-05");
  }

  @Test
  void soLancamentoFixoPodeSerEncerradoOuTerValorAlterado() throws Exception {
    JsonNode group =
        api.createGroup(
            ana,
            api.variableBody("Mercado", "10.00", checking, mercado, "2026-11-08", "2026-11-12"));
    long id = group.get("id").asLong();

    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups/" + id + "/end",
            Map.of("endMonth", "2026-12"))
        .andExpect(status().isUnprocessableEntity());
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups/" + id + "/amount-changes",
            Map.of("fromMonth", "2026-11", "amount", "11.00"))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void editaDescricaoECategoriaDasOcorrenciasPendentes() throws Exception {
    long lazer = api.category(ana, "Lazer");
    JsonNode group =
        api.createGroup(
            ana, api.fixedBody("Internet", "99.90", checking, mercado, "2026-11-05", "2026-11-05"));
    long paidFirst = group.get("transactions").get(0).get("id").asLong();
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + paidFirst + "/pay",
            Map.of("paymentDate", "2026-11-05"))
        .andExpect(status().isOk());

    JsonNode updated =
        api.json(
            api.call(
                    ana,
                    HttpMethod.PUT,
                    "/transaction-groups/" + group.get("id").asLong(),
                    Map.of(
                        "description",
                        "Internet fibra",
                        "categoryId",
                        lazer,
                        "version",
                        group.get("version").asLong()))
                .andExpect(status().isOk())
                .andExpect(matchesContract()));

    assertThat(updated.get("description").asText()).isEqualTo("Internet fibra");
    assertThat(updated.get("categoryId").asLong()).isEqualTo(lazer);
    assertThat(updated.get("transactions").get(0).get("categoryId").asLong())
        .isEqualTo(mercado); // paga
    assertThat(updated.get("transactions").get(1).get("categoryId").asLong()).isEqualTo(lazer);
  }
}

package com.jvtech.gefinc.transaction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * FR-014: mudar os dias do cartão recalcula só as ocorrências fixas pendentes com vencimento
 * futuro.
 */
class CardDaysChangeIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long card;
  private long food;
  private long checking;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    card = api.card(ana, "Nubank", 10, 17);
    checking = api.checking(ana, "Itaú");
    food = api.category(ana, "Alimentação");
  }

  private void changeDays(long accountId, int closingDay, int dueDay) throws Exception {
    api.updateAccount(ana, accountId, Map.of("closingDay", closingDay, "dueDay", dueDay))
        .andExpect(status().isOk());
  }

  private List<String> dueDates(long groupId) throws Exception {
    List<String> dates = new ArrayList<>();
    api.get(ana, "/transaction-groups/" + groupId)
        .get("transactions")
        .forEach(t -> dates.add(t.get("dueDate").asText()));
    return dates;
  }

  /** Assinatura fixa comprada dia 5 de outubro (vence dia 17 de cada mês), criada em 10/10. */
  private long subscriptionCreatedInOctober() throws Exception {
    clock.set(java.time.Instant.parse("2026-10-10T15:00:00Z"));
    long id =
        api.createGroup(ana, api.fixedBody("Streaming", "39.90", card, food, "2026-10-05", null))
            .get("id")
            .asLong();
    clock.set(java.time.Instant.parse("2026-11-10T15:00:00Z")); // hoje: 10/11
    return id;
  }

  @Test
  void mudancaDoDiaDeVencimentoRecalculaSoOsFuturosPendentes() throws Exception {
    long id = subscriptionCreatedInOctober();
    assertThat(dueDates(id)).startsWith("2026-10-17", "2026-11-17", "2026-12-17");
    JsonNode nov = api.get(ana, "/transaction-groups/" + id).get("transactions").get(1);
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + nov.get("id").asLong() + "/pay",
            Map.of("paymentDate", "2026-11-09"))
        .andExpect(status().isOk());

    changeDays(card, 10, 20);

    List<String> dates = dueDates(id);
    assertThat(dates.get(0)).isEqualTo("2026-10-17"); // vencimento já passou (<= hoje): mantém
    assertThat(dates.get(1)).isEqualTo("2026-11-17"); // paga: mantém
    assertThat(dates.get(2)).isEqualTo("2026-12-20");
    assertThat(dates.get(11)).isEqualTo("2027-09-20");
    assertThat(dates).doesNotHaveDuplicates();
  }

  @Test
  void avulsoParcelaEPagasNaoMudamECompraNovaSegueOsNovosDias() throws Exception {
    JsonNode avulso =
        api.createGroup(ana, api.variableBody("Livro", "80.00", card, food, "2026-11-12", null));
    assertThat(dueDates(avulso.get("id").asLong())).containsExactly("2026-12-17");

    changeDays(card, 10, 25);

    assertThat(dueDates(avulso.get("id").asLong())).containsExactly("2026-12-17"); // já registrada
    JsonNode novo =
        api.createGroup(ana, api.variableBody("Camisa", "120.00", card, food, "2026-11-12", null));
    assertThat(dueDates(novo.get("id").asLong())).containsExactly("2026-12-25");
  }

  @Test
  void mudancaDoFechamentoDeslocaAsOcorrenciasSemColidirNoMesmoGrupo() throws Exception {
    long id = subscriptionCreatedInOctober();

    // compra dia 5 agora cai depois do fechamento (dia 4): todas vão para a fatura do mês seguinte
    changeDays(card, 4, 17);

    List<String> dates = dueDates(id);
    assertThat(dates.get(0)).isEqualTo("2026-10-17"); // passada: mantém
    assertThat(dates.get(1)).isEqualTo("2026-12-17"); // novembro -> dezembro
    assertThat(dates).doesNotHaveDuplicates();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(DISTINCT reference_month) = count(*) FROM transactions WHERE group_id = ?",
                Boolean.class,
                id))
        .isTrue();
  }

  @Test
  void contaForaDoCartaoNaoEAfetadaEOutrosGruposTampouco() throws Exception {
    long other =
        api.createGroup(
                ana, api.fixedBody("Internet", "99.90", checking, food, "2026-11-05", "2026-11-05"))
            .get("id")
            .asLong();
    long id = subscriptionCreatedInOctober();
    List<String> before = dueDates(other);

    changeDays(card, 10, 20);

    assertThat(dueDates(other)).isEqualTo(before);
    assertThat(dueDates(id).get(2)).isEqualTo("2026-12-20");
    clock.advance(Duration.ofDays(1));
  }

  @Test
  void faturaComPagamentoRegistradoMantemAOcorrenciaComADataAntiga() throws Exception {
    long id = subscriptionCreatedInOctober();
    // a fatura de dezembro (R$ 39,90) recebe um pagamento parcial
    api.payInvoice(ana, card, "2026-12", "10.00", "2026-11-10").andExpect(status().isCreated());

    changeDays(card, 10, 20);

    List<String> dates = dueDates(id);
    assertThat(dates.get(1)).isEqualTo("2026-11-20"); // novembro, sem pagamento: recalculada
    assertThat(dates.get(2)).isEqualTo("2026-12-17"); // dezembro, fatura com pagamento: mantida
    assertThat(dates.get(3)).isEqualTo("2027-01-20");
  }
}

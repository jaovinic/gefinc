package com.jvtech.gefinc.dashboard;

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

/** Receitas do mês no painel. Relógio dos testes: 10/11/2026. */
class DashboardBalanceIT extends IntegrationTestBase {

  private TestApi api;
  private TestUser ana;
  private long checking;
  private long card;
  private long salary;
  private long food;

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
    checking = api.checking(ana, "Itaú");
    card = api.card(ana, "Nubank", 10, 17);
    salary = api.category(ana, "Salário");
    food = api.category(ana, "Alimentação");
  }

  private JsonNode dashboard() throws Exception {
    return api.json(
        api.call(ana, HttpMethod.GET, "/dashboard?month=2026-11", null)
            .andExpect(status().isOk())
            .andExpect(matchesContract()));
  }

  private void pay(JsonNode group, String date) throws Exception {
    api.call(
            ana,
            HttpMethod.POST,
            "/transactions/" + group.get("transactions").get(0).get("id").asLong() + "/pay",
            Map.of("paymentDate", date))
        .andExpect(status().isOk());
  }

  @Test
  void receitaComVencimentoAteHojeEntraSozinhaEFuturaFicaPendente() throws Exception {
    api.createGroup(
        ana, api.variableBody("Salário", "5000.00", checking, salary, "2026-11-05", "2026-11-05"));
    api.createGroup(
        ana, api.variableBody("Freela", "800.00", checking, salary, "2026-11-08", "2026-11-20"));
    JsonNode rent =
        api.createGroup(
            ana,
            api.variableBody("Aluguel", "1200.00", checking, food, "2026-11-01", "2026-11-05"));
    pay(rent, "2026-11-05");

    JsonNode d = dashboard();
    assertThat(d.get("totalIncome").asText()).isEqualTo("5800.00");
    assertThat(d.get("totalReceived").asText()).isEqualTo("5000.00");
    assertThat(d.get("totalPaid").asText()).isEqualTo("1200.00");
    assertThat(d.has("balance")).isFalse();
    // Receita não vira despesa: o total do mês continua só com despesas.
    assertThat(d.get("totalMonth").asText()).isEqualTo("1200.00");
  }

  @Test
  void receitaFuturaPassaARecebidaQuandoADataChega() throws Exception {
    api.createGroup(
        ana, api.variableBody("Freela", "800.00", checking, salary, "2026-11-08", "2026-11-20"));
    assertThat(dashboard().get("totalReceived").asText()).isEqualTo("0.00");

    clock.advance(java.time.Duration.ofDays(10));

    ana = relogin();

    assertThat(dashboard().get("totalReceived").asText()).isEqualTo("800.00");
  }

  @Test
  void receitaRecebidaNaoEntraNoTotalPagoDeDespesas() throws Exception {
    api.createGroup(
        ana, api.variableBody("Salário", "100.00", checking, salary, "2026-11-05", "2026-11-05"));
    JsonNode d = dashboard();
    assertThat(d.get("totalPaid").asText()).isEqualTo("0.00");
    assertThat(d.get("totalReceived").asText()).isEqualTo("100.00");
  }

  @Test
  void receitaEmCartaoERejeitada() throws Exception {
    api.call(
            ana,
            HttpMethod.POST,
            "/transaction-groups",
            api.variableBody("Estorno", "10.00", card, salary, "2026-11-05", null))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(matchesContract())
        .andExpect(jsonPath("$.errors[?(@.field=='accountId')]").exists());
    assertThat(dashboard().get("totalIncome").asText()).isEqualTo("0.00");
  }

  @Test
  void receitaLegadaEmCartaoNaoEntraNosTotaisDeReceitaDoPainel() throws Exception {
    api.createGroup(
        ana, api.variableBody("Salário", "100.00", checking, salary, "2026-11-05", "2026-11-05"));
    legacyCardIncome("PENDING", "250.00");
    legacyCardIncome("PAID", "400.00");

    JsonNode d = dashboard();

    assertThat(d.get("totalIncome").asText()).isEqualTo("100.00");
    assertThat(d.get("totalReceived").asText()).isEqualTo("100.00");
  }

  /** Receita em cartão de 05/11, como existia antes da regra, inserida direto no banco. */
  private void legacyCardIncome(String status, String amount) {
    long group =
        jdbc.queryForObject(
            "insert into transaction_groups (user_id, description, recurrence_type,"
                + " total_installments, total_amount, account_id, category_id, purchase_date,"
                + " first_due_date) values (?, 'Legado', 'VARIABLE', 1, "
                + amount
                + ", ?, ?,"
                + " '2026-11-05', '2026-11-05') returning id",
            Long.class,
            ana.id(),
            card,
            salary);
    jdbc.update(
        "insert into transactions (group_id, user_id, account_id, category_id, installment_number,"
            + " reference_month, amount, due_date, status, payment_date) values (?, ?, ?, ?, 1,"
            + " '2026-11-01', "
            + amount
            + ", '2026-11-05', ?,"
            + " case when ? = 'PAID' then '2026-11-05'::date else null end)",
        group,
        ana.id(),
        card,
        salary,
        status,
        status);
  }
}

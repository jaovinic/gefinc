package com.jvtech.gefinc.transaction;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * A listagem não pode fazer uma consulta por ocorrência atrasada para descobrir se a categoria é de
 * receita: o número de comandos SQL por requisição não cresce com a quantidade de ocorrências.
 * "Hoje" nos testes é 10/11/2026 (America/Sao_Paulo).
 */
class TransactionListQueryCountIT extends IntegrationTestBase {

  @Autowired private EntityManagerFactory entityManagerFactory;

  private TestApi api;
  private TestUser ana;
  private long checking;
  private long card;
  private long salary;
  private long food;

  @BeforeEach
  void init() throws Exception {
    api = new TestApi(mockMvc, objectMapper);
    ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    checking = api.checking(ana, "Itaú");
    card = api.card(ana, "Nubank", 10, 17);
    salary = api.category(ana, "Salário");
    food = api.category(ana, "Alimentação");
  }

  private void overdueExpenses(int count, int offset) throws Exception {
    for (int i = 0; i < count; i++) {
      api.createGroup(
          ana,
          api.variableBody(
              "Conta " + (offset + i), "10.00", checking, food, "2026-11-01", "2026-11-05"));
    }
  }

  /** Comandos SQL preparados durante uma listagem completa do mês. */
  private long statementsOfList() throws Exception {
    Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    statistics.setStatisticsEnabled(true);
    try {
      statistics.clear();
      JsonNode page = api.get(ana, "/transactions?size=200");
      assertThat(page.get("content").size()).isPositive();
      return statistics.getPrepareStatementCount();
    } finally {
      statistics.setStatisticsEnabled(false);
    }
  }

  @Test
  void listaComMuitasAtrasadasEReceitaLegadaEmCartaoUsaOMesmoNumeroDeConsultas() throws Exception {
    legacyIncome(ana.id(), card, salary, "2026-11-01");
    overdueExpenses(3, 0);
    long few = statementsOfList();

    overdueExpenses(47, 3);
    long many = statementsOfList();

    assertThat(many).isEqualTo(few);

    JsonNode page = api.get(ana, "/transactions?size=200");
    assertThat(page.get("totalElements").asInt()).isEqualTo(51);
    int overdue = 0;
    for (JsonNode t : page.get("content")) {
      boolean income = t.get("categoryId").asLong() == salary;
      assertThat(t.get("overdue").asBoolean()).isEqualTo(!income);
      if (t.get("overdue").asBoolean()) {
        overdue++;
      }
    }
    assertThat(overdue).isEqualTo(50);
  }

  /** Receita pendente e vencida em cartão, como existia antes da regra. */
  private void legacyIncome(long userId, long account, long category, String due) {
    long group =
        jdbc.queryForObject(
            "insert into transaction_groups (user_id, description, recurrence_type,"
                + " total_installments, total_amount, account_id, category_id, purchase_date,"
                + " first_due_date) values (?, 'Legado', 'VARIABLE', 1, 100.00, ?, ?, ?::date,"
                + " ?::date) returning id",
            Long.class,
            userId,
            account,
            category,
            due,
            due);
    jdbc.update(
        "insert into transactions (group_id, user_id, account_id, category_id, installment_number,"
            + " reference_month, amount, due_date, status) values (?, ?, ?, ?, 1,"
            + " date_trunc('month', ?::date)::date, 100.00, ?::date, 'PENDING')",
        group,
        userId,
        account,
        category,
        due,
        due);
  }
}

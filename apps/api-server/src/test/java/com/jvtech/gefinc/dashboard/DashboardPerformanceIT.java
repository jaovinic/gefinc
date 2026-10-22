package com.jvtech.gefinc.dashboard;

import static org.assertj.core.api.Assertions.assertThat;

import com.jvtech.gefinc.support.IntegrationTestBase;
import com.jvtech.gefinc.support.TestApi;
import com.jvtech.gefinc.support.TestUsers;
import com.jvtech.gefinc.support.TestUsers.TestUser;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/**
 * SC-006: painel e projeção em até 2 s (p95) para um usuário com 5 anos de histórico (~6.000
 * lançamentos); o mesmo vale para o resumo de vencimentos dos lembretes e para o pagamento com
 * chave de idempotência (feature 002).
 */
class DashboardPerformanceIT extends IntegrationTestBase {

  private static final int SAMPLES = 20;
  private static final long LIMIT_MS = 2000;

  @Test
  void painelEProjecaoRespondemEmMenosDeDoisSegundosComSeisMilLancamentos() throws Exception {
    TestApi api = new TestApi(mockMvc, objectMapper);
    TestUser ana = new TestUsers(mockMvc, objectMapper).registerAndLogin("ana@example.com");
    long checking = api.checking(ana, "Itaú");
    long card = api.card(ana, "Nubank", 10, 17);
    long food = api.category(ana, "Alimentação");
    long shopping = api.category(ana, "Compras");

    // 120 grupos × 50 ocorrências = 6.000 lançamentos distribuídos em 60 meses, metade no cartão
    jdbc.update(
        "INSERT INTO transaction_groups (user_id, description, recurrence_type, total_installments, total_amount,"
            + " account_id, category_id, purchase_date, first_due_date)"
            + " SELECT ?, 'Carga ' || n, 'INSTALLMENT', 50, 500.00, CASE WHEN n % 2 = 0 THEN ? ELSE ? END,"
            + " CASE WHEN n % 3 = 0 THEN ? ELSE ? END, DATE '2022-01-01', DATE '2022-01-17'"
            + " FROM generate_series(1, 120) AS n",
        ana.id(), card, checking, food, shopping);
    jdbc.update(
        "INSERT INTO transactions (group_id, user_id, account_id, category_id, installment_number, reference_month,"
            + " amount, due_date, status, payment_date)"
            + " SELECT g.id, g.user_id, g.account_id, g.category_id, s.n,"
            + " (DATE '2022-01-01' + ((s.n - 1) || ' months')::interval)::date,"
            + " 10.00, (DATE '2022-01-17' + ((s.n - 1) || ' months')::interval)::date,"
            + " CASE WHEN s.n % 4 = 0 THEN 'PAID' ELSE 'PENDING' END,"
            + " CASE WHEN s.n % 4 = 0 THEN (DATE '2022-01-17' + ((s.n - 1) || ' months')::interval)::date END"
            + " FROM transaction_groups g, generate_series(1, 50) AS s(n) WHERE g.user_id = ?",
        ana.id());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM transactions WHERE user_id = ?", Integer.class, ana.id()))
        .isEqualTo(6000);

    for (String url :
        List.of(
            "/dashboard?month=2024-03",
            "/invoices/projection?from=2022-01&months=24",
            "/cashflow?from=2022-01&months=24",
            "/accounts?includeInactive=true",
            "/due-summary?from=2026-11-10&to=2026-12-31")) {
      api.call(ana, HttpMethod.GET, url, null).andReturn(); // aquecimento
      List<Long> times = new ArrayList<>();
      for (int i = 0; i < SAMPLES; i++) {
        long start = System.nanoTime();
        int status = api.call(ana, HttpMethod.GET, url, null).andReturn().getResponse().getStatus();
        times.add((System.nanoTime() - start) / 1_000_000);
        assertThat(status).isEqualTo(200);
      }
      Collections.sort(times);
      long p95 = times.get((int) Math.ceil(SAMPLES * 0.95) - 1);
      assertThat(p95).as("p95 de %s em ms: %s", url, times).isLessThan(LIMIT_MS);
    }

    // Pagamento com chave de idempotência: o filtro não pode degradar a operação.
    List<Long> pending =
        jdbc.queryForList(
            "SELECT t.id FROM transactions t JOIN accounts a ON a.id = t.account_id AND a.user_id = t.user_id"
                + " WHERE t.user_id = ? AND t.status = 'PENDING' AND a.type <> 'CREDIT_CARD'"
                + " ORDER BY t.id LIMIT ?",
            Long.class,
            ana.id(),
            SAMPLES);
    List<Long> payTimes = new ArrayList<>();
    for (Long id : pending) {
      long start = System.nanoTime();
      int status =
          mockMvc
              .perform(
                  org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(
                          "/transactions/" + id + "/pay")
                      .header("Authorization", ana.bearer())
                      .header("Idempotency-Key", java.util.UUID.randomUUID().toString())
                      .contentType("application/json")
                      .content("{\"paymentDate\":\"2026-11-10\"}"))
              .andReturn()
              .getResponse()
              .getStatus();
      payTimes.add((System.nanoTime() - start) / 1_000_000);
      assertThat(status).isEqualTo(200);
    }
    Collections.sort(payTimes);
    assertThat(payTimes.get((int) Math.ceil(payTimes.size() * 0.95) - 1))
        .as("p95 do pagamento com chave de idempotência em ms: %s", payTimes)
        .isLessThan(LIMIT_MS);
  }
}
